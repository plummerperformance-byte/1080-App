/**
 * 1080 Sprint xlsx parser
 * =======================
 * Input: a File (from the browser) or an ArrayBuffer.
 * Output: structured sprint data ready to save to Supabase.
 *
 * What it does:
 *   1. Opens the xlsx with SheetJS.
 *   2. Finds the "Raw Data <date>" sheet.
 *   3. Extracts the 1 kHz time / speed / distance / force sampled data
 *      for the sprint (trimmed to the sprint start marker in column E).
 *   4. Fits the Samozino exponential v(t) = Vmax * (1 - exp(-t/τ))
 *      via iterative non-linear least squares to find Vmax and τ.
 *   5. Derives F0, V0, Pmax, slope, RFmax, DRF from the fitted profile.
 *   6. Computes splits at 10/20/30/40 m (with DNF guards).
 *   7. Extracts the 1080's own Step Table for per-step length/velocity.
 *   8. Classifies the sprint profile (force/velocity/balanced).
 *
 * Notes on accuracy:
 *   - Samozino F-V only valid for ~unresisted sprints. The parser flags
 *     the result as invalid if avg load > 2 kg over body mass.
 *   - Step events from the 1080 are length/freq only — GCT/stiffness fields
 *     remain null until a second sensor provides them.
 */

import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedSprint {
  /** Which export format the file came from. */
  format: "dashboard" | "raw_tablet";
  /**
   * Where the sprint started in the source file's own timeline, in seconds.
   * Dashboard exports are pre-trimmed (0.0 always). Raw-tablet exports
   * include walk-up/warm-up before the sprint, so this is the offset that
   * was subtracted to make all metrics sprint-relative.
   */
  sprintStartOffsetS: number;
  /** Body mass used by the 1080 for force calcs (kg) */
  bodyMassKg: number;
  /** Mean load applied by the 1080 (kg) */
  avgLoadKg: number;
  /** Max distance reached in the sprint (m), after re-normalizing to start=0 */
  maxDistM: number;
  /** Sprint duration (s), sprint-relative */
  durationS: number;
  /** Count of raw samples used (after trimming to the sprint window) */
  sampleCount: number;

  /** Core sprint metrics */
  metrics: SprintMetricsOut;
  /** Per-step data (from 1080's own step table OR derived from velocity). */
  steps: StepEventOut[];
  /**
   * Whether `steps` was derived from velocity oscillation (true) vs read
   * from the 1080's own Step Table (false). GCT/stiffness stay null either
   * way — they require a second sensor.
   */
  stepsDerived: boolean;
  /** Sampled v(t) and x(t) for charting (max ~300 points) */
  chartSamples: ChartSample[];

  /**
   * Whether the Dashboard-only metrics (rfMaxPct, drf, peakPowerW,
   * peakPowerRelWkg) were populated. False for raw_tablet exports.
   */
  hasDerivedColumns: boolean;

  /** Validity flags and classification */
  fvProfileValid: boolean;
  classification: {
    sprintProfile: "Acceleration" | "Late Acceleration" | "Transition" | "Max Velocity" | "Partial";
    fvBalance: "High Force Deficit" | "Low Force Deficit" | "Balanced" | "Low Velocity Deficit" | "High Velocity Deficit" | null;
  };
  warnings: string[];
}

export interface SprintMetricsOut {
  maxVms: number;
  timeToMaxVS: number;
  distToMaxVM: number;
  timeTo90PctVS: number;
  distTo90PctVM: number;
  split10mS: number | null;
  split20mS: number | null;
  split30mS: number | null;
  split40mS: number | null;
  tau: number;
  f0N: number;
  f0RelNkg: number;
  v0Ms: number;
  pmaxW: number;
  pmaxRelWkg: number;
  fvSlope: number;
  fvImbalancePct: number | null;
  /** Null when the source file doesn't have an RF% column (raw-tablet exports). */
  rfMaxPct: number | null;
  /** Null when the source file doesn't have RF% (raw-tablet exports). */
  drf: number | null;
  peakAccelMs2: number;
  /** Null when the source file doesn't have a power column (raw-tablet exports). */
  peakPowerW: number | null;
  /** Null when the source file doesn't have a power column (raw-tablet exports). */
  peakPowerRelWkg: number | null;
  vDropoffPct: number;
  totalSteps: number;
  stepFreqHz: number | null;
  avgStepLengthM: number | null;
  stepLengthStdM: number | null;
}

