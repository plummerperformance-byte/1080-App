/**
 * Smoke test: run the 1080 parser against reference/sample_play.xlsx and
 * reference/sample_kai.xlsx, print the headline metrics. Lets you verify the
 * port without booting the app.
 *
 * Run with: npx tsx scripts/smoke-test-parser.ts
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse1080File } from "../src/lib/parser-1080";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function main() {
  for (const name of ["sample_play.xlsx", "sample_kai.xlsx"]) {
    const buf = await readFile(resolve(root, "reference", name));
    console.log(`\n=== ${name} ===`);
    try {
      const ab = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
      const result = await parse1080File(ab);
      const m = result.metrics;
      console.log({
        bodyMassKg: result.bodyMassKg,
        avgLoadKg: +result.avgLoadKg.toFixed(2),
        maxDistM: +result.maxDistM.toFixed(2),
        durationS: +result.durationS.toFixed(3),
        sampleCount: result.sampleCount,
        maxVms: +m.maxVms.toFixed(2),
        f0RelNkg: +m.f0RelNkg.toFixed(2),
        v0Ms: +m.v0Ms.toFixed(2),
        pmaxRelWkg: +m.pmaxRelWkg.toFixed(2),
        split10mS: m.split10mS,
        split40mS: m.split40mS,
        totalSteps: m.totalSteps,
        stepFreqHz: m.stepFreqHz,
        fvProfileValid: result.fvProfileValid,
        sprintProfile: result.classification.sprintProfile,
        fvBalance: result.classification.fvBalance,
        warnings: result.warnings,
      });
    } catch (err) {
      console.error("Parse failed:", err);
    }
  }
}

main();
