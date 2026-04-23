/**
 * Parser verification — reads the two reference xlsx files and prints the
 * metrics the parser produces, so we can compare against SPEC expected values
 * before wiring the parser into the upload page.
 *
 * Run with:  npm run verify-parser
 */

import fs from "node:fs";
import path from "node:path";
import { parse1080File, type ParsedSprint } from "../src/lib/parser/1080-parser";

const SAMPLES: Array<{
  label: string;
  file: string;
  expected: Partial<{
    maxVms: number;
    avgLoadKg: number;
    split10mS: number;
    split40mS: number;
    f0RelNkg: number;
    v0Ms: number;
    pmaxRelWkg: number;
    totalSteps: number;
    stepFreqHz: number;
    fvProfileValid: boolean;
    splitsBeyondReach: boolean;
  }>;
}> = [
  {
    label: "sample_play.xlsx",
    file: "handoff/reference/sample_play.xlsx",
    expected: {
      maxVms: 10.6,
      avgLoadKg: 1.15,
      split10mS: 2.07,
      split40mS: 5.5,
      f0RelNkg: 6.7,
      v0Ms: 10.6,
      pmaxRelWkg: 17.7,
      totalSteps: 24,
      stepFreqHz: 4.3,
      fvProfileValid: true,
    },
  },
  {
    label: "sample_kai.xlsx",
    file: "handoff/reference/sample_kai.xlsx",
    expected: {
      maxVms: 5.1,
      avgLoadKg: 17,
      fvProfileValid: false,
      splitsBeyondReach: true,
    },
  },
];

function fmt(v: number | null | undefined, digits = 3): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function near(actual: number | null | undefined, expected: number, tol: number): string {
  if (actual == null) return `FAIL (actual=null, expected≈${expected})`;
  const diff = Math.abs(actual - expected);
  return diff <= tol ? "OK" : `OFF by ${diff.toFixed(3)}`;
}