export interface StepEventOut {
  stepNumber: number;
  tStrikeS: number | null;
  stepLengthM: number | null;
  stepVelocityMs: number | null;
  stepFrequencyHz: number | null;
  peakForceN: number | null;
  /** True when derived from velocity oscillation, false when read from Step Table. */
  derived: boolean;
}

export interface ChartSample {
  t: number;
  v: number;
  x: number;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface Parse1080Options {
  /**
   * Athlete body mass in kg. Required for raw-tablet exports (the tablet
   * export doesn't contain body mass). For Dashboard exports this is read
   * from the workbook's col L if not provided.
   */
  bodyMassKgOverride?: number;
}

export async function parse1080File(
  file: File | ArrayBuffer,
  options?: Parse1080Options,
): Promise<ParsedSprint> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });

  const format = detectFormat(wb);
  if (format === "unknown") {
    throw new Error(
      "Unrecognised 1080 export format. Expected either the Dashboard workbook " +
        "(sheet named 'Raw Data <date>') or the raw tablet export (first sheet " +
        "with headers time(ms) / load(g) / speed / position(mm)).",
    );
  }

  const warnings: string[] = [];
  let samples: Sample[];
  // Load values in grams, same index as samples. Sliced alongside samples
  // when sprint-start detection trims the front of the stream.
  let loadsG: number[];
  let bodyMassKg: number;
  // Only the Dashboard format has rich derived columns (RF%, power, force);
  // we keep a handle on the raw sheet to read them. For raw-tablet we can't.
  let derivedSheet: XLSX.WorkSheet | null = null;

  if (format === "dashboard") {
    const rawSheetName = wb.SheetNames.find((n) => n.startsWith("Raw Data"));
    derivedSheet = wb.Sheets[rawSheetName as string];
    const extracted = extractDashboardSamples(derivedSheet);
    samples = extracted.samples;
    loadsG = extracted.loads;
    const fileBodyMass = pickFirstNumber(derivedSheet, "L");
    bodyMassKg = options?.bodyMassKgOverride ?? fileBodyMass ?? 0;
    if (!bodyMassKg) {
      throw new Error(
        "Dashboard export: could not read body mass from col L and no override provided.",
      );
    }
  } else {
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const extracted = extractRawTabletSamples(firstSheet);
    samples = extracted.samples;
    loadsG = extracted.loads;
    if (options?.bodyMassKgOverride == null || options.bodyMassKgOverride <= 0) {
      throw new Error(
        "Raw tablet export: athlete body mass required (the tablet export " +
          "doesn't include it). Set body_mass_kg on the athlete or override on upload.",
      );
    }
    bodyMassKg = options.bodyMassKgOverride;
    warnings.push(
      "Raw tablet export: RF%, DRF and peak power are not available in this " +
        "format (they're post-processed columns added by the 1080 Dashboard " +
        "export). Kinematic metrics (Max V, splits, F₀/V₀/Pmax) are fine.",
    );
  }

  if (samples.length < 100) {
    throw new Error(
      `Sprint has only ${samples.length} samples — too short to analyse. ` +
        `Expected >1000 at 1 kHz sampling.`,
    );
  }

  // ---------- Sprint-start auto-detection ------------------------------
  // The raw tablet export contains walk-up, sprint, and walk-back in one
  // continuous stream. The Dashboard export is usually pre-trimmed, but we
  // run auto-detect on both to be safe — for pre-trimmed data it returns 0
  // (or very close) so it's a no-op. After detection, we slice the samples
  // and re-normalize t and x so that sprint-start == (0, 0). Every
  // downstream metric (splits, τ fit, max-V time) is then sprint-relative
  // by construction.
  // Only act on sprint-start detection when the offset is meaningful
  // (≥0.5 s). Smaller offsets are usually just sensor jitter and the
  // Dashboard-format data is effectively pre-trimmed — we don't want to
  // disturb those metrics.
  const startIdxCandidate = detectSprintStart(samples);
  const startIdx =
    startIdxCandidate > 0 && samples[startIdxCandidate].t >= 0.5
      ? startIdxCandidate
      : 0;
  const sprintStartOffsetS = startIdx > 0 ? samples[startIdx].t : 0;
  if (startIdx > 0) {
    const t0 = samples[startIdx].t;
    const x0 = samples[startIdx].x;
    samples = samples.slice(startIdx).map((s) => ({
      t: s.t - t0,
      v: s.v,
      x: s.x - x0,
    }));
    loadsG = loadsG.slice(startIdx);
    if (samples.length < 100) {
      throw new Error(
        `After sprint-start detection the remaining sprint has only ${samples.length} samples. ` +
          `Source file may not contain a clean sprint.`,
      );
    }
    warnings.push(
      `Sprint auto-detected starting at +${sprintStartOffsetS.toFixed(2)} s in the source file. ` +
        `All metrics below are sprint-relative.`,
    );
  }

  const avgLoadKg = loadsG.length
    ? loadsG.reduce((s, v) => s + v, 0) / loadsG.length / 1000
    : 0;

  const maxDistM = Math.max(...samples.map((s) => s.x));
  const durationS = samples[samples.length - 1].t;

  // ---------- Core sprint metrics --------------------------------------
  const maxVms = Math.max(...samples.map((s) => s.v));
  const maxVIdx = samples.findIndex((s) => s.v === maxVms);
  const timeToMaxVS = samples[maxVIdx].t;
  const distToMaxVM = samples[maxVIdx].x;

  // Time / dist to 90% max V
  const target90 = 0.9 * maxVms;
  const i90 = samples.findIndex((s) => s.v >= target90);
  const timeTo90PctVS = i90 >= 0 ? samples[i90].t : 0;
  const distTo90PctVM = i90 >= 0 ? samples[i90].x : 0;

  // ---------- Samozino exponential fit ---------------------------------
  // v(t) = Vmax * (1 - exp(-t/τ))  — fit τ by least squares to the
  // acceleration phase only (t ≤ timeToMaxV). Including the post-MaxV
  // plateau + deceleration tail biases τ upward and under-estimates F0/Pmax.
  // This matches the 1080 Excel template's Solver range and standard
  // Samozino practice.
  const fit = fitExponential(samples, maxVms, timeToMaxVS);
  const tau = fit.tau;

  // Acceleration & force derivation (F = m*a, horizontal only here since
  // the 1080 raw force already nets out tether and drag contributions).
  const peakAccelMs2 = (maxVms / tau);  // a(0) from the model
  const peakPowerW: number | null = derivedSheet
    ? peakSampleField(derivedSheet, "P", samples.length)
    : null;
  const peakPowerRelWkg: number | null =
    peakPowerW != null ? peakPowerW / bodyMassKg : null;

  // Samozino F0 / V0 / Pmax / slope
  // Use the simple form for an unresisted exponential fit:
  //   F0 per kg = Vmax / τ  (net horizontal force at t=0 per unit mass)
  //   V0 = Vmax
  //   Pmax per kg = F0 * V0 / 4
  //   Slope (N/kg per m/s) = -F0_rel / V0
  const v0Ms = maxVms;
  const f0RelNkg = maxVms / tau;
  const f0N = f0RelNkg * bodyMassKg;
  const pmaxRelWkg = (f0RelNkg * v0Ms) / 4;
  const pmaxW = pmaxRelWkg * bodyMassKg;
  const fvSlope = -f0RelNkg / v0Ms;

  // RFmax and DRF from the raw RF% column (R) vs speed (H). Only available
  // for Dashboard format — raw tablet exports don't have RF%.
  const { rfMaxPct, drf }: { rfMaxPct: number | null; drf: number | null } =
    derivedSheet
      ? computeRfMetrics(derivedSheet, samples)
      : { rfMaxPct: null, drf: null };

  // ---------- Splits ----------------------------------------------------
  const split10 = firstSampleAtDist(samples, 10);
  const split20 = firstSampleAtDist(samples, 20);
  const split30 = firstSampleAtDist(samples, 30);
  const split40 = firstSampleAtDist(samples, 40);

  // ---------- Velocity drop-off ----------------------------------------
  const endIdx = samples.length - 1;
  const windowStart = Math.max(0, endIdx - 20);
  const endV =
    samples.slice(windowStart).reduce((s, v) => s + v.v, 0) / (endIdx - windowStart + 1);
  const vDropoffPct = ((maxVms - endV) / maxVms) * 100;

  // ---------- Steps -----------------------------------------------------
  // Prefer the 1080's own Step Table when present (Dashboard format);
  // fall back to deriving steps from velocity oscillation for raw-tablet
  // exports or Dashboard files that omit the Step Table.
  let steps: StepEventOut[] = extractStepTable(wb);
  let stepsDerived = false;
  if (steps.length === 0) {
    steps = deriveStepsFromVelocity(samples);
    stepsDerived = true;
  }
  const stepFreqHz = steps.length
    ? steps
        .map((s) => s.stepFrequencyHz ?? 0)
        .filter(Boolean)
        .reduce((a, b, _, arr) => a + b / arr.length, 0) || null
    : null;

  const lengths = steps.map((s) => s.stepLengthM ?? 0).filter(Boolean);
  const avgStepLengthM =
    lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null;
  const stepLengthStdM =
    lengths.length && avgStepLengthM !== null
      ? Math.sqrt(
          lengths.reduce((s, v) => s + (v - avgStepLengthM) ** 2, 0) / lengths.length,
        )
      : null;

  // ---------- Sampled data for charts ----------------------------------
  const chartSamples = downsample(samples, 300);

  // ---------- Validity & classification --------------------------------
  const fvProfileValid = avgLoadKg <= bodyMassKg * 0.10; // ≤10% BM counts as "essentially unresisted" (Samozino practice)
  if (!fvProfileValid) {
    warnings.push(
      `Avg load ${avgLoadKg.toFixed(1)} kg (>10% BM) — F-V profile is NOT a true ` +
        `Samozino profile. Treat F0/V0/Pmax as resisted-sprint descriptors only.`,
    );
  }
  if (maxDistM < 40) {
    warnings.push(`Sprint ended at ${maxDistM.toFixed(1)} m — splits beyond that are null.`);
  }

  // Weakest-split logic (elite ratios: 10/40=0.34, 20-10/40=0.24, 30-20/40=0.20, 40-30/40=0.20)
  let sprintProfile: ParsedSprint["classification"]["sprintProfile"] = "Partial";
  if (split40 !== null && split10 !== null && split20 !== null && split30 !== null) {
    const d10 = (split10 - split40 * 0.34) / (split40 * 0.34);
    const d20 = (split20 - split10 - split40 * 0.24) / (split40 * 0.24);
    const d30 = (split30 - split20 - split40 * 0.20) / (split40 * 0.20);
    const d40 = (split40 - split30 - split40 * 0.20) / (split40 * 0.20);
    const mx = Math.max(d10, d20, d30, d40);
    if (mx === d10) sprintProfile = "Acceleration";
    else if (mx === d20) sprintProfile = "Late Acceleration";
    else if (mx === d30) sprintProfile = "Transition";
    else sprintProfile = "Max Velocity";
  }

  // F-v balance (Jimenez-Reyes bands from the literature)
  let fvBalance: ParsedSprint["classification"]["fvBalance"] = null;
  if (fvProfileValid) {
    // Optimal F-v slope for sprinting is ~-0.5 (rough rule of thumb for peak power).
    // Imbalance % = |actual_slope / optimal_slope| * 100.
    const optimalSlope = -0.5;
    const imbalance = Math.abs(fvSlope / optimalSlope) * 100;
    if (imbalance <= 60) fvBalance = "High Force Deficit";
    else if (imbalance <= 90) fvBalance = "Low Force Deficit";
    else if (imbalance <= 110) fvBalance = "Balanced";
    else if (imbalance <= 140) fvBalance = "Low Velocity Deficit";
    else fvBalance = "High Velocity Deficit";
  }

  const fvImbalancePct = fvProfileValid ? Math.abs(fvSlope / -0.5) * 100 : null;

  const hasDerivedColumns = derivedSheet != null;

  return {
    format,
    sprintStartOffsetS,
    bodyMassKg,
    avgLoadKg,
    maxDistM,
    durationS,
    sampleCount: samples.length,
    metrics: {
      maxVms,
      timeToMaxVS,
      distToMaxVM,
      timeTo90PctVS,
      distTo90PctVM,
      split10mS: split10,
      split20mS: split20,
      split30mS: split30,
      split40mS: split40,
      tau,
      f0N,
      f0RelNkg,
      v0Ms,
      pmaxW,
      pmaxRelWkg,
      fvSlope,
      fvImbalancePct,
      rfMaxPct,
      drf,
      peakAccelMs2,
      peakPowerW,
      peakPowerRelWkg,
      vDropoffPct,
      totalSteps: steps.length,
      stepFreqHz,
      avgStepLengthM,
      stepLengthStdM,
    } as SprintMetricsOut,
    steps,
    stepsDerived,
    chartSamples,
    hasDerivedColumns,
    fvProfileValid,
    classification: { sprintProfile, fvBalance },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Sample { t: number; v: number; x: number }

/**
 * Pull samples from Dashboard-format Raw Data columns G (time_s), H (speed_m/s),
 * I (distance_m), K (load_g) in parallel. Stops at the first blank time.
 */
function extractDashboardSamples(
  ws: XLSX.WorkSheet,
): { samples: Sample[]; loads: number[] } {
  const samples: Sample[] = [];
  const loads: number[] = [];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let r = 1; r <= range.e.r; r++) { // 0-indexed, row 2 of sheet
    const g = ws[XLSX.utils.encode_cell({ c: 6, r })]?.v; // G
    const h = ws[XLSX.utils.encode_cell({ c: 7, r })]?.v; // H
    const i = ws[XLSX.utils.encode_cell({ c: 8, r })]?.v; // I
    const k = ws[XLSX.utils.encode_cell({ c: 10, r })]?.v; // K
    if (g === undefined || g === null || g === "") break;
    const t = Number(g);
    const v = Number(h);
    const x = Number(i);
    if (!Number.isFinite(t) || !Number.isFinite(v) || !Number.isFinite(x)) continue;
    samples.push({ t, v, x });
    loads.push(typeof k === "number" && Number.isFinite(k) ? k : 0);
  }
  return { samples, loads };
}

