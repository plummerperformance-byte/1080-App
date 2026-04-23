"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Select } from "@/components/Select";
import { selectNorm } from "@/lib/norms";
import { createClient } from "@/lib/supabase/client";
import type { Athlete, Norm } from "@/types/database";

type MetricKey =
  | "max_v_ms"
  | "f0_rel_nkg"
  | "v0_ms"
  | "pmax_rel_wkg"
  | "split_10m_s"
  | "split_20m_s"
  | "split_30m_s"
  | "split_40m_s"
  | "rf_max_pct"
  | "drf"
  | "step_freq_hz"
  | "avg_step_length_m";

type MetricDef = {
  key: MetricKey;
  label: string;
  unit: string;
  digits: number;
};

const METRICS: ReadonlyArray<MetricDef> = [
  { key: "max_v_ms", label: "Max V", unit: "m/s", digits: 2 },
  { key: "f0_rel_nkg", label: "F₀ (rel)", unit: "N/kg", digits: 2 },
  { key: "v0_ms", label: "V₀", unit: "m/s", digits: 2 },
  { key: "pmax_rel_wkg", label: "Pmax (rel)", unit: "W/kg", digits: 1 },
  { key: "split_10m_s", label: "10 m split", unit: "s", digits: 3 },
  { key: "split_20m_s", label: "20 m split", unit: "s", digits: 3 },
  { key: "split_30m_s", label: "30 m split", unit: "s", digits: 3 },
  { key: "split_40m_s", label: "40 m split", unit: "s", digits: 3 },
  { key: "rf_max_pct", label: "RFmax", unit: "%", digits: 2 },
  { key: "drf", label: "DRF", unit: "%", digits: 3 },
  { key: "step_freq_hz", label: "Step frequency", unit: "Hz", digits: 2 },
  { key: "avg_step_length_m", label: "Avg step length", unit: "m", digits: 2 },
];

type Row = {
  sessionId: string;
  date: string;
  max_v_ms: number | null;
  f0_rel_nkg: number | null;
  v0_ms: number | null;
  pmax_rel_wkg: number | null;
  split_10m_s: number | null;
  split_20m_s: number | null;
  split_30m_s: number | null;
  split_40m_s: number | null;
  rf_max_pct: number | null;
  drf: number | null;
  step_freq_hz: number | null;
  avg_step_length_m: number | null;
};

type RawSession = {
  id: string;
  session_date: string;
  sprints:
    | Array<{
        id: string;
        sprint_metrics:
          | {
              max_v_ms: number | null;
              f0_rel_nkg: number | null;
              v0_ms: number | null;
              pmax_rel_wkg: number | null;
              split_10m_s: number | null;
              split_20m_s: number | null;
              split_30m_s: number | null;
              split_40m_s: number | null;
              rf_max_pct: number | null;
              drf: number | null;
              step_freq_hz: number | null;
              avg_step_length_m: number | null;
            }
          | null;
      }>
    | null;
};

