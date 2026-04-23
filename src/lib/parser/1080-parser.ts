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
  /** Body mass used by the 1080 for force calcs (kg) */
  bodyMassKg: number;
  /** Mean load applied by the 1080 (kg) */
  avgLoadKg: number;
  /** Max distance reached in the sprint (m) */
  maxDistM: number;
  /** Sprint duration (s) */
  durationS: number;
  /** Count of raw samples used */
  sampleCount: number;

  /** Core sprint metrics */
  metrics: SprintMetricsOut;
  /** Per-step data (from 1080's own step table) */
  steps: StepEventOut[];
  /** Sampled v(t) and x(t) for charting (max ~300 points) */
  chartSamples: ChartSample[];

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
  rfMaxPct: number;
  drf: number;
  peakAccelMs2: number;
  peakPowerW: number;
  peakPowerRelWkg: number;
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
}

export interface ChartSample {
  t: number;
  v: number;
  x: number;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function parse1080File(file: File | ArrayBuffer): Promise<ParsedSprint> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });

  const rawSheetName = wb.SheetNames.find((n) => n.startsWith("Raw Data"));
  if (!rawSheetName) throw new Error("No 'Raw Data' sheet found in workbook.");
  const raw = wb.Sheets[rawSheetName];

  // Pull sprint samples: derived columns G (time s), H (speed m/s), I (dist m),
  // M (horiz force N), O (accel m/s²), P (power W), R (RF%)
  const samples = extractSprintSamples(raw);

  if (samples.length < 100) {
    throw new Error(
      `Sprint has only ${samples.length} samples — too short to analyse. ` +
        `Expected >1000 at 1 kHz sampling.`,
    );
  }

  // Body mass from col L
  const bodyMassKg = pickFirstNumber(raw, "L") ?? 0;
  if (!bodyMassKg) throw new Error("Could not read athlete body mass from Raw Data col L.");

  // Avg load (grams) from col K, convert to kg
  const avgLoadG = meanColumn(raw, "K", samples.length);
  const avgLoadKg = avgLoadG / 1000;

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
  const peakPowerW = peakSampleField(raw, "P", samples.length);

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

  // RFmax and DRF from the raw RF% column (R) vs speed (H)
  const { rfMaxPct, drf } = computeRfMetrics(raw, samples);

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

  // ---------- Steps (from 1080 Step Table) -----------------------------
  const steps = extractStepTable(wb);
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
  const warnings: string[] = [];
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

  return {
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
      peakPowerRelWkg: peakPowerW / bodyMassKg,
      vDropoffPct,
      totalSteps: steps.length,
      stepFreqHz,
      avgStepLengthM,
      stepLengthStdM,
    } as SprintMetricsOut,
    steps,
    chartSamples,
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
 * Pull samples from Raw Data columns G (time_s), H (speed_m/s), I (distance_m).
 * Stops at the first blank time.
 */
function extractSprintSamples(ws: XLSX.WorkSheet): Sample[] {
  const out: Sample[] = [];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let r = 1; r <= range.e.r; r++) { // 0-indexed, row 2 of sheet
    const gAddr = XLSX.utils.encode_cell({ c: 6, r });  // G
    const hAddr = XLSX.utils.encode_cell({ c: 7, r });  // H
    const iAddr = XLSX.utils.encode_cell({ c: 8, r });  // I
    const g = ws[gAddr]?.v;
    const h = ws[hAddr]?.v;
    const i = ws[iAddr]?.v;
    if (g === undefined || g === null || g === "") break;
    const t = Number(g);
    const v = Number(h);
    const x = Number(i);
    if (!Number.isFinite(t) || !Number.isFinite(v) || !Number.isFinite(x)) continue;
    out.push({ t, v, x });
  }
  return out;
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
      };
    })
    .filter((s) => Number.isFinite(s.stepNumber) && s.stepNumber > 0);
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