function pickFirstNumber(ws: XLSX.WorkSheet, col: string): number | null {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const colIdx = XLSX.utils.decode_col(col);
  for (let r = 1; r <= Math.min(10, range.e.r); r++) {
    const v = ws[XLSX.utils.encode_cell({ c: colIdx, r })]?.v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function meanColumn(ws: XLSX.WorkSheet, col: string, n: number): number {
  const colIdx = XLSX.utils.decode_col(col);
  let sum = 0, count = 0;
  for (let r = 1; r <= n; r++) {
    const v = ws[XLSX.utils.encode_cell({ c: colIdx, r })]?.v;
    if (typeof v === "number" && Number.isFinite(v)) { sum += v; count++; }
  }
  return count ? sum / count : 0;
}

function peakSampleField(ws: XLSX.WorkSheet, col: string, n: number): number {
  const colIdx = XLSX.utils.decode_col(col);
  let peak = -Infinity;
  for (let r = 1; r <= n; r++) {
    const v = ws[XLSX.utils.encode_cell({ c: colIdx, r })]?.v;
    if (typeof v === "number" && v > peak) peak = v;
  }
  return peak === -Infinity ? 0 : peak;
}

/**
 * Fit v(t) = Vmax * (1 - exp(-t/τ)) to the acceleration phase only
 * (samples where t ≤ tMax) by grid-then-golden-section search on
 * τ ∈ [0.1, 3.0]. Fast and stable for typical sprint data.
 *
 * Fitting only the accel phase avoids the plateau/deceleration tail biasing
 * τ upward; this matches the 1080 Excel template's Solver range.
 */
function fitExponential(
  samples: Sample[],
  vmax: number,
  tMax: number,
): { tau: number; rss: number } {
  const accelSamples = samples.filter((s) => s.t <= tMax);
  const rss = (tau: number) => {
    let s = 0;
    for (const { t, v } of accelSamples) {
      const pred = vmax * (1 - Math.exp(-t / tau));
      s += (v - pred) ** 2;
    }
    return s;
  };
  // Grid search
  let best = { tau: 1.0, rss: Infinity };
  for (let tau = 0.1; tau <= 3.0; tau += 0.05) {
    const r = rss(tau);
    if (r < best.rss) best = { tau, rss: r };
  }
  // Golden-section refine
  let a = Math.max(0.05, best.tau - 0.1);
  let b = best.tau + 0.1;
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const c = b - phi * (b - a);
    const d = a + phi * (b - a);
    if (rss(c) < rss(d)) b = d;
    else a = c;
  }
  const tau = (a + b) / 2;
  return { tau, rss: rss(tau) };
}

/**
 * Compute RFmax and DRF. RFmax = peak RF% in first 0.5s. DRF = slope of
 * RF% vs V in the post-acceleration phase.
 */
function computeRfMetrics(ws: XLSX.WorkSheet, samples: Sample[]): { rfMaxPct: number; drf: number } {
  const rfVals: number[] = [];
  const vVals: number[] = [];
  const rCol = XLSX.utils.decode_col("R");
  const hCol = XLSX.utils.decode_col("H");
  for (let r = 1; r <= samples.length; r++) {
    const rf = ws[XLSX.utils.encode_cell({ c: rCol, r })]?.v;
    const v = ws[XLSX.utils.encode_cell({ c: hCol, r })]?.v;
    if (typeof rf === "number" && typeof v === "number") {
      rfVals.push(rf);
      vVals.push(v);
    }
  }
  const rfMaxPct = Math.max(...rfVals) * 100;
  // DRF: linear regression slope of RF% (as %) on V, only over v > 30% of max
  const vMax = Math.max(...vVals);
  const mask = vVals.map((v) => v >= 0.3 * vMax);
  const xs = vVals.filter((_, i) => mask[i]);
  const ys = rfVals.filter((_, i) => mask[i]).map((v) => v * 100);
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const drf = den !== 0 ? num / den : 0;
  return { rfMaxPct, drf };
}

function firstSampleAtDist(samples: Sample[], dist: number): number | null {
  if (samples[samples.length - 1].x < dist) return null;
  for (const s of samples) if (s.x >= dist) return s.t;
  return null;
}

function extractStepTable(wb: XLSX.WorkBook): StepEventOut[] {
  const name = wb.SheetNames.find((n) => n === "Step Table" || n.toLowerCase().includes("step"));
  if (!name) return [];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
  return rows
    .map((row, i) => {
      // Helper — key lookup tolerant to whitespace variations
      const get = (...keys: string[]): any => {
        for (const k of keys) {
          for (const actual of Object.keys(row)) {
            if (actual.trim().toLowerCase() === k.trim().toLowerCase()) return row[actual];
          }
        }
        return null;
      };
      const num = Number(get("Step Count", "Step", "Step Number", "step") ?? i + 1);
      const tStrike = get("Time (s)", "Time", "t(s)");     // usually absent in 1080 Step Table
      const stepLen = get("Step Distance", "Step Length", "Length (m)", "length");
      const stepVel = get("Step Velocity", "Velocity (m/s)", "Velocity");
      const stepFreq = get("Step Frequency", "Frequency (Hz)", "Frequency");
      return {
        stepNumber: num,
        tStrikeS: numOrNull(tStrike),
        stepLengthM: numOrNull(stepLen),
        stepVelocityMs: numOrNull(stepVel),
        stepFrequencyHz: numOrNull(stepFreq),
        peakForceN: null,
        derived: false,
      };
    })
    .filter((s) => Number.isFinite(s.stepNumber) && s.stepNumber > 0);
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Detect which 1080 export format a workbook is.
 *
 * - "dashboard": post-processed Excel with a "Raw Data <date>" sheet containing
 *   derived columns (G=time_s, H=speed_m/s, I=dist_m, K=load_g, L=bodyMass_kg,
 *   M=force_N, O=accel, P=power_W, R=RF%).
 *
 * - "raw_tablet": the raw tablet export. First sheet has a header row
 *   `time(ms) | load(g) | speed(...) | position(mm)`. Values in ms / g / mm/s
 *   / mm. No body mass, no RF%, no Step Table.
 */
function detectFormat(wb: XLSX.WorkBook): "dashboard" | "raw_tablet" | "unknown" {
  if (wb.SheetNames.some((n) => n.startsWith("Raw Data"))) return "dashboard";

  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (!firstSheet) return "unknown";
  const hdr = (addr: string): string => {
    const v = firstSheet[addr]?.v;
    return typeof v === "string" ? v.trim().toLowerCase() : "";
  };
  const a = hdr("A1");
  const b = hdr("B1");
  const c = hdr("C1");
  const d = hdr("D1");
  if (
    a.startsWith("time") &&
    b.startsWith("load") &&
    c.startsWith("speed") &&
    d.startsWith("position")
  ) {
    return "raw_tablet";
  }
  return "unknown";
}

/**
 * Pull samples from a raw tablet export. Columns on the first sheet are:
 *   A: time(ms)      → seconds
 *   B: load(g)       → grams (returned separately for avg-load computation)
 *   C: speed(mm/s)   → m/s
 *   D: position(mm)  → metres
 * Stops at the first blank time.
 */
function extractRawTabletSamples(
  ws: XLSX.WorkSheet,
): { samples: Sample[]; loads: number[] } {
  const samples: Sample[] = [];
  const loads: number[] = [];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let r = 1; r <= range.e.r; r++) {
    const tMs = ws[XLSX.utils.encode_cell({ c: 0, r })]?.v;
    const loadG = ws[XLSX.utils.encode_cell({ c: 1, r })]?.v;
    const speedMms = ws[XLSX.utils.encode_cell({ c: 2, r })]?.v;
    const posMm = ws[XLSX.utils.encode_cell({ c: 3, r })]?.v;
    if (tMs === undefined || tMs === null || tMs === "") break;
    const t = Number(tMs) / 1000;
    const v = Number(speedMms) / 1000;
    const x = Number(posMm) / 1000;
    if (!Number.isFinite(t) || !Number.isFinite(v) || !Number.isFinite(x)) continue;
    samples.push({ t, v, x });
    if (typeof loadG === "number" && Number.isFinite(loadG)) loads.push(loadG);
  }
  return { samples, loads };
}

function downsample(samples: Sample[], target: number): ChartSample[] {
  const n = samples.length;
  if (n <= target) return samples;
  const stride = Math.floor(n / target);
  const out: ChartSample[] = [];
  for (let i = 0; i < n; i += stride) out.push(samples[i]);
  if (out[out.length - 1] !== samples[n - 1]) out.push(samples[n - 1]);
  return out;
}

/**
 * Centered moving average with cumulative-sum implementation (O(n)). The
 * window is clipped at the boundaries so the output has the same length as
 * the input. Zero-phase by construction, which is what we need for both
 * sprint-start detection and step-peak detection.
 */
function movingAverage(arr: number[], window: number): number[] {
  const n = arr.length;
  if (window <= 1 || n === 0) return arr.slice();
  const half = Math.floor(window / 2);
  const cum = new Array<number>(n + 1);
  cum[0] = 0;
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + arr[i];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    out[i] = (cum[hi] - cum[lo]) / (hi - lo);
  }
  return out;
}

