import type { PoseLandmarkName } from "./types";

/**
 * MediaPipe Pose connections — pairs of landmarks that should be drawn as
 * lines on the stick-figure overlay. We render a side-on sprinter so we
 * include the limbs, trunk, and head reference but skip face detail.
 */
export const SKELETON_EDGES: [PoseLandmarkName, PoseLandmarkName][] = [
  // Trunk
  ["left_shoulder", "right_shoulder"],
  ["left_hip", "right_hip"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  // Left arm
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  // Right arm
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  // Left leg
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["left_ankle", "left_heel"],
  ["left_heel", "left_foot_index"],
  ["left_ankle", "left_foot_index"],
  // Right leg
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["right_ankle", "right_heel"],
  ["right_heel", "right_foot_index"],
  ["right_ankle", "right_foot_index"],
  // Head reference (just nose to shoulder midpoint)
  ["nose", "left_shoulder"],
  ["nose", "right_shoulder"],
];

export const KEY_LANDMARKS: PoseLandmarkName[] = [
  "nose",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
];
