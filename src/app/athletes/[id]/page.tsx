import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, Pill } from "@/components/ui";
import TrendCharts from "./TrendCharts";

export const dynamic = "force-dynamic";

export default async function AthleteDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: athlete } = await sb
    .from("athletes")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!athlete) notFound();

  const { data: sessions } = await sb
    .from("v_session_summaries")
    .select("*")
    .eq("athlete_id", params.id)
    .order("session_date", { ascending: true });

  const trend = (sessions ?? []).map((s) => ({
    date: s.session_date,
    maxV: s.best_max_v_ms,
    f0: s.avg_f0_rel,
    v0: s.avg_v0,
    pmax: s.avg_pmax_rel,
    s10: s.best_10m_s,
    s40: s.best_40m_s,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{athlete.full_name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-ppa-muted">
            <Pill>{athlete.sport}</Pill>
            <Pill>{athlete.level}</Pill>
            {athlete.position ? <Pill>{athlete.position}</Pill> : null}
            <Pill>{athlete.position_group}</Pill>
            {athlete.body_mass_kg ? <Pill>{athlete.body_mass_kg} kg</Pill> : null}
          </div>
        </div>
        <Link
          href={`/upload?athlete=${athlete.id}`}
          className="rounded-md bg-ppa-navy px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          New session
        </Link>
      </div>

      <Card title="Trend across sessions">
        {trend.length === 0 ? (
          <p className="text-sm text-ppa-muted">No sessions yet.</p>
        ) : (
          <TrendCharts data={trend} />
        )}
      </Card>

      <Card title="Sessions">
        {!sessions || sessions.length === 0 ? (
          <p className="text-sm text-ppa-muted">No sessions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ppa-muted">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Sprints</th>
                <th className="py-2 pr-4">Best Max V</th>
                <th className="py-2 pr-4">Best 10m</th>
                <th className="py-2 pr-4">Best 40m</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s) => (
                <tr key={s.session_id} className="border-t border-gray-100">
                  <td className="py-2 pr-4 tabular">{s.session_date}</td>
                  <td className="py-2 pr-4 tabular">{s.sprint_count}</td>
                  <td className="py-2 pr-4 tabular">
                    {s.best_max_v_ms != null ? s.best_max_v_ms.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular">
                    {s.best_10m_s != null ? s.best_10m_s.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular">
                    {s.best_40m_s != null ? s.best_40m_s.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/sessions/${s.session_id}`}
                      className="text-ppa-accent hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
