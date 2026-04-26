"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = {
  table: "athletes" | "sessions" | "sprints";
  id: string;
  label: string;
  redirectTo?: string;
  className?: string;
};

/**
 * One-click delete with native confirm. Used for athletes / sessions / sprints.
 * Cascade deletes downstream rows via the FK constraints in the schema.
 */
export default function DeleteButton({ table, id, label, redirectTo, className }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const { error } = await sb.from(table).delete().eq("id", id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className={
          className ??
          "rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
        }
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
