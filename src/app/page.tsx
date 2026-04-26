import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = supabaseServer();
  const { data: recent } = await sb
    .from("v_session_summaries")
    .select("*")
    .order("session_date", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <Link
          href="/upload"
          className="rounded-lg border border-gray-200 bg-white p-5 transition hover:border-ppa-accent hover:shadow-sm"
        >
          <div className="text-sm font-medium uppercase tracking-wide text-ppa-muted">Upload</div>
          <div className="mt-1 text-lg font-semibold text-ppa-navy">Upload session</div>
          <p className="mt-2 text-sm text-ppa-muted">
            Drop a 1080 xlsx + (optional) side-on video. Parses, scores, saves.
          </p>
        </Link>
        <Link
          href="/athletes"
          className="rounded-lg border border-gray-200 bg-white p-5 transition hover:border-ppa-accent hover:shadow-sm"
        >
          <div className="text-sm font-medium uppercase tracking-wide text-ppa-muted">Roster</div>
          <div className="mt-1 text-lg font-semibold text-ppa-navy">Manage athletes</div>
          <p className="mt-2 text-sm text-ppa-muted">
            Add new athletes, view trend charts across all their sessions.
          </p>
        </Link>
        <div className="rounded-lg border border-dashed border-gray-300 p-5">
          <div className="text-sm font-medium uppercase tracking-wide text-ppa-muted">
            Phase 2 preview
          </div>
          <div className="mt-1 text-lg font-semibold text-ppa-navy">Sprint technique tracker</div>
          <p className="mt-2 text-sm text-ppa-muted">
            Side-on video pose analysis fills GCT, flight time, joint angles. Now in beta on the
            upload page.
          </p>
          <div className="mt-3">
            <Pill tone="good">Live on /upload</Pill>
          </div>
        </div>
      </section>

      <Card title="Recent sessions">
        {!recent || recent.length === 0 ? (
          <p className="text-sm text-ppa-muted">
            No sessions yet. Upload your first 1080 xlsx via{" "}
            <Link href="/upload" className="text-ppa-accent hover:underline">/upload</Link>.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ppa-muted">
              <tr>
                <th className="py-2 pr-4">Athlete</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Sprints</th>
                <th className="py-2 pr-4">Best Max V</th>
                <th className="py-2 pr-4">Best 40m</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.session_id} className="border-t border-gray-100">
                  <td className="py-2 pr-4">{s.athlete_name}</td>
                  <td className="py-2 pr-4 tabular text-ppa-muted">{s.session_date}</td>
                  <td className="py-2 pr-4 tabular">{s.sprint_count}</td>
                  <td className="py-2 pr-4 tabular">
                    {s.best_max_v_ms != null ? `${s.best_max_v_ms.toFixed(2)} m/s` : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular">
                    {s.best_40m_s != null ? `${s.best_40m_s.toFixed(2)} s` : "—"}
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
