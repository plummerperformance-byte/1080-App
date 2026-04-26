import type { JointAngles, Keypoint, Keypoints } from "./types";

/** 2D angle at vertex `b` formed by `a–b–c` in degrees. Uses image x/y. */
export function angleDeg(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of vector `a→b` from vertical (image-y is down). Negative = leaning forward (toward +x). */
export function angleFromVerticalDeg(a: Keypoint, b: Keypoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y; // y grows downward
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

const VIS_THRESHOLD = 0.4;

function visible(kp: Keypoint | undefined): boolean {
  return !!kp && kp.visibility >= VIS_THRESHOLD;
}

/**
 * Compute joint angles for a sprint frame. Lead-leg is whichever leg has the
 * higher knee at this instant (smaller y value in image coordinates).
 */
export function computeJointAngles(kp: Keypoints): JointAngles {
  const out: JointAngles = {
    trunkLeanDeg: null,
    hipFlexionDeg: null,
    kneeFlexionDeg: null,
    ankleDorsiflexionDeg: null,
    hipExtensionDeg: null,
  };

  // Trunk lean: midpoint(shoulders) → midpoint(hips) vector vs vertical.
  const ls = kp.left_shoulder;
  const rs = kp.right_shoulder;
  const lh = kp.left_hip;
  const rh = kp.right_hip;
  if (visible(ls) && visible(rs) && visible(lh) && visible(rh)) {
    const shoulder: Keypoint = {
      x: (ls.x + rs.x) / 2,
      y: (ls.y + rs.y) / 2,
      z: 0,
      visibility: Math.min(ls.visibility, rs.visibility),
    };
    const hip: Keypoint = {
      x: (lh.x + rh.x) / 2,
      y: (lh.y + rh.y) / 2,
      z: 0,
      visibility: Math.min(lh.visibility, rh.visibility),
    };
    out.trunkLeanDeg = angleFromVerticalDeg(hip, shoulder);
  }

  // Lead leg = the leg whose knee is higher in the frame (smaller y).
  const lk = kp.left_knee;
  const rk = kp.right_knee;
  if (!visible(lk) && !visible(rk)) return out;

  const leadLeft = !visible(rk) || (visible(lk) && lk.y < rk.y);
  const hip = leadLeft ? lh : rh;
  const knee = leadLeft ? lk : rk;
  const ankle = leadLeft ? kp.left_ankle : kp.right_ankle;
  const foot = leadLeft ? kp.left_foot_index : kp.right_foot_index;
  const shoulder = leadLeft ? ls : rs;

  if (visible(hip) && visible(knee) && visible(shoulder)) {
    out.hipFlexionDeg = angleDeg(shoulder, hip, knee);
  }
  if (visible(hip) && visible(knee) && visible(ankle)) {
    out.kneeFlexionDeg = angleDeg(hip, knee, ankle);
  }
  if (visible(knee) && visible(ankle) && visible(foot)) {
    out.ankleDorsiflexionDeg = angleDeg(knee, ankle, foot);
  }

  // Rear-leg hip extension (the OTHER leg).
  const rearHip = leadLeft ? rh : lh;
  const rearKnee = leadLeft ? rk : lk;
  const rearShoulder = leadLeft ? rs : ls;
  if (visible(rearHip) && visible(rearKnee) && visible(rearShoulder)) {
    out.hipExtensionDeg = angleDeg(rearShoulder, rearHip, rearKnee);
  }

  return out;
}
