/**
 * Boot/setup status for the app — checks env vars are present and the
 * Supabase schema is applied. Used by server components to render a useful
 * setup screen instead of a 500 when the project isn't fully wired yet.
 */

import { supabaseServer } from "./supabase/server";

export type SetupStatus =
  | { ok: true }
  | { ok: false; reason: "missing_env"; missing: string[] }
  | { ok: false; reason: "schema_not_applied"; detail: string }
  | { ok: false; reason: "unknown"; detail: string };

export async function checkSetup(): Promise<SetupStatus> {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length) return { ok: false, reason: "missing_env", missing };

  try {
    const sb = supabaseServer();
    const { error } = await sb.from("athletes").select("id").limit(1);
    if (error) {
      // 42P01 = undefined_table (Postgres) — schema not applied yet.
      const msg = error.message ?? String(error);
      if (msg.includes("does not exist") || msg.includes("relation")) {
        return { ok: false, reason: "schema_not_applied", detail: msg };
      }
      return { ok: false, reason: "unknown", detail: msg };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "unknown",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
