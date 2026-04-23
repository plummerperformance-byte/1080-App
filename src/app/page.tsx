"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SessionSummary } from "@/types/database";

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("v_session_summaries")
        .select("*")
        .order("session_date", { ascending: false })
        .limit(5);
      setSessions(data ?? []);
      setLoading(false);
    }
    void load();
  }, [supabase]);

  return (
    <section className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">1080 Sprint Analyser</h1>
        <p className="mt-2 text-sm text-ppa-muted">
          Upload a session, review the sprint, track trends over time.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <EntryCard
          href="/upload"
          title="Upload session"
          body="Drop a 1080 xlsx, preview parsed metrics, save to the database."
        />
        <EntryCard
          href="/athletes"
          title="Manage athletes"
          body="Add athletes and see their individual trend dashboards."
        />
        <EntryCard
          href="#"
          title="Phase 2 preview"
          body="Coming: external sensor import, multi-load F-V profiler, PDF reports."
          muted
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-3 text-sm font-medium">
          Recent sessions
        </div>
        {loading ? (
          <div className="px-6 py-6 text-sm text-ppa-muted">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="px-6 py-6 text-sm text-ppa-muted">
            No sessions yet.{" "}
            <Link href="/upload" className="text-ppa-red">
              Upload one
            </Link>
            .
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-ppa-muted">
              <tr>
                <th className="px-6 py-2">Date</th>
                <th className="px-6 py-2">Athlete</th>
                <th className="px-6 py-2 text-right">Max V</th>
                <th className="px-6 py-2 text-right">F₀ rel</th>
                <th className="px-6 py-2 text-right">10 m</th>
                <th className="px-6 py-2 text-right">40 m</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.session_id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-6 py-2 font-medium">{s.session_date}</td>
                  <td className="px-6 py-2">
                    <Link
                      href={`/athletes/${s.athlete_id}`}
                      className="hover:text-ppa-red"
                    >
                      {s.athlete_name}
                    </Link>
                  </td>
                  <td className="px-6 py-2 text-right tabular">
                    {fmt(s.best_max_v_ms, 2)}
                  </td>
                  <td className="px-6 py-2 text-right tabular">
                    {fmt(s.avg_f0_rel, 2)}
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
        )}
      </div>
    </section>
  );
}

function EntryCard({
  href,
  title,
  body,
  muted,
}: {
  href: string;
  title: string;
  body: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border border-gray-200 p-6 transition ${
        muted
          ? "bg-gray-50 text-ppa-muted hover:bg-gray-100"
          : "bg-white hover:border-ppa-red"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs">{body}</div>
    </Link>
  );
}
