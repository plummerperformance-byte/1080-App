"use client";

import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { computeJointAngles } from "./angles";
import { buildStepCycles, detectGaitEvents } from "./events";
import {
  POSE_LANDMARK_NAMES,
  type AnalyserOptions,
  type Keypoints,
  type PoseAnalysisResult,
  type PoseFrameOut,
  type PoseLandmarkName,
  type TechniqueAssessmentOut,
} from "./types";

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

const VISION_TASK_BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/**
 * Lazily initialise the MediaPipe Pose Landmarker (browser-side, WASM).
 * Cached for the page session.
 */
async function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(VISION_TASK_BUNDLE_URL);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    })();
  }
  return landmarkerPromise;
}

/**
 * Run pose detection over a video file. Operates entirely in the browser:
 * decodes the video via <video>, samples every Nth frame, runs MediaPipe Pose
 * Landmarker, then derives joint angles + gait events + per-phase technique
 * rollups.
 */
export async function analyseSprintVideo(
  file: File,
  options: AnalyserOptions = {},
): Promise<PoseAnalysisResult> {
  const { frameStride = 1, onProgress, maxFrames = Infinity } = options;
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load video metadata."));
    });
    const durationS = video.duration;
    const widthPx = video.videoWidth;
    const heightPx = video.videoHeight;
    const fps = await estimateFps(video);

    const landmarker = await getLandmarker();
    const frames: PoseFrameOut[] = [];
    const totalFrames = Math.min(maxFrames, Math.floor(durationS * fps));
    let processed = 0;

    for (let f = 0; f < totalFrames; f += frameStride) {
      const t = f / fps;
      await seekVideo(video, t);
      const result: PoseLandmarkerResult = landmarker.detectForVideo(video, t * 1000);
      const kp = extractKeypoints(result);
      if (!kp) {
        processed++;
        if (onProgress) onProgress(Math.min(1, processed / (totalFrames / frameStride)));
        continue;
      }
      frames.push({
        frameIndex: f,
        tS: t,
        keypoints: kp,
        jointAngles: computeJointAngles(kp),
      });
      processed++;
      if (onProgress) onProgress(Math.min(1, processed / (totalFrames / frameStride)));
    }

    const events = detectGaitEvents(frames);
    const steps = buildStepCycles(events);

    const cameraSide: "left" | "right" | "unknown" =
      options.cameraSide ?? inferCameraSide(frames);

    const techniqueByPhase = buildTechniquePhases(frames, steps);
    const warnings = buildWarnings(frames, steps);

    return {
      fps,
      durationS,
      widthPx,
      heightPx,
      cameraSide,
      frames,
      events,
      steps,
      techniqueByPhase,
      warnings,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(t, Math.max(0, video.duration - 0.001));
  });
}

async function estimateFps(video: HTMLVideoElement): Promise<number> {
  const anyVid = video as HTMLVideoElement & {
    getVideoPlaybackQuality?: () => { totalVideoFrames: number };
  };
  if (typeof anyVid.getVideoPlaybackQuality === "function") {
    // Will be 0 until the video plays; fall through.
  }
  const tracks = (video as HTMLVideoElement & { videoTracks?: unknown }).videoTracks;
  void tracks;
  return 30;
}

function extractKeypoints(result: PoseLandmarkerResult): Keypoints | null {
  if (!result.landmarks || result.landmarks.length === 0) return null;
  const lms = result.landmarks[0];
  if (lms.length < POSE_LANDMARK_NAMES.length) return null;
  const out = {} as Keypoints;
  POSE_LANDMARK_NAMES.forEach((name, i) => {
    const lm = lms[i];
    out[name as PoseLandmarkName] = {
      x: lm.x,
      y: lm.y,
      z: lm.z ?? 0,
      visibility: lm.visibility ?? 0,
    };
  });
  return out;
}

function inferCameraSide(frames: PoseFrameOut[]): "left" | "right" | "unknown" {
  // Side-on view: the body progresses across the frame. Compare mean ankle
  // visibility per side. Whichever side is consistently more visible is
  // facing the camera.
  let leftVis = 0;
  let rightVis = 0;
  let n = 0;
  for (const f of frames) {
    leftVis += f.keypoints.left_ankle.visibility;
    rightVis += f.keypoints.right_ankle.visibility;
    n++;
  }
  if (n === 0) return "unknown";
  const diff = (leftVis - rightVis) / n;
  if (diff > 0.1) return "right"; // left side of body more visible → camera is on right
  if (diff < -0.1) return "left";
  return "unknown";
}

function buildTechniquePhases(
  frames: PoseFrameOut[],
  steps: { strikeT: number; contactTimeMs: number; flightTimeMs: number | null }[],
): TechniqueAssessmentOut[] {
  if (frames.length === 0) return [];
  const dur = frames[frames.length - 1].tS;
  const phases: { name: TechniqueAssessmentOut["phase"]; from: number; to: number }[] = [
    { name: "acceleration", from: 0, to: dur * 0.4 },
    { name: "max_velocity", from: dur * 0.4, to: dur * 0.85 },
    { name: "deceleration", from: dur * 0.85, to: dur },
  ];
  const out: TechniqueAssessmentOut[] = [];
  for (const p of phases) {
    const inPhase = frames.filter((f) => f.tS >= p.from && f.tS < p.to);
    if (inPhase.length === 0) continue;
    const trunk = mean(inPhase.map((f) => f.jointAngles.trunkLeanDeg));
    const knee = mean(inPhase.map((f) => f.jointAngles.kneeFlexionDeg));
    const ankle = mean(inPhase.map((f) => f.jointAngles.ankleDorsiflexionDeg));
    const hipExt = mean(inPhase.map((f) => f.jointAngles.hipExtensionDeg));
    const stepsInPhase = steps.filter((s) => s.strikeT >= p.from && s.strikeT < p.to);
    const ct = mean(stepsInPhase.map((s) => s.contactTimeMs));
    const ft = mean(stepsInPhase.map((s) => s.flightTimeMs));
    const flags: string[] = [];
    if (p.name === "acceleration" && trunk != null && trunk > -25) {
      flags.push("Trunk too upright in acceleration (target < -30°)");
    }
    if (p.name === "max_velocity" && knee != null && knee > 110) {
      flags.push("Low knee drive at max V (target < 100°)");
    }
    if (p.name === "max_velocity" && ct != null && ct > 160) {
      flags.push("Long ground contact at max V (target < 140 ms)");
    }
    out.push({
      phase: p.name,
      trunkLeanDeg: trunk,
      kneeDriveDeg: knee,
      ankleDorsiflexionDeg: ankle,
      hipExtensionDeg: hipExt,
      contactTimeMs: ct,
      flightTimeMs: ft,
      flags,
    });
  }
  return out;
}

function buildWarnings(
  frames: PoseFrameOut[],
  steps: { contactTimeMs: number }[],
): string[] {
  const warnings: string[] = [];
  if (frames.length === 0) {
    warnings.push("No pose detected. Camera angle / lighting / frame too small?");
    return warnings;
  }
  const meanVis = mean(
    frames.flatMap((f) =>
      Object.values(f.keypoints).map((k: { visibility: number }) => k.visibility),
    ),
  );
  if (meanVis != null && meanVis < 0.5) {
    warnings.push("Low average keypoint visibility — joint angles may be inaccurate.");
  }
  if (steps.length < 4) {
    warnings.push(`Only ${steps.length} step cycles detected — try a clearer side-on shot.`);
  }
  return warnings;
}

function mean(xs: (number | null)[]): number | null {
  const filtered = xs.filter((x): x is number => x != null && Number.isFinite(x));
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}
