import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, Metric, Pill, RankCard } from "@/components/ui";
import { rankValue, selectNorm, type Rank } from "@/lib/norms";
import type { Norm } from "@/types/database";
import VideoPlayback from "./VideoPlayback";
import SplitsChart from "./SplitsChart";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: session } = await sb
    .from("sessions")
    .select("*, athletes(*)")
    .eq("id", params.id)
    .maybeSingle();
  if (!session) notFound();

  const athlete = (session as typeof session & { athletes: { id: string; full_name: string; sport: string; level: string; sex: string; position_group: string; body_mass_kg: number | null } }).athletes;

  const { data: sprintsRaw } = await sb
    .from("sprints")
    .select("*")
    .eq("session_id", session.id)
    .order("sprint_number", { ascending: true });
  const sprints = sprintsRaw ?? [];
  const sprintIds = sprints.map((s) => s.id);

  const { data: metrics } = sprintIds.length
    ? await sb.from("sprint_metrics").select("*").in("sprint_id", sprintIds)
    : { data: [] };
  const m = (metrics ?? [])[0] ?? null;

  const { data: stepsRaw } = sprintIds.length
    ? await sb
        .from("step_events")
        .select("*")
        .in("sprint_id", sprintIds)
        .order("step_number", { ascending: true })
    : { data: [] };
  const steps = stepsRaw ?? [];

  const { data: norms } = await sb.from("norms").select("*");
  const ctx = {
    sport: athlete.sport as Norm["sport"],
    level: athlete.level as Norm["level"],
    sex: athlete.sex as Norm["sex"],
    position_group: athlete.position_group as Norm["position_group"],
  };
  const rank = (metricName: string, value: number | null | undefined): Rank =>
    rankValue(value, selectNorm(norms ?? [], metricName, ctx));

  const sprint = sprints[0] ?? null;
  const { data: videoRaw } = sprint
    ? await sb
        .from("sprint_videos")
        .select("*")
        .eq("sprint_id", sprint.id)
        .maybeSingle()
    : { data: null };
  const video = videoRaw ?? null;

  const { data: techniqueRaw } = sprint
    ? await sb
        .from("technique_assessments")
        .select("*")
        .eq("sprint_id", sprint.id)
        .order("phase", { ascending: true })
    : { data: [] };
  const technique = techniqueRaw ?? [];

  let videoUrl: string | null = null;
  if (video) {
    const { data: signed } = await sb.storage
      .from(video.storage_bucket)
      .createSignedUrl(video.storage_path, 60 * 60);
    videoUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{athlete.full_name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-ppa-muted">
            <Pill>{session.session_date}</Pill>
            <Pill>{athlete.sport}</Pill>
            <Pill>{athlete.level}</Pill>
            <Pill>{athlete.position_group}</Pill>
            {session.body_mass_kg ? <Pill>{session.body_mass_kg} kg</Pill> : null}
            {sprint ? <Pill>{sprint.test_type}</Pill> : null}
          </div>
        </div>
        <Link
          href={`/athletes/${athlete.id}`}
          className="text-sm text-ppa-accent hover:underline"
        >
          ← Back to {athlete.full_name}
        </Link>
      </div>

      <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <RankCard label="Max V" value={m?.max_v_ms} unit="m/s" rank={rank("max_v_ms", m?.max_v_ms)} />
        <RankCard label="F₀ rel" value={m?.f0_rel_nkg} unit="N/kg" rank={rank("f0_rel_nkg", m?.f0_rel_nkg)} />
        <RankCard label="V₀" value={m?.v0_ms} unit="m/s" rank={rank("v0_ms", m?.v0_ms)} />
        <RankCard label="Pmax rel" value={m?.pmax_rel_wkg} unit="W/kg" rank={rank("pmax_rel_wkg", m?.pmax_rel_wkg)} />
        <RankCard label="40m split" value={m?.split_40m_s} unit="s" rank={rank("split_40m_s", m?.split_40m_s)} />
      </section>

      <Card title="Headline">
        <p className="text-sm text-ppa-navy">
          {buildVerdict(m, technique.length > 0)}
        </p>
      </Card>

      {video && videoUrl ? (
        <Card title="Side-on technique video">
          <VideoPlayback
            videoUrl={videoUrl}
            videoMeta={{
              fps: video.fps,
              cameraSide: video.camera_side,
              widthPx: video.width_px,
              heightPx: video.height_px,
            }}
          />
          {technique.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {technique.map((t) => (
                <div key={t.id} className="rounded-md border border-gray-200 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-ppa-muted">
                    {t.phase.replace("_", " ")}
                  </div>
                  <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                    <dt className="text-ppa-muted">Trunk lean</dt>
                    <dd className="tabular">
                      {t.trunk_lean_deg == null ? "—" : `${t.trunk_lean_deg.toFixed(1)}°`}
                    </dd>
                    <dt className="text-ppa-muted">Knee flex</dt>
                    <dd className="tabular">
                      {t.knee_drive_deg == null ? "—" : `${t.knee_drive_deg.toFixed(1)}°`}
                    </dd>
                    <dt className="text-ppa-muted">Ankle</dt>
                    <dd className="tabular">
                      {t.ankle_dorsiflexion_deg == null ? "—" : `${t.ankle_dorsiflexion_deg.toFixed(1)}°`}
                    </dd>
                    <dt className="text-ppa-muted">Hip ext</dt>
                    <dd className="tabular">
                      {t.hip_extension_deg == null ? "—" : `${t.hip_extension_deg.toFixed(1)}°`}
                    </dd>
                    <dt className="text-ppa-muted">Contact</dt>
                    <dd className="tabular">
                      {t.contact_time_ms == null ? "—" : `${t.contact_time_ms.toFixed(0)} ms`}
                    </dd>
                    <dt className="text-ppa-muted">Flight</dt>
                    <dd className="tabular">
                      {t.flight_time_ms == null ? "—" : `${t.flight_time_ms.toFixed(0)} ms`}
                    </dd>
                  </dl>
                  {t.flags && t.flags.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-yellow-700">
                      {t.flags.map((f, i) => (
                        <li key={i}>⚠ {f}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title="Splits vs elite reference">
        <SplitsChart
          splits={{
            s10: m?.split_10m_s ?? null,
            s20: m?.split_20m_s ?? null,
            s30: m?.split_30m_s ?? null,
            s40: m?.split_40m_s ?? null,
          }}
        />
      </Card>

      <Card title="All metrics">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Metric label="Time to max V" value={m?.time_to_max_v_s} unit="s" />
          <Metric label="Dist to max V" value={m?.dist_to_max_v_m} unit="m" />
          <Metric label="Tau" value={m?.tau} unit="s" />
          <Metric label="F₀" value={m?.f0_n} unit="N" />
          <Metric label="F-V slope" value={m?.fv_slope} />
          <Metric label="F-V imbalance" value={m?.fv_imbalance_pct} unit="%" />
          <Metric label="RFmax" value={m?.rf_max_pct} unit="%" />
          <Metric label="DRF" value={m?.drf} unit="%/m·s" />
          <Metric label="Peak accel" value={m?.peak_accel_ms2} unit="m/s²" />
          <Metric label="Peak power" value={m?.peak_power_w} unit="W" />
          <Metric label="Peak power rel" value={m?.peak_power_rel_wkg} unit="W/kg" />
          <Metric label="V drop-off" value={m?.v_dropoff_pct} unit="%" />
          <Metric label="Step freq" value={m?.step_freq_hz} unit="Hz" />
          <Metric label="Avg step length" value={m?.avg_step_length_m} unit="m" />
          <Metric label="Total steps" value={m?.total_steps} />
          <Metric label="GCT (video)" value={m?.avg_gct_ms} unit="ms" />
          <Metric label="Flight (video)" value={m?.avg_flight_time_ms} unit="ms" />
        </div>
      </Card>

      {steps.length ? (
        <Card title="Per-step">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ppa-muted">
              <tr>
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Length (m)</th>
                <th className="py-2 pr-4">Velocity (m/s)</th>
                <th className="py-2 pr-4">Frequency (Hz)</th>
                <th className="py-2 pr-4">GCT (ms)</th>
                <th className="py-2 pr-4">Flight (ms)</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="py-2 pr-4 tabular">{s.step_number}</td>
                  <td className="py-2 pr-4 tabular">
                    {s.step_length_m != null ? s.step_length_m.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular">
                    {s.step_velocity_ms != null ? s.step_velocity_ms.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular">
                    {s.step_frequency_hz != null ? s.step_frequency_hz.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular">
                    {s.gct_ms != null ? s.gct_ms.toFixed(0) : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular">
                    {s.flight_time_ms != null ? s.flight_time_ms.toFixed(0) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}

function buildVerdict(
  m:
    | {
        max_v_ms: number | null;
        weakest_split: string | null;
        profile_classification: string | null;
        fv_profile_valid: boolean;
      }
    | null,
  hasVideo: boolean,
): string {
  if (!m) return "No metrics for this session yet.";
  const parts: string[] = [];
  if (m.max_v_ms) parts.push(`Hit ${m.max_v_ms.toFixed(2)} m/s peak.`);
  if (m.weakest_split) parts.push(`Weakest phase: ${m.weakest_split}.`);
  if (m.profile_classification) parts.push(`F-V balance: ${m.profile_classification}.`);
  if (!m.fv_profile_valid) parts.push("F-V profile invalid (resisted load).");
  if (hasVideo) parts.push("Side-on video analysed — see technique panel.");
  return parts.join(" ");
}
