"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RankCard } from "@/components/RankCard";
import { Row } from "@/components/Row";
import { rankValue, selectNorm } from "@/lib/norms";
import { createClient } from "@/lib/supabase/client";
import type {
  Athlete,
  Norm,
  Session,
  Sprint,
  SprintMetrics,
  StepEvent,
} from "@/types/database";

type Bundle = {
  session: Session;
  athlete: Athlete;
  sprint: Sprint;
  metrics: SprintMetrics;
  steps: StepEvent[];
  norms: Norm[];
};

function fmt(n: number | null | undefined, digits = 2, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

export default function SessionPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const sessionRes = await supabase
        .from("sessions")
        .select("*")
        .eq("id", params.id)
        .single();
      if (sessionRes.error || !sessionRes.data) {
        setError(sessionRes.error?.message ?? "Session not found");
        return;
      }
      const session = sessionRes.data;

      const [athleteRes, sprintRes, normsRes] = await Promise.all([
        supabase.from("athletes").select("*").eq("id", session.athlete_id).single(),
        supabase
          .from("sprints")
          .select("*")
          .eq("session_id", session.id)
          .order("sprint_number", { ascending: true })
          .limit(1)
          .single(),
        supabase.from("norms").select("*"),
      ]);
      if (athleteRes.error || !athleteRes.data) {
        setError(athleteRes.error?.message ?? "Athlete not found");
        return;
      }
      if (sprintRes.error || !sprintRes.data) {
        setError(sprintRes.error?.message ?? "Sprint not found");
        return;
      }
      if (normsRes.error) {
        setError(normsRes.error.message);
        return;
      }

      const [metricsRes, stepsRes] = await Promise.all([
        supabase
          .from("sprint_metrics")
          .select("*")
          .eq("sprint_id", sprintRes.data.id)
          .single(),
        supabase
          .from("step_events")
          .select("*")
          .eq("sprint_id", sprintRes.data.id)
          .order("step_number", { ascending: true }),
      ]);
      if (metricsRes.error || !metricsRes.data) {
        setError(metricsRes.error?.message ?? "Metrics not found");
        return;
      }

      setBundle({
        session,
        athlete: athleteRes.data,
        sprint: sprintRes.data,
        metrics: metricsRes.data,
        steps: stepsRes.data ?? [],
        norms: normsRes.data ?? [],
      });
    }
    void load();
  }, [params.id, supabase]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-ppa-red">
        {error}
      </div>
    );
  }
  if (!bundle) {
    return <div className="text-sm text-ppa-muted">Loading session…</div>;
  }

  const { session, athlete, sprint, metrics, steps, norms } = bundle;
  const ctx = {
    sport: athlete.sport,
    level: athlete.level,
    sex: athlete.sex,
    position_group: athlete.position_group,
  };
  const n = (metric: string) => selectNorm(norms, metric, ctx);
  const r = (metric: string, value: number | null) =>
    rankValue(value, n(metric));

  const fvChart = [
    { v: 0, f: metrics.f0_rel_nkg ?? 0 },
    { v: metrics.v0_ms ?? 0, f: 0 },
  ];

  const splitsChart = [
    { label: "10 m", actual: metrics.split_10m_s, elite: n("split_10m_s")?.great_max ?? null },
    { label: "20 m", actual: metrics.split_20m_s, elite: null },
    { label: "30 m", actual: metrics.split_30m_s, elite: null },
    { label: "40 m", actual: metrics.split_40m_s, elite: n("split_40m_s")?.great_max ?? null },
  ];

  const fvValid = metrics.fv_profile_valid;

  return (
    <section className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-ppa-muted">
            <Link href={`/athletes/${athlete.id}`} className="hover:text-ppa-red">
              {athlete.full_name}
            </Link>{" "}
            · {athlete.sport.replace("_", " ")} · {athlete.level.replace("_", " ")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            {session.session_date} · Sprint #{sprint.sprint_number}
          </h1>
          <div className="mt-1 text-sm text-ppa-muted">
            {sprint.test_type.replace(/_/g, " ")} ·{" "}
            {sprint.distance_reached_m != null
              ? `${sprint.distance_reached_m.toFixed(1)} m reached`
              : ""}{" "}
            ·{" "}
            {sprint.load_kg != null
              ? `${sprint.load_kg.toFixed(2)} kg avg load`
              : ""}
          </div>
        </div>
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            fvValid
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-yellow-200 bg-yellow-50 text-yellow-800"
          }`}
        >
          {fvValid
            ? `F-V profile: valid · ${metrics.profile_classification ?? "—"}`
            : `F-V profile: invalid (treat F₀/V₀/Pmax as resisted descriptors)`}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <RankCard
          label="Max V"
          value={fmt(metrics.max_v_ms, 2)}
          unit="m/s"
          band={r("max_v_ms", metrics.max_v_ms)}
        />
        <RankCard
          label="F₀ rel"
          value={fmt(metrics.f0_rel_nkg, 2)}
          unit="N/kg"
          band={r("f0_rel_nkg", metrics.f0_rel_nkg)}
        />
        <RankCard
          label="V₀"
          value={fmt(metrics.v0_ms, 2)}
          unit="m/s"
          band={r("v0_ms", metrics.v0_ms)}
        />
        <RankCard
          label="Pmax rel"
          value={fmt(metrics.pmax_rel_wkg, 1)}
          unit="W/kg"
          band={r("pmax_rel_wkg", metrics.pmax_rel_wkg)}
        />
        <RankCard
          label="40 m split"
          value={fmt(metrics.split_40m_s, 2)}
          unit="s"
          band={r("split_40m_s", metrics.split_40m_s)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ppa-muted">
            F–V profile
          </h2>
          <div className="mt-2 text-xs text-ppa-muted">
            {fvValid
              ? "Linear F(v). F₀/V₀ anchors with slope F₀/V₀."
              : "Chart shown for reference — fit is invalid for this sprint."}
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fvChart} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="v"
                  type="number"
                  domain={[0, "dataMax"]}
                  label={{ value: "Velocity (m/s)", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  label={{ value: "Force (N/kg)", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(v) => (typeof v === "number" ? v.toFixed(2) : "—")}
                />
                <Line
                  type="linear"
                  dataKey="f"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ppa-muted">
            Splits vs elite reference
          </h2>
          <div className="mt-2 text-xs text-ppa-muted">
            Dashed line = "Great" band boundary at 10/40 m (lower is better).
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={splitsChart} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis label={{ value: "Time (s)", angle: -90, position: "insideLeft" }} />
                <Tooltip
                  formatter={(v) => (typeof v === "number" ? v.toFixed(3) : "—")}
                />
                <Legend />
                <Bar dataKey="actual" fill="#1F2937" name="Actual" />
                <Bar dataKey="elite" fill="#86EFAC" name="Great boundary" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ppa-muted">
            Full metrics
          </h2>
          <div className="mt-4">
            <Row label="Body mass" value={fmt(session.body_mass_kg, 1, " kg")} />
            <Row label="Distance reached" value={fmt(sprint.distance_reached_m, 2, " m")} />
            <Row label="Duration" value={fmt(sprint.duration_s, 2, " s")} />
            <Row label="Max V" value={fmt(metrics.max_v_ms, 3, " m/s")} />
            <Row label="Time to max V" value={fmt(metrics.time_to_max_v_s, 3, " s")} sub={fmt(metrics.dist_to_max_v_m, 2, " m")} />
            <Row label="Time to 90% V" value={fmt(metrics.time_to_90pct_v_s, 3, " s")} sub={fmt(metrics.dist_to_90pct_v_m, 2, " m")} />
            <Row label="τ" value={fmt(metrics.tau, 3)} />
            <Row label="F₀" value={fmt(metrics.f0_rel_nkg, 2, " N/kg")} sub={fmt(metrics.f0_n, 1, " N total")} />
            <Row label="V₀" value={fmt(metrics.v0_ms, 3, " m/s")} />
            <Row label="Pmax" value={fmt(metrics.pmax_rel_wkg, 2, " W/kg")} sub={fmt(metrics.pmax_w, 0, " W total")} />
            <Row label="F-V slope" value={fmt(metrics.fv_slope, 3)} />
            <Row label="F-V imbalance" value={fmt(metrics.fv_imbalance_pct, 1, "%")} />
            <Row label="RFmax" value={fmt(metrics.rf_max_pct, 2, "%")} />
            <Row label="DRF" value={fmt(metrics.drf, 3)} />
            <Row label="Peak accel" value={fmt(metrics.peak_accel_ms2, 2, " m/s²")} />
            <Row label="Peak power" value={fmt(metrics.peak_power_rel_wkg, 2, " W/kg")} sub={fmt(metrics.peak_power_w, 0, " W total")} />
            <Row label="V drop-off" value={fmt(metrics.v_dropoff_pct, 2, "%")} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ppa-muted">
            Step table ({steps.length})
          </h2>
          <div className="mt-4 overflow-y-auto" style={{ maxHeight: 480 }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-ppa-muted">
                <tr>
                  <th className="py-2">#</th>
                  <th className="py-2 text-right">Length (m)</th>
                  <th className="py-2 text-right">Velocity (m/s)</th>
                  <th className="py-2 text-right">Freq (Hz)</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1 font-medium">{s.step_number}</td>
                    <td className="py-1 text-right tabular">{fmt(s.step_length_m, 2)}</td>
                    <td className="py-1 text-right tabular">{fmt(s.step_velocity_ms, 3)}</td>
                    <td className="py-1 text-right tabular">{fmt(s.step_frequency_hz, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {session.notes ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-ppa-muted">
            Notes
          </div>
          <div className="mt-1">{session.notes}</div>
        </div>
      ) : null}
    </section>
  );
}
