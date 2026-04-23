"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import type { Athlete, SessionSummary } from "@/types/database";

type TrendKey =
  | "best_max_v_ms"
  | "avg_f0_rel"
  | "avg_v0"
  | "avg_pmax_rel"
  | "best_10m_s"
  | "best_40m_s";

const TRENDS: ReadonlyArray<{ key: TrendKey; label: string; unit: string }> = [
  { key: "best_max_v_ms", label: "Max V", unit: "m/s" },
  { key: "avg_f0_rel", label: "F₀ rel", unit: "N/kg" },
  { key: "avg_v0", label: "V₀", unit: "m/s" },
  { key: "avg_pmax_rel", label: "Pmax rel", unit: "W/kg" },
  { key: "best_10m_s", label: "10 m split", unit: "s" },
  { key: "best_40m_s", label: "40 m split", unit: "s" },
];

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
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [athleteRes, sessionsRes] = await Promise.all([
        supabase.from("athletes").select("*").eq("id", params.id).single(),
        supabase
          .from("v_session_summaries")
          .select("*")
          .eq("athlete_id", params.id)
          .order("session_date", { ascending: true }),
      ]);
      if (athleteRes.error || !athleteRes.data) {
        setError(athleteRes.error?.message ?? "Athlete not found");
      } else {
        setAthlete(athleteRes.data);
      }
      if (sessionsRes.error) {
        setError(sessionsRes.error.message);
      } else {
        setSessions(sessionsRes.data ?? []);
      }
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

  const chartData = sessions.map((s) => ({
    date: s.session_date,
    best_max_v_ms: s.best_max_v_ms,
    avg_f0_rel: s.avg_f0_rel,
    avg_v0: s.avg_v0,
    avg_pmax_rel: s.avg_pmax_rel,
    best_10m_s: s.best_10m_s,
    best_40m_s: s.best_40m_s,
  }));

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
          {athlete.sport.replace(/_/g, " ")} · {athlete.level.replace(/_/g, " ")} ·{" "}
          {athlete.position ?? athlete.position_group}
          {athlete.body_mass_kg != null ? ` · ${athlete.body_mass_kg} kg` : ""}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-ppa-muted">
          No sessions yet. <Link href="/upload" className="text-ppa-red">Upload one</Link>.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRENDS.map((t) => (
              <div
                key={t.key}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-xs uppercase tracking-wide text-ppa-muted">
                    {t.label}
                  </div>
                  <div className="text-xs text-ppa-muted">{t.unit}</div>
                </div>
                <div className="mt-2 h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis fontSize={10} domain={["auto", "auto"]} />
                      <Tooltip
                        formatter={(v) =>
                          typeof v === "number" ? v.toFixed(2) : "—"
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey={t.key}
                        stroke="#EF4444"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-3 text-sm font-medium">
              Sessions ({sessions.length})
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
                {[...sessions].reverse().map((s) => (
                  <tr
                    key={s.session_id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-6 py-2 font-medium">{s.session_date}</td>
                    <td className="px-6 py-2 text-right tabular">
                      {fmt(s.best_max_v_ms, 2)}
                    </td>
                    <td className="px-6 py-2 text-right tabular">
                      {fmt(s.avg_f0_rel, 2)}
                    </td>
                    <td className="px-6 py-2 text-right tabular">
                      {fmt(s.avg_v0, 2)}
                    </td>
                    <td className="px-6 py-2 text-right tabular">
                      {fmt(s.avg_pmax_rel, 2)}
                    </td>
                    <td className="px-6 py-2 text-right tabular">
                      {fmt(s.best_10m_s, 3)}
                    </td>
                    <td className="px-6 py-2 text-right tabular">
                      {fmt(s.best_40m_s, 3)}
                    </td>
                    <td className="px-6 py-2 text-right">
                      <Link
                        href={`/sessions/${s.session_id}`}
                        className="text-ppa-navy hover:text-ppa-red"
                      >
                        Open →
                      </Link>
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