async function run(): Promise<void> {
  for (const s of SAMPLES) {
    const full = path.resolve(s.file);
    if (!fs.existsSync(full)) {
      console.log(`\n=== ${s.label} — MISSING (${full}) ===`);
      continue;
    }
    const buf = fs.readFileSync(full);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    let parsed: ParsedSprint;
    try {
      parsed = await parse1080File(ab);
    } catch (err) {
      console.log(`\n=== ${s.label} — PARSE ERROR ===`);
      console.log(err instanceof Error ? err.message : String(err));
      continue;
    }

    const m = parsed.metrics;
    const e = s.expected;
    console.log(`\n=== ${s.label} ===`);
    console.log(`  bodyMassKg:       ${fmt(parsed.bodyMassKg, 1)}`);
    console.log(
      `  avgLoadKg:        ${fmt(parsed.avgLoadKg, 2)}` +
        (e.avgLoadKg != null ? `   expected ≈ ${e.avgLoadKg}  [${near(parsed.avgLoadKg, e.avgLoadKg, 1.5)}]` : ""),
    );
    console.log(`  maxDistM:         ${fmt(parsed.maxDistM, 2)} m`);
    console.log(`  durationS:        ${fmt(parsed.durationS, 2)} s`);
    console.log(`  sampleCount:      ${parsed.sampleCount}`);
    console.log(
      `  maxVms:           ${fmt(m.maxVms, 3)}` +
        (e.maxVms != null ? `   expected ≈ ${e.maxVms}  [${near(m.maxVms, e.maxVms, 0.3)}]` : ""),
    );
    console.log(`  timeToMaxVS:      ${fmt(m.timeToMaxVS, 3)} s  @ ${fmt(m.distToMaxVM, 2)} m`);
    console.log(`  timeTo90PctVS:    ${fmt(m.timeTo90PctVS, 3)} s  @ ${fmt(m.distTo90PctVM, 2)} m`);
    console.log(`  tau:              ${fmt(m.tau, 3)}`);
    console.log(
      `  f0RelNkg:         ${fmt(m.f0RelNkg, 3)}` +
        (e.f0RelNkg != null ? `   expected ≈ ${e.f0RelNkg}  [${near(m.f0RelNkg, e.f0RelNkg, 0.5)}]` : ""),
    );
    console.log(`  f0N:              ${fmt(m.f0N, 1)}`);
    console.log(
      `  v0Ms:             ${fmt(m.v0Ms, 3)}` +
        (e.v0Ms != null ? `   expected ≈ ${e.v0Ms}  [${near(m.v0Ms, e.v0Ms, 0.3)}]` : ""),
    );
    console.log(
      `  pmaxRelWkg:       ${fmt(m.pmaxRelWkg, 2)}` +
        (e.pmaxRelWkg != null ? `   expected ≈ ${e.pmaxRelWkg}  [${near(m.pmaxRelWkg, e.pmaxRelWkg, 2)}]` : ""),
    );
    console.log(`  pmaxW:            ${fmt(m.pmaxW, 1)}`);
    console.log(`  fvSlope:          ${fmt(m.fvSlope, 3)}`);
    console.log(`  fvImbalancePct:   ${fmt(m.fvImbalancePct, 1)}`);
    console.log(`  rfMaxPct:         ${fmt(m.rfMaxPct, 2)}`);
    console.log(`  drf:              ${fmt(m.drf, 3)}`);
    console.log(`  peakAccelMs2:     ${fmt(m.peakAccelMs2, 2)}`);
    console.log(`  peakPowerW:       ${fmt(m.peakPowerW, 1)}`);
    console.log(`  peakPowerRelWkg:  ${fmt(m.peakPowerRelWkg, 2)}`);
    console.log(`  vDropoffPct:      ${fmt(m.vDropoffPct, 2)}`);
    console.log(
      `  split10mS:        ${fmt(m.split10mS)}` +
        (e.split10mS != null ? `   expected ≈ ${e.split10mS}  [${near(m.split10mS, e.split10mS, 0.1)}]` : ""),
    );
    console.log(`  split20mS:        ${fmt(m.split20mS)}`);
    console.log(`  split30mS:        ${fmt(m.split30mS)}`);
    console.log(
      `  split40mS:        ${fmt(m.split40mS)}` +
        (e.split40mS != null ? `   expected ≈ ${e.split40mS}  [${near(m.split40mS, e.split40mS, 0.3)}]` : ""),
    );
    console.log(
      `  totalSteps:       ${m.totalSteps}` +
        (e.totalSteps != null ? `   expected ≈ ${e.totalSteps}  [${near(m.totalSteps, e.totalSteps, 3)}]` : ""),
    );
    console.log(
      `  stepFreqHz:       ${fmt(m.stepFreqHz, 2)}` +
        (e.stepFreqHz != null ? `   expected ≈ ${e.stepFreqHz}  [${near(m.stepFreqHz, e.stepFreqHz, 0.5)}]` : ""),
    );
    console.log(`  avgStepLengthM:   ${fmt(m.avgStepLengthM, 2)}`);
    console.log(`  stepLengthStdM:   ${fmt(m.stepLengthStdM, 3)}`);
    console.log(
      `  fvProfileValid:   ${parsed.fvProfileValid}` +
        (e.fvProfileValid != null
          ? `   expected ${e.fvProfileValid}  [${parsed.fvProfileValid === e.fvProfileValid ? "OK" : "FAIL"}]`
          : ""),
    );
    console.log(`  sprintProfile:    ${parsed.classification.sprintProfile}`);
    console.log(`  fvBalance:        ${parsed.classification.fvBalance}`);
    if (parsed.warnings.length) {
      console.log(`  warnings:`);
      for (const w of parsed.warnings) console.log(`    - ${w}`);
    } else {
      console.log(`  warnings:         (none)`);
    }
    if (e.splitsBeyondReach) {
      const reach = parsed.maxDistM;
      const expectNullFrom = Math.ceil(reach / 10) * 10;
      const checks: Array<[string, number | null, number]> = [
        ["split_20m", m.split20mS, 20],
        ["split_30m", m.split30mS, 30],
        ["split_40m", m.split40mS, 40],
      ];
      for (const [name, v, d] of checks) {
        if (d >= expectNullFrom) {
          console.log(`  DNF guard ${name} (> ${reach.toFixed(1)} m): ${v === null ? "OK (null)" : `FAIL (=${v})`}`);
        }
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