/**
 * Auto-detect the sprint-start sample index.
 *
 * Raw tablet exports contain several seconds of walk-up before the actual
 * sprint begins. We find the first moment the athlete is clearly moving
 * (smoothed v > 1.5 m/s and the following 500 ms averages > 2.0 m/s) and
 * then walk backwards to the nearest near-zero velocity — that's the true
 * sprint start. For Dashboard exports (already pre-trimmed), this returns 0
 * (or a value within a few samples of 0) because v rises steeply from the
 * first sample.
 *
 * Returns the start sample index; 0 means "start at sample 0 as given".
 * Approximate 1 kHz sampling is assumed for the 500 ms window size.
 */
function detectSprintStart(samples: Sample[]): number {
  const n = samples.length;
  if (n < 600) return 0;
  const v = samples.map((s) => s.v);
  // ~200 ms smoothing window at 1 kHz — heavy enough to kill sensor noise,
  // light enough that the leading edge of the sprint isn't flattened.
  const smoothed = movingAverage(v, 201);
  const windowAheadSamples = Math.min(500, Math.floor(n / 4));
  const riseThreshold = 1.5;
  const sustainedThreshold = 2.0;
  let trigger = -1;
  for (let i = 0; i < n - windowAheadSamples; i++) {
    if (smoothed[i] < riseThreshold) continue;
    let sum = 0;
    for (let j = i; j < i + windowAheadSamples; j++) sum += smoothed[j];
    if (sum / windowAheadSamples > sustainedThreshold) {
      trigger = i;
      break;
    }
  }
  if (trigger <= 0) return 0;

  // Walk back while v keeps dropping (toward 0), stopping at the first
  // local minimum or when v drops below 0.3 m/s.
  let j = trigger;
  while (j > 0) {
    if (smoothed[j - 1] > smoothed[j] + 0.005) break; // v started rising again → this is the trough
    if (smoothed[j] < 0.3) break;                      // effectively at rest
    j--;
  }
  return j;
}