function num(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function AthleteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [norms, setNorms] = useState<Norm[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("max_v_ms");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [athleteRes, sessionsRes, normsRes] = await Promise.all([
        supabase.from("athletes").select("*").eq("id", params.id).single(),
        supabase
          .from("sessions")
          .select(
            `id, session_date,
             sprints (
               id,
               sprint_metrics (
                 max_v_ms, f0_rel_nkg, v0_ms, pmax_rel_wkg,
                 split_10m_s, split_20m_s, split_30m_s, split_40m_s,
                 rf_max_pct, drf, step_freq_hz, avg_step_length_m
               )
             )`,
          )
          .eq("athlete_id", params.id)
          .order("session_date", { ascending: true }),
        supabase.from("norms").select("*"),
      ]);
      if (athleteRes.error || !athleteRes.data) {
        setError(athleteRes.error?.message ?? "Athlete not found");
        setLoading(false);
        return;
      }
      setAthlete(athleteRes.data);
      if (normsRes.data) setNorms(normsRes.data);

      const raw = (sessionsRes.data as unknown as RawSession[] | null) ?? [];
      const flat: Row[] = raw.map((s) => {
        const firstSprint = s.sprints?.[0] ?? null;
        // supabase-js returns embedded 1:1 as an object; 1:many as array.
        // sprint_metrics is 1:1 with sprints (PK=FK), so it's typed as object
        // but supabase sometimes returns it wrapped — normalise.
        const rawM = firstSprint?.sprint_metrics;
        const m = Array.isArray(rawM) ? rawM[0] ?? null : rawM;
        return {
          sessionId: s.id,
          date: s.session_date,
          max_v_ms: num(m?.max_v_ms),
          f0_rel_nkg: num(m?.f0_rel_nkg),
          v0_ms: num(m?.v0_ms),
          pmax_rel_wkg: num(m?.pmax_rel_wkg),
          split_10m_s: num(m?.split_10m_s),
          split_20m_s: num(m?.split_20m_s),
          split_30m_s: num(m?.split_30m_s),
          split_40m_s: num(m?.split_40m_s),
          rf_max_pct: num(m?.rf_max_pct),
          drf: num(m?.drf),
          step_freq_hz: num(m?.step_freq_hz),
          avg_step_length_m: num(m?.avg_step_length_m),
        };
      });
      setRows(flat);
      setLoading(false);
    }
    void load();
  }, [params.id, supabase]);

  if (loading) {
    return <div className="text-sm text-ppa-muted">Loading…</div>;
  }
  if (error || !athlete) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-ppa-red">
        {error ?? "Athlete not found"}
      </div>
    );
  }

  const ctx = {
    sport: athlete.sport,
    level: athlete.level,
    sex: athlete.sex,
    position_group: athlete.position_group,
  };
  const currentMetric = METRICS.find((m) => m.key === selectedMetric)!;
  const norm = selectNorm(norms, selectedMetric, ctx);

  // Build chart data for the selected metric
  const chartData = rows.map((r) => ({
    date: r.date,
    value: r[selectedMetric],
  }));

  const values = chartData
    .map((d) => d.value)
    .filter((v): v is number => v != null);
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 1;

  // Compute y-axis domain with padding, making sure the norm bands are visible
  let yMin = dataMin;
  let yMax = dataMax;
  if (norm) {
    const bands = [norm.poor_max, norm.fair_max, norm.good_max, norm.great_max]
      .filter((v): v is number => v != null)
      .map(Number);
    if (bands.length) {
      yMin = Math.min(yMin, ...bands);
      yMax = Math.max(yMax, ...bands);
    }
  }
  const pad = (yMax - yMin) * 0.15 || 0.5;
  yMin -= pad;
  yMax += pad;

  // Build reference areas for rank bands
  const bands = norm
    ? buildBands(norm, yMin, yMax)
    : [];

  return (
    <section className="space-y-8">
      <div>
        <div className="text-sm text-ppa-muted">
          <Link href="/athletes" className="hover:text-ppa-red">
            Athletes
          </Link>{" "}
          / {athlete.full_name}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{athlete.full_name}</h1>
        <div className="mt-1 text-sm text-ppa-muted">
          {athlete.sport.replace(/_/g, " ")} ·{" "}
          {athlete.level.replace(/_/g, " ")} ·{" "}
          {athlete.position ?? athlete.position_group.replace(/_/g, " ")}
          {athlete.body_mass_kg != null
            ? ` · ${athlete.body_mass_kg} kg`
            : ""}
          {athlete.height_cm != null ? ` · ${athlete.height_cm} cm` : ""}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-ppa-muted">
          No sessions yet for this athlete.{" "}
          <Link href="/upload" className="text-ppa-red">
            Upload one
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xs">
                <Select
                  label="Metric"
                  options={METRICS.map((m) => ({
                    value: m.key,
                    label: `${m.label} (${m.unit})`,
                  }))}
                  value={selectedMetric}
                  onChange={(e) =>
                    setSelectedMetric(e.target.value as MetricKey)
                  }
                />
              </div>
              <div className="text-xs text-ppa-muted">
                Coloured bands = rank ranges for {athlete.sport.replace(/_/g, " ")} /{" "}
                {athlete.level.replace(/_/g, " ")} /{" "}
                {athlete.position_group.replace(/_/g, " ")}.{" "}
                {norm
                  ? norm.source ?? ""
                  : "No norms seeded for this metric + context yet."}
              </div>
            </div>

            <div className="mt-4 h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    domain={[yMin, yMax]}
                    tickFormatter={(v: number) =>
                      Number.isFinite(v) ? v.toFixed(currentMetric.digits) : ""
                    }
                    label={{
                      value: `${currentMetric.label} (${currentMetric.unit})`,
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  {bands.map((b, i) => (
                    <ReferenceArea
                      key={i}
                      y1={b.y1}
                      y2={b.y2}
                      fill={b.fill}
                      fillOpacity={0.15}
                      ifOverflow="hidden"
                      label={{
                        value: b.label,
                        position: "insideRight",
                        fill: "#6B7280",
                        fontSize: 10,
                      }}
                    />
                  ))}
                  <Tooltip
                    formatter={(v) =>
                      typeof v === "number"
                        ? v.toFixed(currentMetric.digits)
                        : "—"
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-3 text-sm font-medium">
              Sessions ({rows.length})
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-ppa-muted">
                <tr>
                  <th className="px-6 py-2">Date</th>
                  <th className="px-6 py-2 text-right">Max V</th>
                  <th className="px-6 py-2 text-right">F₀ rel</th>
                  <th className="px-6 py-2 text-right">V₀</th>
                  <th className="px-6 py-2 text-right">Pmax rel</th>
                  <th className="px-6 py-2 text-right">10 m</th>
                  <th className="px-6 py-2 text-right">40 m</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr
                    key={r.sessionId}
                    className="cursor-pointer border-b border-gray-100 transition last:border-0 hover:bg-gray-50"
                    onClick={() =>
                      (window.location.href = `/sessions/${r.sessionId}`)
                    }
                  >
                    <td className="px-6 py-3 font-medium">{r.date}</td>
                    <td className="px-6 py-3 text-right tabular">
                      {fmt(r.max_v_ms, 2)}
                    </td>
                    <td className="px-6 py-3 text-right tabular">
                      {fmt(r.f0_rel_nkg, 2)}
                    </td>
                    <td className="px-6 py-3 text-right tabular">
                      {fmt(r.v0_ms, 2)}
                    </td>
                    <td className="px-6 py-3 text-right tabular">
                      {fmt(r.pmax_rel_wkg, 2)}
                    </td>
                    <td className="px-6 py-3 text-right tabular">
                      {fmt(r.split_10m_s, 3)}
                    </td>
                    <td className="px-6 py-3 text-right tabular">
                      {fmt(r.split_40m_s, 3)}
                    </td>
                    <td className="px-6 py-3 text-right text-ppa-muted">
                      Open →
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

type Band = { y1: number; y2: number; fill: string; label: string };

// Rank-band colours match the Tailwind `rank-*` palette (lightened for bg).
const BAND_FILLS: Record<string, string> = {
  Poor: "#FCA5A5",
  Fair: "#FDE68A",
  Good: "#FEF3C7",
  Great: "#BBF7D0",
  Elite: "#86EFAC",
};

/**
 * Build the <ReferenceArea> rects for a norm. For higher-is-better metrics
 * the bands go low→high as Poor→Elite; for lower-is-better they're
 * inverted. We clamp each band against the overall y-axis range so the
 * reference areas don't overflow the plot area.
 */
function buildBands(norm: Norm, yMin: number, yMax: number): Band[] {
  const { poor_max, fair_max, good_max, great_max, higher_is_better } = norm;
  if (
    poor_max == null ||
    fair_max == null ||
    good_max == null ||
    great_max == null
  ) {
    return [];
  }
  const pm = Number(poor_max);
  const fm = Number(fair_max);
  const gm = Number(good_max);
  const grm = Number(great_max);

  const clamp = (y1: number, y2: number): [number, number] => [
    Math.max(yMin, Math.min(y1, y2)),
    Math.min(yMax, Math.max(y1, y2)),
  ];

  if (higher_is_better) {
    // … < pm = Poor; pm..fm = Fair; fm..gm = Good; gm..grm = Great; > grm = Elite
    const [p1, p2] = clamp(yMin, pm);
    const [f1, f2] = clamp(pm, fm);
    const [g1, g2] = clamp(fm, gm);
    const [gr1, gr2] = clamp(gm, grm);
    const [e1, e2] = clamp(grm, yMax);
    return [
      { y1: p1, y2: p2, fill: BAND_FILLS.Poor, label: "Poor" },
      { y1: f1, y2: f2, fill: BAND_FILLS.Fair, label: "Fair" },
      { y1: g1, y2: g2, fill: BAND_FILLS.Good, label: "Good" },
      { y1: gr1, y2: gr2, fill: BAND_FILLS.Great, label: "Great" },
      { y1: e1, y2: e2, fill: BAND_FILLS.Elite, label: "Elite" },
    ].filter((b) => b.y2 > b.y1);
  }

  // Lower is better. Elite is the smallest times.
  const [e1, e2] = clamp(yMin, grm);
  const [gr1, gr2] = clamp(grm, gm);
  const [g1, g2] = clamp(gm, fm);
  const [f1, f2] = clamp(fm, pm);
  const [p1, p2] = clamp(pm, yMax);
  return [
    { y1: e1, y2: e2, fill: BAND_FILLS.Elite, label: "Elite" },
    { y1: gr1, y2: gr2, fill: BAND_FILLS.Great, label: "Great" },
    { y1: g1, y2: g2, fill: BAND_FILLS.Good, label: "Good" },
    { y1: f1, y2: f2, fill: BAND_FILLS.Fair, label: "Fair" },
    { y1: p1, y2: p2, fill: BAND_FILLS.Poor, label: "Poor" },
  ].filter((b) => b.y2 > b.y1);
}
