import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Delete a session and all of its children.
 *
 * Postgres FKs already cascade sessions → sprints → sprint_metrics /
 * step_events / raw_files, so we only need to:
 *   1. List all files under the session's Storage prefix and remove them.
 *   2. Delete the session row (cascades the rest).
 *
 * Storage removal runs first and is best-effort — if it fails we still
 * delete the DB row so the user isn't stuck with a phantom session, and
 * return a warning for the caller to surface.
 */
export async function deleteSession(
  supabase: SupabaseClient<Database>,
  args: { sessionId: string; athleteId: string },
): Promise<{ storageWarning?: string }> {
  const { sessionId, athleteId } = args;
  const prefix = `${athleteId}/${sessionId}`;
  let storageWarning: string | undefined;

  try {
    const { data: objects, error: listErr } = await supabase.storage
      .from("raw-1080-files")
      .list(prefix, { limit: 100 });
    if (listErr) {
      storageWarning = `Storage list failed: ${listErr.message}`;
    } else if (objects && objects.length > 0) {
      const paths = objects.map((o) => `${prefix}/${o.name}`);
      const { error: removeErr } = await supabase.storage
        .from("raw-1080-files")
        .remove(paths);
      if (removeErr) {
        storageWarning = `Storage delete failed: ${removeErr.message}`;
      }
    }
  } catch (err) {
    storageWarning = `Storage step threw: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (error) {
    throw new Error(`Session delete failed: ${error.message}`);
  }

  return { storageWarning };
}
