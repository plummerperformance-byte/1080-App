"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { KEY_LANDMARKS, SKELETON_EDGES } from "@/lib/pose/skeleton";
import type { PoseLandmarkName } from "@/lib/pose/types";

type Keypoint = { x: number; y: number; z: number; visibility: number };

type FrameRow = {
  t_s: number;
  keypoints: Record<string, Keypoint>;
};

type ChartSample = { t: number; v: number; x: number };

type Props = {
  videoUrl: string;
  videoId: string;
  videoMeta: {
    fps: number | null;
    cameraSide: string;
    widthPx: number | null;
    heightPx: number | null;
    syncOffsetMs: number;
  };
  poseFrames: FrameRow[];
  chartSamples: ChartSample[] | null;
  /** Time of max V on the 1080 timeline, for the marker. */
  tMaxVS: number | null;
};

/**
 * The unified sprint analysis view: video + canvas stick-figure overlay,
 * synced velocity chart, sync-offset slider.
 *
 * Time mapping:
 *   1080 timeline t_1080 = video.currentTime + syncOffset (s)
 * Adjusting the sync slider shifts the chart marker / pose frame lookup
 * relative to the video so the coach can align them by eye.
 */
export default function SyncedSessionView({
  videoUrl,
  videoId,
  videoMeta,
  poseFrames,
  chartSamples,
  tMaxVS,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [syncMs, setSyncMs] = useState(videoMeta.syncOffsetMs);
  const [savingSync, setSavingSync] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Sort frames by t_s ascending — required for the binary search.
  const sortedFrames = useMemo(
    () => [...poseFrames].sort((a, b) => a.t_s - b.t_s),
    [poseFrames],
  );

  // Track the video <video> events.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setVideoTime(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  // Higher-frequency time updates while playing — timeupdate fires only ~4×/s.
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && !v.paused && !v.ended) {
        setVideoTime(v.currentTime);
        rafId = requestAnimationFrame(tick);
      }
    };
    if (playing) rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  // Find the closest pose frame to the current video time.
  const currentFrame = useMemo(() => {
    if (!sortedFrames.length) return null;
    const target = videoTime;
    let lo = 0;
    let hi = sortedFrames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedFrames[mid].t_s < target) lo = mid + 1;
      else hi = mid;
    }
    const a = sortedFrames[Math.max(0, lo - 1)];
    const b = sortedFrames[lo];
    return Math.abs(a.t_s - target) <= Math.abs(b.t_s - target) ? a : b;
  }, [sortedFrames, videoTime]);

  // Resize canvas to match video display size & redraw skeleton on each tick.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = video.clientWidth;
    const h = video.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!showSkeleton || !currentFrame) return;

    // Edges
    ctx.strokeStyle = "#EF4444";
    ctx.lineWidth = 2.5;
    for (const [a, b] of SKELETON_EDGES) {
      const ka = currentFrame.keypoints[a];
      const kb = currentFrame.keypoints[b];
      if (!ka || !kb) continue;
      if ((ka.visibility ?? 0) < 0.4 || (kb.visibility ?? 0) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(ka.x * w, ka.y * h);
      ctx.lineTo(kb.x * w, kb.y * h);
      ctx.stroke();
    }
    // Joints
    ctx.fillStyle = "#1F2937";
    for (const name of KEY_LANDMARKS) {
      const k = currentFrame.keypoints[name as PoseLandmarkName];
      if (!k || (k.visibility ?? 0) < 0.4) continue;
      ctx.beginPath();
      ctx.arc(k.x * w, k.y * h, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [currentFrame, showSkeleton, videoTime]);

  // Re-fit canvas on resize.
  useEffect(() => {
    const onResize = () => setVideoTime((t) => t); // trigger redraw
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---------- Synced velocity chart -----------------------------------
  const t1080 = videoTime + syncMs / 1000;
  const chartW = 600;
  const chartH = 160;
  const chartPath = useMemo(() => {
    if (!chartSamples || chartSamples.length < 2) return null;
    const tMin = chartSamples[0].t;
    const tMax = chartSamples[chartSamples.length - 1].t;
    const vMax = Math.max(...chartSamples.map((s) => s.v));
    const xToPx = (t: number) => ((t - tMin) / (tMax - tMin)) * chartW;
    const yToPx = (v: number) => chartH - (v / (vMax * 1.05)) * chartH;
    let d = "";
    for (let i = 0; i < chartSamples.length; i++) {
      const s = chartSamples[i];
      d += `${i === 0 ? "M" : "L"}${xToPx(s.t).toFixed(1)},${yToPx(s.v).toFixed(1)} `;
    }
    return { d, tMin, tMax, vMax, xToPx, yToPx };
  }, [chartSamples]);

  const onChartClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!chartPath) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * chartW;
      const t1080Clicked = chartPath.tMin + (px / chartW) * (chartPath.tMax - chartPath.tMin);
      const videoT = t1080Clicked - syncMs / 1000;
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(0, Math.min(duration, videoT));
      }
    },
    [chartPath, duration, syncMs],
  );

  // ---------- Sync slider persistence ---------------------------------
  const persistSync = useCallback(
    async (ms: number) => {
      setSavingSync(true);
      const sb = supabaseBrowser();
      await sb.from("sprint_videos").update({ sync_offset_ms: ms }).eq("id", videoId);
      setSavingSync(false);
    },
    [videoId],
  );

  const onSyncChange = (ms: number) => {
    setSyncMs(ms);
    // Debounce-ish: persist on change end. Keep simple — just call directly.
  };
  const onSyncCommit = (ms: number) => {
    persistSync(ms);
  };

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Video + skeleton overlay */}
        <div className="relative overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="block aspect-video w-full"
            playsInline
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          <div className="absolute right-2 top-2 flex gap-2">
            <button
              onClick={() => setShowSkeleton((v) => !v)}
              className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-ppa-navy shadow hover:bg-white"
            >
              {showSkeleton ? "Hide skeleton" : "Show skeleton"}
            </button>
          </div>
        </div>

        {/* Synced velocity chart */}
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-ppa-muted">
            <span className="font-medium uppercase tracking-wide">1080 velocity (synced)</span>
            <span className="tabular">
              t = {t1080.toFixed(2)}s · video = {videoTime.toFixed(2)}s
            </span>
          </div>
          {chartPath ? (
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="h-44 w-full cursor-crosshair"
              onClick={onChartClick}
              role="img"
              aria-label="Synced velocity chart"
            >
              <rect width={chartW} height={chartH} fill="#F9FAFB" />
              {/* gridlines */}
              {[0.25, 0.5, 0.75].map((p) => (
                <line
                  key={p}
                  x1={0}
                  x2={chartW}
                  y1={chartH * p}
                  y2={chartH * p}
                  stroke="#E5E7EB"
                  strokeDasharray="3 3"
                />
              ))}
              {/* velocity curve */}
              <path d={chartPath.d} fill="none" stroke="#1F2937" strokeWidth={1.8} />
              {/* max V marker */}
              {tMaxVS != null ? (
                <line
                  x1={chartPath.xToPx(tMaxVS)}
                  x2={chartPath.xToPx(tMaxVS)}
                  y1={0}
                  y2={chartH}
                  stroke="#9CA3AF"
                  strokeDasharray="2 4"
                />
              ) : null}
              {/* current time marker */}
              {t1080 >= chartPath.tMin && t1080 <= chartPath.tMax ? (
                <line
                  x1={chartPath.xToPx(t1080)}
                  x2={chartPath.xToPx(t1080)}
                  y1={0}
                  y2={chartH}
                  stroke="#EF4444"
                  strokeWidth={2}
                />
              ) : null}
              {/* axis labels */}
              <text x={4} y={12} fontSize={10} fill="#6B7280">
                v ≤ {chartPath.vMax.toFixed(1)} m/s
              </text>
              <text x={chartW - 4} y={chartH - 4} fontSize={10} fill="#6B7280" textAnchor="end">
                {chartPath.tMax.toFixed(2)}s
              </text>
            </svg>
          ) : (
            <p className="py-12 text-center text-xs text-ppa-muted">
              No chart samples saved for this sprint yet. Re-upload to populate.
            </p>
          )}
          <p className="mt-1 text-xs text-ppa-muted">Click the chart to scrub the video.</p>
        </div>
      </div>

      {/* Sync slider + meta */}
      <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-ppa-muted">
            Video ↔ 1080 sync
          </div>
          <input
            type="range"
            min={-2000}
            max={2000}
            step={20}
            value={syncMs}
            onChange={(e) => onSyncChange(Number(e.target.value))}
            onMouseUp={() => onSyncCommit(syncMs)}
            onTouchEnd={() => onSyncCommit(syncMs)}
            className="flex-1"
          />
          <div className="tabular w-24 text-right text-xs">
            {syncMs > 0 ? "+" : ""}
            {syncMs} ms
          </div>
          <button
            onClick={() => {
              setSyncMs(0);
              onSyncCommit(0);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          >
            Reset
          </button>
          {savingSync ? <span className="text-xs text-ppa-muted">Saving…</span> : null}
        </div>
        <p className="mt-2 text-xs text-ppa-muted">
          Drag until the foot strike on screen lines up with the velocity inflection.
          Positive offset = video starts after the 1080 sprint.
        </p>
      </div>

      {/* Frame info / scrub */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ppa-muted">
        <div>
          {videoMeta.fps ? `${videoMeta.fps.toFixed(0)} fps` : "fps —"} ·{" "}
          {videoMeta.widthPx && videoMeta.heightPx
            ? `${videoMeta.widthPx}×${videoMeta.heightPx}`
            : "size —"}{" "}
          · camera: {videoMeta.cameraSide} · {sortedFrames.length} pose frames stored
        </div>
        <div className="tabular">
          {videoTime.toFixed(2)}s / {duration.toFixed(2)}s
        </div>
      </div>
    </div>
  );
}
