import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import DeleteButton from "@/components/DeleteButton";
import { checkSetup } from "@/lib/setup-status";
import SetupScreen from "@/components/SetupScreen";
import EditableHeader from "./EditableHeader";
import TrendCharts from "./TrendCharts";

export const dynamic = "force-dynamic";

export default async function AthleteDetailPage({ params }: { params: { id: string } }) {
  const setup = await checkSetup();
  if (!setup.ok) return <SetupScreen status={setup} />;

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
      <EditableHeader athlete={athlete} />

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
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/sessions/${s.session_id}`}
                        className="text-ppa-accent hover:underline"
                      >
                        View →
                      </Link>
                      <DeleteButton
                        table="sessions"
                        id={s.session_id}
                        label={`session on ${s.session_date}`}
                      />
                    </div>
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
