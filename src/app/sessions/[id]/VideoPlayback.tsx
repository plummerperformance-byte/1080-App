"use client";

import { useEffect, useRef, useState } from "react";

export default function VideoPlayback({
  videoUrl,
  videoMeta,
}: {
  videoUrl: string;
  videoMeta: {
    fps: number | null;
    cameraSide: string;
    widthPx: number | null;
    heightPx: number | null;
  };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setT(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="aspect-video w-full"
          playsInline
        />
      </div>
      <div className="flex items-center justify-between text-xs text-ppa-muted">
        <div>
          {videoMeta.fps ? `${videoMeta.fps.toFixed(0)} fps` : "fps —"} ·{" "}
          {videoMeta.widthPx && videoMeta.heightPx
            ? `${videoMeta.widthPx}×${videoMeta.heightPx}`
            : "size —"}{" "}
          · camera side: {videoMeta.cameraSide}
        </div>
        <div className="tabular">{t.toFixed(2)}s</div>
      </div>
      <button
        onClick={toggle}
        className="rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50"
      >
        {playing ? "Pause" : "Play"}
      </button>
    </div>
  );
}
