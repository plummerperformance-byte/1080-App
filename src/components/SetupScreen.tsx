import type { SetupStatus } from "@/lib/setup-status";

export default function SetupScreen({ status }: { status: SetupStatus }) {
  if (status.ok) return null;

  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-yellow-200 bg-yellow-50 p-6">
      <h1 className="text-xl font-semibold text-yellow-900">Almost there — finish setup</h1>

      {status.reason === "missing_env" ? (
        <div className="mt-3 space-y-3 text-sm text-yellow-900">
          <p>The app can&apos;t connect to Supabase because these env vars aren&apos;t set:</p>
          <ul className="list-inside list-disc">
            {status.missing.map((m) => (
              <li key={m}>
                <code className="rounded bg-yellow-100 px-1.5 py-0.5">{m}</code>
              </li>
            ))}
          </ul>
          <p className="font-medium">Fix in Vercel:</p>
          <ol className="list-inside list-decimal space-y-1 text-yellow-800">
            <li>Open your Vercel project → Settings → Environment Variables</li>
            <li>
              Add{" "}
              <code className="rounded bg-yellow-100 px-1.5 py-0.5">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              ={" "}
              <code className="rounded bg-yellow-100 px-1.5 py-0.5">
                https://dnwdyddwtisqfyxzyiyr.supabase.co
              </code>
            </li>
            <li>
              Add{" "}
              <code className="rounded bg-yellow-100 px-1.5 py-0.5">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              = your Supabase anon key (Supabase dashboard → Settings → API → anon /
              public)
            </li>
            <li>Redeploy from the Vercel dashboard, or push another commit</li>
          </ol>
        </div>
      ) : null}

      {status.reason === "schema_not_applied" ? (
        <div className="mt-3 space-y-3 text-sm text-yellow-900">
          <p>
            Connected to Supabase but the database tables don&apos;t exist yet. You need
            to run the SQL migrations.
          </p>
          <p className="font-medium">Fix in Supabase:</p>
          <ol className="list-inside list-decimal space-y-1 text-yellow-800">
            <li>
              Open your Supabase project SQL Editor
              (https://supabase.com/dashboard/project/dnwdyddwtisqfyxzyiyr/sql)
            </li>
            <li>Run each migration file in order, top to bottom:</li>
          </ol>
          <ul className="list-inside list-disc text-yellow-800">
            <li>
              <code className="rounded bg-yellow-100 px-1.5 py-0.5">
                supabase/migrations/20260423000000_initial_schema.sql
              </code>
            </li>
            <li>
              <code className="rounded bg-yellow-100 px-1.5 py-0.5">
                supabase/migrations/20260426000000_video_pose_phase2.sql
              </code>
            </li>
            <li>
              <code className="rounded bg-yellow-100 px-1.5 py-0.5">
                supabase/migrations/20260426010000_chart_samples_and_sync.sql
              </code>
            </li>
          </ul>
          <ol className="list-inside list-decimal space-y-1 text-yellow-800" start={3}>
            <li>
              In Supabase Storage, create a private bucket named{" "}
              <code className="rounded bg-yellow-100 px-1.5 py-0.5">raw-1080-files</code>
            </li>
            <li>Refresh this page</li>
          </ol>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-yellow-700">
              Show original error
            </summary>
            <pre className="mt-1 overflow-x-auto rounded bg-yellow-100 p-2 text-xs">
              {status.detail}
            </pre>
          </details>
        </div>
      ) : null}

      {status.reason === "unknown" ? (
        <div className="mt-3 space-y-3 text-sm text-yellow-900">
          <p>Couldn&apos;t connect to Supabase. The error was:</p>
          <pre className="overflow-x-auto rounded bg-yellow-100 p-2 text-xs">
            {status.detail}
          </pre>
          <p className="text-yellow-800">
            Common causes: wrong anon key, project URL typo, or Supabase project paused.
          </p>
        </div>
      ) : null}
    </div>
  );
}