/**
 * Derive step events from velocity oscillation when the 1080 Step Table is
 * absent (raw-tablet exports). Approach:
 *   1. Long-window MA (≈500 ms) acts as a high-pass when subtracted from v
 *      — removes the overall acceleration trend and leaves the step-cadence
 *      oscillation plus noise.
 *   2. Short-window MA (≈20 ms) smooths sensor noise out of the residual.
 *   3. Local minima in the smoothed residual = foot-strike instants
 *      (during ground contact the tether speed dips).
 *   4. Enforce minimum spacing (100 ms) and prominence (0.3 × σ(residual))
 *      so we don't over-detect on jitter.
 *
 * This is equivalent in spirit to the scipy-style Butterworth band-pass +
 * peak-find, traded for zero external deps. Accurate enough to count steps
 * and compute mean length/frequency; not suitable for GCT (which still
 * needs an external sensor).
 *
 * `sensor_source` stays "1080_sprint" but each step carries `derived: true`
 * so the UI can flag the provenance.
 */
function deriveStepsFromVelocity(samples: Sample[]): StepEventOut[] {
  const n = samples.length;
  if (n < 300) return [];
  const v = samples.map((s) => s.v);

  const longMA = movingAverage(v, 501);
  const residualRaw = new Array<number>(n);
  for (let i = 0; i < n; i++) residualRaw[i] = v[i] - longMA[i];
  const residual = movingAverage(residualRaw, 21);

  // Standard deviation of the band-passed signal (no mean — it's near 0).
  let sq = 0;
  for (let i = 0; i < n; i++) sq += residual[i] * residual[i];
  const sigma = Math.sqrt(sq / n);
  const minProminence = 0.3 * sigma;
  const minSeparation = 100; // ≈ 100 ms at 1 kHz → caps cadence at 10 Hz

  // Only search for steps in the sprint's active phase — ignore the last
  // 5% of samples where the athlete is decelerating past the finish line.
  const searchEnd = Math.floor(n * 0.95);

  const minima: number[] = [];
  let lastMinIdx = -Infinity;
  for (let i = 1; i < searchEnd - 1; i++) {
    if (residual[i] >= residual[i - 1] || residual[i] >= residual[i + 1]) continue;
    if (i - lastMinIdx < minSeparation) continue;

    // Prominence: look at local max within ±100 samples on each side.
    const lo = Math.max(0, i - 100);
    const hi = Math.min(n, i + 100);
    let localMax = -Infinity;
    for (let k = lo; k < hi; k++) if (residual[k] > localMax) localMax = residual[k];
    if (localMax - residual[i] < minProminence) continue;

    minima.push(i);
    lastMinIdx = i;
  }

  const steps: StepEventOut[] = [];
  for (let k = 0; k < minima.length - 1; k++) {
    const i1 = minima[k];
    const i2 = minima[k + 1];
    const t1 = samples[i1].t;
    const t2 = samples[i2].t;
    const period = t2 - t1;
    if (period <= 0) continue;
    steps.push({
      stepNumber: k + 1,
      tStrikeS: t1,
      stepLengthM: samples[i2].x - samples[i1].x,
      stepVelocityMs: (samples[i2].x - samples[i1].x) / period,
      stepFrequencyHz: 1 / period,
      peakForceN: null,
      derived: true,
    });
  }
  return steps;
}
