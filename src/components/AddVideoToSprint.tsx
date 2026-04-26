"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { analyseSprintVideo } from "@/lib/pose/analyser";
import type { PoseAnalysisResult } from "@/lib/pose/types";
import { Button, Pill } from "@/components/ui";

type Props = {
  sprintId: string;
  athleteId: string;
  sessionId: string;
};

/**
 * Drop a side-on video onto an existing sprint that doesn't have one yet.
 * Runs MediaPipe Pose in the browser, then persists the video file,
 * sprint_videos row, downsampled pose_frames, technique_assessments, and
 * fills sprint_metrics.avg_gct_ms / avg_flight_time_ms from the gait events.
 */
export default function AddVideoToSprint({ sprintId, athleteId, sessionId }: Props) {
  const router = useRouter();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [pose, setPose] = useState<PoseAnalysisResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dz = useDropzone({
    accept: { "video/*": [".mp4", ".mov", ".webm", ".m4v"] },
    maxFiles: 1,
    onDrop: (files) => {
      const f = files[0];
      if (!f) return;
      setVideoFile(f);
      setPose(null);
      setProgress(0);
      setError(null);
    },
  });

  async function runAnalysis() {
    if (!videoFile) return;
    setAnalysing(true);
    setError(null);
    try {
      const result = await analyseSprintVideo(videoFile, {
        frameStride: 2,
        onProgress: (pct) => setProgress(pct),
      });
      setPose(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalysing(false);
    }
  }

  async function save() {
    if (!videoFile || !pose) return;
    setSaving(true);
    setError(null);
    const sb = supabaseBrowser();
    try {
      const videoPath = `${athleteId}/${sessionId}/${videoFile.name}`;
      const upload = await sb.storage
        .from("raw-1080-files")
        .upload(videoPath, videoFile, { cacheControl: "3600", upsert: true });
      if (upload.error) throw new Error(upload.error.message);

      await sb.from("raw_files").insert({
        sprint_id: sprintId,
        session_id: sessionId,
        storage_bucket: "raw-1080-files",
        storage_path: videoPath,
        file_type: "mp4",
        sensor_source: "video_pose",
        size_bytes: videoFile.size,
      });

      const { data: videoRow, error: videoErr } = await sb
        .from("sprint_videos")
        .insert({
          sprint_id: sprintId,
          storage_bucket: "raw-1080-files",
          storage_path: videoPath,
          camera_side: pose.cameraSide,
          fps: pose.fps,
          duration_s: pose.durationS,
          width_px: pose.widthPx,
          height_px: pose.heightPx,
          sync_offset_ms: 0,
        })
        .select()
        .single();
      if (videoErr || !videoRow) throw new Error(videoErr?.message ?? "Failed to insert video.");

      const stride = Math.max(
        1,
        Math.floor(pose.frames.length / Math.min(pose.frames.length, 60)),
      );
      const frameRows = pose.frames
        .filter((_, i) => i % stride === 0)
        .map((f) => ({
          video_id: videoRow.id,
          frame_index: f.frameIndex,
          t_s: f.tS,
          keypoints: f.keypoints as unknown as Record<
            string,
            { x: number; y: number; z: number; visibility: number }
          >,
          joint_angles: f.jointAngles as unknown as Record<string, number | null>,
        }));
      if (frameRows.length) {
        const { error: framesErr } = await sb.from("pose_frames").insert(frameRows);
        if (framesErr) throw new Error(framesErr.message);
      }

      const techRows = pose.techniqueByPhase.map((t) => ({
        sprint_id: sprintId,
        video_id: videoRow.id,
        phase: t.phase,
        trunk_lean_deg: t.trunkLeanDeg,
        knee_drive_deg: t.kneeDriveDeg,
        ankle_dorsiflexion_deg: t.ankleDorsiflexionDeg,
        hip_extension_deg: t.hipExtensionDeg,
        contact_time_ms: t.contactTimeMs,
        flight_time_ms: t.flightTimeMs,
        flags: t.flags,
      }));
      if (techRows.length) {
        const { error: techErr } = await sb.from("technique_assessments").insert(techRows);
        if (techErr) throw new Error(techErr.message);
      }

      // Update sprint_metrics with video-derived contact / flight time.
      const meanCt = mean(pose.steps.map((s) => s.contactTimeMs));
      const meanFt = mean(
        pose.steps.map((s) => s.flightTimeMs).filter((x): x is number => x != null),
      );
      if (meanCt != null || meanFt != null) {
        await sb
          .from("sprint_metrics")
          .update({
            avg_gct_ms: meanCt,
            avg_flight_time_ms: meanFt,
          })
          .eq("sprint_id", sprintId);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ppa-muted">
        No video on this sprint yet. Drop a side-on clip and the pose analyser will fill in
        joint angles, foot strike / toe off, and contact / flight time.
      </p>
      <div
        {...dz.getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition ${
          dz.isDragActive ? "border-ppa-accent bg-red-50" : "border-gray-300"
        }`}
      >
        <input {...dz.getInputProps({ capture: "environment" })} />
        {videoFile ? (
          <p className="text-sm">
            <span className="font-medium">{videoFile.name}</span>{" "}
            <span className="text-ppa-muted">— drop another to replace</span>
          </p>
        ) : (
          <p className="text-sm text-ppa-muted">
            Drop / tap to choose a side-on .mp4 / .mov (camera opens directly on phone).
          </p>
        )}
      </div>
      {videoFile ? (
        <div className="flex items-center gap-3">
          {!pose ? (
            <Button onClick={runAnalysis} disabled={analysing}>
              {analysing ? `Analysing… ${(progress * 100).toFixed(0)}%` : "Analyse video"}
            </Button>
          ) : (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save video + analysis"}
            </Button>
          )}
          {pose ? (
            <Pill tone="good">
              {pose.frames.length} frames · {pose.steps.length} steps
            </Pill>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}

function mean(xs: number[]): number | null {
  const f = xs.filter((x) => Number.isFinite(x));
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
}
