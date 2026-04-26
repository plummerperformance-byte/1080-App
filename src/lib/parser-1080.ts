/**
 * 1080 Sprint xlsx parser.
 * Ported from reference/parser-1080.reference.ts.
 *
 * Input: a File (from the browser) or an ArrayBuffer.
 * Output: structured sprint data ready to save to Supabase.
 */

import * as XLSX from "xlsx";

export interface ParsedSprint {
  bodyMassKg: number;
  avgLoadKg: number;
  maxDistM: number;
  durationS: number;
  sampleCount: number;
  metrics: SprintMetricsOut;
  steps: StepEventOut[];
  chartSamples: ChartSample[];
  fvProfileValid: boolean;
  classification: {
    sprintProfile:
      | "Acceleration"
      | "Late Acceleration"
      | "Transition"
      | "Max Velocity"
      | "Partial";
    fvBalance:
      | "High Force Deficit"
      | "Low Force Deficit"
      | "Balanced"
      | "Low Velocity Deficit"
      | "High Velocity Deficit"
      | null;
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

export async function parse1080File(file: File | ArrayBuffer): Promise<ParsedSprint> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });

  const rawSheetName = wb.SheetNames.find((n) => n.startsWith("Raw Data"));
  if (!rawSheetName) throw new Error("No 'Raw Data' sheet found in workbook.");
  const raw = wb.Sheets[rawSheetName];

  const samples = extractSprintSamples(raw);
  if (samples.length < 100) {
    throw new Error(
      `Sprint has only ${samples.length} samples — too short to analyse. Expected >1000 at 1 kHz sampling.`,
    );
  }

  const bodyMassKg = pickFirstNumber(raw, "L") ?? 0;
  if (!bodyMassKg) throw new Error("Could not read athlete body mass from Raw Data col L.");

  const avgLoadG = meanColumn(raw, "K", samples.length);
  const avgLoadKg = avgLoadG / 1000;

  const maxDistM = Math.max(...samples.map((s) => s.x));
  const durationS = samples[samples.length - 1].t;

  const maxVms = Math.max(...samples.map((s) => s.v));
  const maxVIdx = samples.findIndex((s) => s.v === maxVms);
  const timeToMaxVS = samples[maxVIdx].t;
  const distToMaxVM = samples[maxVIdx].x;

  const target90 = 0.9 * maxVms;
  const i90 = samples.findIndex((s) => s.v >= target90);
  const timeTo90PctVS = i90 >= 0 ? samples[i90].t : 0;
  const distTo90PctVM = i90 >= 0 ? samples[i90].x : 0;

  const fit = fitExponential(samples, maxVms);
  const tau = fit.tau;

  const peakAccelMs2 = maxVms / tau;
  const peakPowerW = peakSampleField(raw, "P", samples.length);

  const v0Ms = maxVms;
  const f0RelNkg = maxVms / tau;
  const f0N = f0RelNkg * bodyMassKg;
  const pmaxRelWkg = (f0RelNkg * v0Ms) / 4;
  const pmaxW = pmaxRelWkg * bodyMassKg;
  const fvSlope = -f0RelNkg / v0Ms;

  const { rfMaxPct, drf } = computeRfMetrics(raw, samples);

  const split10 = firstSampleAtDist(samples, 10);
  const split20 = firstSampleAtDist(samples, 20);
  const split30 = firstSampleAtDist(samples, 30);
  const split40 = firstSampleAtDist(samples, 40);

  const endIdx = samples.length - 1;
  const windowStart = Math.max(0, endIdx - 20);
  const endV =
    samples.slice(windowStart).reduce((s, v) => s + v.v, 0) / (endIdx - windowStart + 1);
  const vDropoffPct = ((maxVms - endV) / maxVms) * 100;

  const steps = extractStepTable(wb);
  const stepFreqs = steps.map((s) => s.stepFrequencyHz ?? 0).filter(Boolean);
  const stepFreqHz = stepFreqs.length
    ? stepFreqs.reduce((a, b) => a + b, 0) / stepFreqs.length
    : null;

  const lengths = steps.map((s) => s.stepLengthM ?? 0).filter(Boolean);
  const avgStepLengthM = lengths.length
    ? lengths.reduce((a, b) => a + b, 0) / lengths.length
    : null;
  const stepLengthStdM =
    lengths.length && avgStepLengthM !== null
      ? Math.sqrt(
          lengths.reduce((s, v) => s + (v - avgStepLengthM) ** 2, 0) / lengths.length,
        )
      : null;

  const chartSamples = downsample(samples, 300);

  const warnings: string[] = [];
  const fvProfileValid = avgLoadKg <= bodyMassKg * 0.05;
  if (!fvProfileValid) {
    warnings.push(
      `Avg load ${avgLoadKg.toFixed(1)} kg (>5% BM) — F-V profile is NOT a true Samozino profile. Treat F0/V0/Pmax as resisted-sprint descriptors only.`,
    );
  }
  if (maxDistM < 40) {
    warnings.push(`Sprint ended at ${maxDistM.toFixed(1)} m — splits beyond that are null.`);
  }

  let sprintProfile: ParsedSprint["classification"]["sprintProfile"] = "Partial";
  if (split40 !== null && split10 !== null && split20 !== null && split30 !== null) {
    const d10 = (split10 - split40 * 0.34) / (split40 * 0.34);
    const d20 = (split20 - split10 - split40 * 0.24) / (split40 * 0.24);
    const d30 = (split30 - split20 - split40 * 0.2) / (split40 * 0.2);
    const d40 = (split40 - split30 - split40 * 0.2) / (split40 * 0.2);
    const mx = Math.max(d10, d20, d30, d40);
    if (mx === d10) sprintProfile = "Acceleration";
    else if (mx === d20) sprintProfile = "Late Acceleration";
    else if (mx === d30) sprintProfile = "Transition";
    else sprintProfile = "Max Velocity";
  }

  let fvBalance: ParsedSprint["classification"]["fvBalance"] = null;
  if (fvProfileValid) {
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
    },
    steps,
    chartSamples,
    fvProfileValid,
    classification: { sprintProfile, fvBalance },
    warnings,
  };
}

