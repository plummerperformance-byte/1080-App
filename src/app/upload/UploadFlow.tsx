"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { parse1080File, type ParsedSprint } from "@/lib/parser-1080";
import { analyseSprintVideo } from "@/lib/pose/analyser";
import type { PoseAnalysisResult } from "@/lib/pose/types";
import { Button, Card, Field, Pill, Select } from "@/components/ui";

type AthleteLite = {
  id: string;
  full_name: string;
  sport: string;
  level: string;
  sex: string;
  position_group: string;
  body_mass_kg: number | null;
};

export default function UploadFlow({
  athletes,
  defaultAthleteId,
}: {
  athletes: AthleteLite[];
  defaultAthleteId: string | null;
}) {
  const router = useRouter();
  const [athleteId, setAthleteId] = useState<string>(
    defaultAthleteId ?? athletes[0]?.id ?? "",
  );
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSprint | null>(null);
  const [pose, setPose] = useState<PoseAnalysisResult | null>(null);
  const [poseProgress, setPoseProgress] = useState<number>(0);
  const [parsing, setParsing] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const xlsxDz = useDropzone({
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    maxFiles: 1,
    onDrop: async (files) => {
      const f = files[0];
      if (!f) return;
      setXlsxFile(f);
      setParsed(null);
      setError(null);
      setParsing(true);
      try {
        const result = await parse1080File(f);
        setParsed(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setParsing(false);
      }
    },
  });

  const videoDz = useDropzone({
    accept: { "video/*": [".mp4", ".mov", ".webm", ".m4v"] },
    maxFiles: 1,
    onDrop: (files) => {
      const f = files[0];
      if (!f) return;
      setVideoFile(f);
      setPose(null);
      setPoseProgress(0);
    },
  });

  async function runPoseAnalysis() {
    if (!videoFile) return;
    setAnalysing(true);
    setError(null);
    try {
      const result = await analyseSprintVideo(videoFile, {
        frameStride: 2,
        onProgress: (pct) => setPoseProgress(pct),
      });
      setPose(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalysing(false);
    }
  }

  async function handleSave() {
    if (!parsed || !athleteId || !xlsxFile) return;
    setSaving(true);
    setError(null);
    const sb = supabaseBrowser();
    try {
      // 1. Sessions row
      const today = new Date().toISOString().slice(0, 10);
      const { data: session, error: sessionErr } = await sb
        .from("sessions")
        .insert({
          athlete_id: athleteId,
          session_date: today,
          body_mass_kg: parsed.bodyMassKg,
          notes: pose ? "Includes side-on technique video." : null,
        })
        .select()
        .single();
      if (sessionErr || !session) throw new Error(sessionErr?.message ?? "Failed to create session.");

      // 2. Sprints row
      const testType =
        parsed.avgLoadKg > parsed.bodyMassKg * 0.05 ? "resisted_sprint" : "unresisted_sprint";
      const { data: sprint, error: sprintErr } = await sb
        .from("sprints")
        .insert({
          session_id: session.id,
          sprint_number: 1,
          test_type: testType,
          sensor_source: "1080_sprint",
          load_kg: parsed.avgLoadKg,
          load_pct_bm: (parsed.avgLoadKg / parsed.bodyMassKg) * 100,
          distance_target_m: 40,
          distance_reached_m: parsed.maxDistM,
          duration_s: parsed.durationS,
        })
        .select()
        .single();
      if (sprintErr || !sprint) throw new Error(sprintErr?.message ?? "Failed to create sprint.");

      // 3. Sprint metrics
      const m = parsed.metrics;
      const { error: metricsErr } = await sb.from("sprint_metrics").insert({
        sprint_id: sprint.id,
        max_v_ms: m.maxVms,
        time_to_max_v_s: m.timeToMaxVS,
        dist_to_max_v_m: m.distToMaxVM,
        time_to_90pct_v_s: m.timeTo90PctVS,
        dist_to_90pct_v_m: m.distTo90PctVM,
        split_10m_s: m.split10mS,
        split_20m_s: m.split20mS,
        split_30m_s: m.split30mS,
        split_40m_s: m.split40mS,
        tau: m.tau,
        f0_n: m.f0N,
        f0_rel_nkg: m.f0RelNkg,
        v0_ms: m.v0Ms,
        pmax_w: m.pmaxW,
        pmax_rel_wkg: m.pmaxRelWkg,
        fv_slope: m.fvSlope,
        fv_imbalance_pct: m.fvImbalancePct,
        rf_max_pct: m.rfMaxPct,
        drf: m.drf,
        peak_accel_ms2: m.peakAccelMs2,
        peak_power_w: m.peakPowerW,
        peak_power_rel_wkg: m.peakPowerRelWkg,
        v_dropoff_pct: m.vDropoffPct,
        total_steps: m.totalSteps,
        step_freq_hz: m.stepFreqHz,
        avg_step_length_m: m.avgStepLengthM,
        step_length_std_m: m.stepLengthStdM,
        avg_gct_ms: pose ? meanCt(pose) : null,
        avg_flight_time_ms: pose ? meanFt(pose) : null,
        profile_classification: parsed.classification.fvBalance,
        weakest_split: parsed.classification.sprintProfile,
        fv_profile_valid: parsed.fvProfileValid,
      });
      if (metricsErr) throw new Error(metricsErr.message);

      // 4. Step events from 1080
      if (parsed.steps.length) {
        const stepRows = parsed.steps.map((s) => ({
          sprint_id: sprint.id,
          step_number: s.stepNumber,
          step_length_m: s.stepLengthM,
          step_velocity_ms: s.stepVelocityMs,
          step_frequency_hz: s.stepFrequencyHz,
          peak_force_n: s.peakForceN,
          sensor_source: "1080_sprint" as const,
        }));
        const { error: stepErr } = await sb.from("step_events").insert(stepRows);
        if (stepErr) throw new Error(stepErr.message);
      }

      // 5. Upload xlsx to Storage (non-blocking)
      try {
        const xlsxPath = `${athleteId}/${session.id}/${xlsxFile.name}`;
        await sb.storage.from("raw-1080-files").upload(xlsxPath, xlsxFile, {
          cacheControl: "3600",
          upsert: false,
        });
        await sb.from("raw_files").insert({
          sprint_id: sprint.id,
          session_id: session.id,
          storage_bucket: "raw-1080-files",
          storage_path: xlsxPath,
          file_type: "xlsx",
          sensor_source: "1080_sprint",
          size_bytes: xlsxFile.size,
        });
      } catch {
        // Non-fatal — proceed.
      }

      // 6. Video + pose analysis (Phase 2)
      if (videoFile && pose) {
        try {
          const videoPath = `${athleteId}/${session.id}/${videoFile.name}`;
          await sb.storage.from("raw-1080-files").upload(videoPath, videoFile, {
            cacheControl: "3600",
            upsert: false,
          });
          await sb.from("raw_files").insert({
            sprint_id: sprint.id,
            session_id: session.id,
            storage_bucket: "raw-1080-files",
            storage_path: videoPath,
            file_type: "mp4",
            sensor_source: "video_pose",
            size_bytes: videoFile.size,
          });
          const { data: videoRow } = await sb
            .from("sprint_videos")
            .insert({
              sprint_id: sprint.id,
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
          if (videoRow) {
            // Pose frames (downsampled to ~5 Hz to keep storage reasonable)
            const stride = Math.max(1, Math.floor(pose.frames.length / Math.min(pose.frames.length, 60)));
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
              await sb.from("pose_frames").insert(frameRows);
            }
            const techRows = pose.techniqueByPhase.map((t) => ({
              sprint_id: sprint.id,
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
              await sb.from("technique_assessments").insert(techRows);
            }
          }
        } catch (err) {
          console.warn("Video upload / pose persist failed", err);
        }
      }

      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const athlete = useMemo(
    () => athletes.find((a) => a.id === athleteId) ?? null,
    [athletes, athleteId],
  );

  return (
    <div className="space-y-5">
      <Card title="1. Athlete">
        {athletes.length === 0 ? (
          <p className="text-sm text-ppa-muted">
            No athletes yet — add one on the{" "}
            <a href="/athletes" className="text-ppa-accent hover:underline">athletes page</a> first.
          </p>
        ) : (
          <div className="flex items-end gap-3">
            <Field label="Athlete">
              <Select
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
              >
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name} · {a.sport} · {a.level}
                  </option>
                ))}
              </Select>
            </Field>
            {athlete?.body_mass_kg ? (
              <Pill>{athlete.body_mass_kg} kg</Pill>
            ) : null}
          </div>
        )}
      </Card>

      <Card title="2. 1080 xlsx">
        <div
          {...xlsxDz.getRootProps()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition ${
            xlsxDz.isDragActive ? "border-ppa-accent bg-red-50" : "border-gray-300"
          }`}
        >
          <input {...xlsxDz.getInputProps()} />
          {xlsxFile ? (
            <p className="text-sm">
              <span className="font-medium">{xlsxFile.name}</span>{" "}
              <span className="text-ppa-muted">— drop a different file to replace</span>
            </p>
          ) : (
            <p className="text-sm text-ppa-muted">Drop a 1080 .xlsx here, or click to browse.</p>
          )}
        </div>
        {parsing ? <p className="mt-2 text-sm text-ppa-muted">Parsing…</p> : null}
        {parsed ? <ParsedPreview parsed={parsed} /> : null}
      </Card>

      <Card title="3. Side-on sprint video (optional)">
        <p className="mb-3 text-xs text-ppa-muted">
          Phase 2: side-on video → MediaPipe Pose → joint angles, foot strike / toe off, contact /
          flight time. Runs in your browser, video file ≤ 50 MB ideal.
        </p>
        <div
          {...videoDz.getRootProps()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition ${
            videoDz.isDragActive ? "border-ppa-accent bg-red-50" : "border-gray-300"
          }`}
        >
          <input {...videoDz.getInputProps()} />
          {videoFile ? (
            <p className="text-sm">
              <span className="font-medium">{videoFile.name}</span>{" "}
              <span className="text-ppa-muted">— drop a different file to replace</span>
            </p>
          ) : (
            <p className="text-sm text-ppa-muted">Drop a side-on .mp4 / .mov here.</p>
          )}
        </div>
        {videoFile ? (
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={runPoseAnalysis} disabled={analysing}>
              {analysing ? `Analysing… ${(poseProgress * 100).toFixed(0)}%` : "Analyse video"}
            </Button>
            {pose ? (
              <Pill tone="good">
                {pose.frames.length} frames · {pose.steps.length} steps · {pose.events.length}{" "}
                events
              </Pill>
            ) : null}
          </div>
        ) : null}
        {pose ? <PosePreview pose={pose} /> : null}
      </Card>

      <Card title="4. Save">
        {error ? <p className="mb-2 text-sm text-ppa-accent">{error}</p> : null}
        <Button onClick={handleSave} disabled={!parsed || !athleteId || saving}>
          {saving ? "Saving…" : pose ? "Save session + video" : "Save session"}
        </Button>
      </Card>
    </div>
  );
}

function ParsedPreview({ parsed }: { parsed: ParsedSprint }) {
  const m = parsed.metrics;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <PreviewMetric label="Max V" value={m.maxVms} unit="m/s" digits={2} />
      <PreviewMetric label="F₀ rel" value={m.f0RelNkg} unit="N/kg" digits={2} />
      <PreviewMetric label="V₀" value={m.v0Ms} unit="m/s" digits={2} />
      <PreviewMetric label="Pmax rel" value={m.pmaxRelWkg} unit="W/kg" digits={2} />
      <PreviewMetric label="10m" value={m.split10mS} unit="s" digits={2} />
      <PreviewMetric label="40m" value={m.split40mS} unit="s" digits={2} />
      <PreviewMetric label="Avg load" value={parsed.avgLoadKg} unit="kg" digits={2} />
      <PreviewMetric label="Distance reached" value={parsed.maxDistM} unit="m" digits={1} />
      <div className="md:col-span-2 lg:col-span-4 mt-2 flex flex-wrap gap-2">
        <Pill tone={parsed.fvProfileValid ? "good" : "warn"}>
          F-V valid: {String(parsed.fvProfileValid)}
        </Pill>
        <Pill>Profile: {parsed.classification.sprintProfile}</Pill>
        {parsed.classification.fvBalance ? (
          <Pill>Balance: {parsed.classification.fvBalance}</Pill>
        ) : null}
        {parsed.warnings.map((w, i) => (
          <Pill tone="warn" key={i}>{w}</Pill>
        ))}
      </div>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  unit,
  digits = 2,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  digits?: number;
}) {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="text-xs uppercase tracking-wide text-ppa-muted">{label}</div>
      <div className="tabular text-lg font-semibold">
        {value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits)}{" "}
        <span className="text-xs text-ppa-muted">{unit}</span>
      </div>
    </div>
  );
}

