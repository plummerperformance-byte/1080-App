import type { GaitEvent, PoseFrameOut, StepCycle } from "./types";

/**
 * Detect foot-strike / toe-off events from per-frame ankle Y trajectories.
 *
 * Heuristic (works well for side-on sprint video):
 *   - Foot strike: ankle reaches a local MAX y (lowest point in image space)
 *     and stays near-stationary for >= 30 ms.
 *   - Toe off: ankle's y-velocity becomes strongly negative (foot lifting).
 *
 * Independent left/right detection. Frames with low visibility are skipped.
 */
export function detectGaitEvents(frames: PoseFrameOut[]): GaitEvent[] {
  if (frames.length < 5) return [];
  const events: GaitEvent[] = [];

  for (const side of ["left", "right"] as const) {
    const ankleKey = side === "left" ? "left_ankle" : "right_ankle";
    const ys: { i: number; t: number; y: number; vis: number }[] = frames.map((f) => {
      const kp = f.keypoints[ankleKey];
      return {
        i: f.frameIndex,
        t: f.tS,
        y: kp.y,
        vis: kp.visibility,
      };
    });

    // Smooth Y over a 5-frame window (visibility-weighted).
    const smooth = ys.map((_, i) => {
      let num = 0;
      let den = 0;
      for (let k = Math.max(0, i - 2); k <= Math.min(ys.length - 1, i + 2); k++) {
        const w = ys[k].vis;
        num += ys[k].y * w;
        den += w;
      }
      return den > 0 ? num / den : ys[i].y;
    });

    // Detect local maxima of y (foot strikes) and steep negative dy/dt (toe-offs).
    let lastStrikeT = -Infinity;
    for (let i = 2; i < smooth.length - 2; i++) {
      const y0 = smooth[i - 2];
      const y1 = smooth[i - 1];
      const y2 = smooth[i];
      const y3 = smooth[i + 1];
      const y4 = smooth[i + 2];
      const isLocalMax = y2 >= y1 && y2 >= y3 && (y2 - Math.min(y0, y4)) > 0.01;
      if (isLocalMax && ys[i].t - lastStrikeT > 0.12 && ys[i].vis > 0.4) {
        events.push({
          type: "foot_strike",
          side,
          tS: ys[i].t,
          frameIndex: ys[i].i,
        });
        lastStrikeT = ys[i].t;
      }
    }

    // Toe-off: first frame after each strike where dy/dt is strongly negative
    // and visibility is good.
    const strikes = events.filter((e) => e.side === side && e.type === "foot_strike");
    for (let s = 0; s < strikes.length; s++) {
      const strikeIdx = ys.findIndex((y) => y.t === strikes[s].tS);
      if (strikeIdx < 0) continue;
      const strikeT = strikes[s].tS;
      const nextStrikeT = s + 1 < strikes.length ? strikes[s + 1].tS : Infinity;
      for (let j = strikeIdx + 1; j < smooth.length - 1; j++) {
        if (ys[j].t >= nextStrikeT) break;
        const dy = (smooth[j + 1] - smooth[j - 1]) / Math.max(1e-6, ys[j + 1].t - ys[j - 1].t);
        if (dy < -0.5 && ys[j].t - strikeT > 0.04) {
          events.push({
            type: "toe_off",
            side,
            tS: ys[j].t,
            frameIndex: ys[j].i,
          });
          break;
        }
      }
    }
  }

  events.sort((a, b) => a.tS - b.tS);
  return events;
}

export function buildStepCycles(events: GaitEvent[]): StepCycle[] {
  const cycles: StepCycle[] = [];
  for (const side of ["left", "right"] as const) {
    const sideEvents = events.filter((e) => e.side === side).sort((a, b) => a.tS - b.tS);
    for (let i = 0; i < sideEvents.length; i++) {
      const e = sideEvents[i];
      if (e.type !== "foot_strike") continue;
      const toeOff = sideEvents.slice(i + 1).find((x) => x.type === "toe_off");
      if (!toeOff) continue;
      const nextStrike = sideEvents
        .slice(i + 1)
        .find((x) => x.type === "foot_strike" && x.tS > toeOff.tS);
      const contact = (toeOff.tS - e.tS) * 1000;
      const flight = nextStrike ? (nextStrike.tS - toeOff.tS) * 1000 : null;
      const period = nextStrike ? nextStrike.tS - e.tS : null;
      cycles.push({
        side,
        strikeT: e.tS,
        toeOffT: toeOff.tS,
        contactTimeMs: contact,
        flightTimeMs: flight,
        stepFrequencyHz: period && period > 0 ? 1 / period : null,
      });
    }
  }
  return cycles.sort((a, b) => a.strikeT - b.strikeT);
}
