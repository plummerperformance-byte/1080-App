/**
 * Public types for the video pose module.
 *
 * The PoseAnalyser consumes a side-on sprint video file and emits per-frame
 * keypoints + derived joint angles + foot-strike / toe-off events. Output is
 * deliberately JSON-serialisable so it slots into the Supabase schema without
 * adapters.
 */

/** MediaPipe Pose Landmarker indexes (we only use the body landmarks). */
export const POSE_LANDMARK_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
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
] as const;

export type PoseLandmarkName = (typeof POSE_LANDMARK_NAMES)[number];

export interface Keypoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export type Keypoints = Record<PoseLandmarkName, Keypoint>;

export interface PoseFrameOut {
  frameIndex: number;
  tS: number;
  keypoints: Keypoints;
  jointAngles: JointAngles;
}

export interface JointAngles {
  /** Trunk lean from vertical, degrees. Negative = leaning forward. */
  trunkLeanDeg: number | null;
  /** Hip flexion of the lead leg at the highest knee, degrees. */
  hipFlexionDeg: number | null;
  /** Knee flexion of the lead leg at the highest knee, degrees. */
  kneeFlexionDeg: number | null;
  /** Ankle dorsiflexion of the lead leg, degrees. */
  ankleDorsiflexionDeg: number | null;
  /** Hip extension of the rear leg at toe-off, degrees. */
  hipExtensionDeg: number | null;
}

export interface GaitEvent {
  type: "foot_strike" | "toe_off";
  side: "left" | "right";
  tS: number;
  frameIndex: number;
}

export interface StepCycle {
  side: "left" | "right";
  strikeT: number;
  toeOffT: number;
  contactTimeMs: number;
  flightTimeMs: number | null;
  stepFrequencyHz: number | null;
}

export interface PoseAnalysisResult {
  fps: number;
  durationS: number;
  widthPx: number;
  heightPx: number;
  cameraSide: "left" | "right" | "unknown";
  frames: PoseFrameOut[];
  events: GaitEvent[];
  steps: StepCycle[];
  /** Per-phase rollups for the technique assessment table. */
  techniqueByPhase: TechniqueAssessmentOut[];
  warnings: string[];
}

export interface TechniqueAssessmentOut {
  phase: "acceleration" | "max_velocity" | "deceleration";
  trunkLeanDeg: number | null;
  kneeDriveDeg: number | null;
  ankleDorsiflexionDeg: number | null;
  hipExtensionDeg: number | null;
  contactTimeMs: number | null;
  flightTimeMs: number | null;
  flags: string[];
}

export interface AnalyserOptions {
  /** Process every Nth video frame. Default 1 = every frame. */
  frameStride?: number;
  /** Camera side. Auto-detected if omitted. */
  cameraSide?: "left" | "right" | "unknown";
  /** Optional per-frame progress callback (0..1). */
  onProgress?: (pct: number) => void;
  /** Maximum frames to process. Default Infinity. */
  maxFrames?: number;
}