interface Sample {
  t: number;
  v: number;
  x: number;
}

function extractSprintSamples(ws: XLSX.WorkSheet): Sample[] {
  const out: Sample[] = [];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let r = 1; r <= range.e.r; r++) {
    const g = ws[XLSX.utils.encode_cell({ c: 6, r })]?.v;
    const h = ws[XLSX.utils.encode_cell({ c: 7, r })]?.v;
    const i = ws[XLSX.utils.encode_cell({ c: 8, r })]?.v;
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
  let sum = 0;
  let count = 0;
  for (let r = 1; r <= n; r++) {
    const v = ws[XLSX.utils.encode_cell({ c: colIdx, r })]?.v;
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count++;
    }
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

function fitExponential(samples: Sample[], vmax: number): { tau: number; rss: number } {
  const rss = (tau: number) => {
    let s = 0;
    for (const { t, v } of samples) {
      const pred = vmax * (1 - Math.exp(-t / tau));
      s += (v - pred) ** 2;
    }
    return s;
  };
  let best = { tau: 1.0, rss: Infinity };
  for (let tau = 0.1; tau <= 3.0; tau += 0.05) {
    const r = rss(tau);
    if (r < best.rss) best = { tau, rss: r };
  }
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

function computeRfMetrics(
  ws: XLSX.WorkSheet,
  samples: Sample[],
): { rfMaxPct: number; drf: number } {
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
  if (!rfVals.length) return { rfMaxPct: 0, drf: 0 };
  const rfMaxPct = Math.max(...rfVals) * 100;
  const vMax = Math.max(...vVals);
  const mask = vVals.map((v) => v >= 0.3 * vMax);
  const xs = vVals.filter((_, i) => mask[i]);
  const ys = rfVals.filter((_, i) => mask[i]).map((v) => v * 100);
  const n = xs.length;
  if (n === 0) return { rfMaxPct, drf: 0 };
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
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
  const name = wb.SheetNames.find(
    (n) => n === "Step Table" || n.toLowerCase().includes("step"),
  );
  if (!name) return [];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  return rows
    .map((row, i) => {
      const get = (...keys: string[]): unknown => {
        for (const k of keys) {
          for (const actual of Object.keys(row)) {
            if (actual.trim().toLowerCase() === k.trim().toLowerCase()) return row[actual];
          }
        }
        return null;
      };
      const num = Number(get("Step Count", "Step", "Step Number", "step") ?? i + 1);
      const tStrike = get("Time (s)", "Time", "t(s)");
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

function numOrNull(v: unknown): number | null {
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
