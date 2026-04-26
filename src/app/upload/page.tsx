import { supabaseServer } from "@/lib/supabase/server";
import UploadFlow from "./UploadFlow";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: { athlete?: string };
}) {
  const sb = supabaseServer();
  const { data: athletes } = await sb
    .from("athletes")
    .select("id, full_name, sport, level, sex, position_group, body_mass_kg")
    .order("full_name", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload session</h1>
        <p className="mt-1 text-sm text-ppa-muted">
          Drop a 1080 xlsx export — optionally a side-on sprint video too — and the app will
          parse, score, and save.
        </p>
      </div>
      <UploadFlow
        athletes={athletes ?? []}
        defaultAthleteId={searchParams.athlete ?? null}
      />
    </div>
  );
}