function PosePreview({ pose }: { pose: PoseAnalysisResult }) {
  return (
    <div className="mt-4 space-y-2">
      <div className="grid gap-3 md:grid-cols-3">
        {pose.techniqueByPhase.map((t) => (
          <div key={t.phase} className="rounded-md border border-gray-200 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ppa-muted">
              {t.phase.replace("_", " ")}
            </div>
            <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
              <dt className="text-ppa-muted">Trunk lean</dt>
              <dd className="tabular">
                {t.trunkLeanDeg == null ? "—" : `${t.trunkLeanDeg.toFixed(1)}°`}
              </dd>
              <dt className="text-ppa-muted">Knee flex</dt>
              <dd className="tabular">
                {t.kneeDriveDeg == null ? "—" : `${t.kneeDriveDeg.toFixed(1)}°`}
              </dd>
              <dt className="text-ppa-muted">Contact</dt>
              <dd className="tabular">
                {t.contactTimeMs == null ? "—" : `${t.contactTimeMs.toFixed(0)} ms`}
              </dd>
              <dt className="text-ppa-muted">Flight</dt>
              <dd className="tabular">
                {t.flightTimeMs == null ? "—" : `${t.flightTimeMs.toFixed(0)} ms`}
              </dd>
            </dl>
            {t.flags.length ? (
              <ul className="mt-2 space-y-1 text-xs text-yellow-700">
                {t.flags.map((f, i) => (
                  <li key={i}>⚠ {f}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      {pose.warnings.length ? (
        <div className="space-y-1 text-xs text-yellow-700">
          {pose.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function meanCt(pose: PoseAnalysisResult): number | null {
  const xs = pose.steps.map((s) => s.contactTimeMs).filter((x) => Number.isFinite(x));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function meanFt(pose: PoseAnalysisResult): number | null {
  const xs = pose.steps.map((s) => s.flightTimeMs).filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
