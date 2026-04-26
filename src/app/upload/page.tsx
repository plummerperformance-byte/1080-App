import { supabaseServer } from "@/lib/supabase/server";
import { checkSetup } from "@/lib/setup-status";
import SetupScreen from "@/components/SetupScreen";
import UploadFlow from "./UploadFlow";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: { athlete?: string; session?: string };
}) {
  const setup = await checkSetup();
  if (!setup.ok) return <SetupScreen status={setup} />;

  const sb = supabaseServer();
  const [{ data: athletes }, sessionResult] = await Promise.all([
    sb
      .from("athletes")
      .select("id, full_name, sport, level, sex, position_group, body_mass_kg")
      .order("full_name", { ascending: true }),
    searchParams.session
      ? sb
          .from("sessions")
          .select("id, athlete_id, session_date, body_mass_kg, athletes(full_name)")
          .eq("id", searchParams.session)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const existingSession = sessionResult.data
    ? {
        id: sessionResult.data.id,
        athleteId: sessionResult.data.athlete_id,
        date: sessionResult.data.session_date,
        bodyMassKg: sessionResult.data.body_mass_kg,
        athleteName: Array.isArray(sessionResult.data.athletes)
          ? sessionResult.data.athletes[0]?.full_name
          : (sessionResult.data.athletes as { full_name: string } | null)?.full_name,
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {existingSession ? "Add sprint to session" : "Upload session"}
        </h1>
        <p className="mt-1 text-sm text-ppa-muted">
          {existingSession
            ? `Appending a sprint to ${existingSession.athleteName ?? "this athlete"}'s session on ${existingSession.date}.`
            : "Drop a 1080 xlsx export — optionally a side-on sprint video too — and the app will parse, score, and save."}
        </p>
      </div>
      <UploadFlow
        athletes={athletes ?? []}
        defaultAthleteId={existingSession?.athleteId ?? searchParams.athlete ?? null}
        existingSession={existingSession}
      />
    </div>
  );
}
