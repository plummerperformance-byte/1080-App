import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import DeleteButton from "@/components/DeleteButton";
import { checkSetup } from "@/lib/setup-status";
import SetupScreen from "@/components/SetupScreen";
import AthleteForm from "./AthleteForm";

export const dynamic = "force-dynamic";

export default async function AthletesPage() {
  const setup = await checkSetup();
  if (!setup.ok) return <SetupScreen status={setup} />;

  const sb = supabaseServer();
  const { data: athletes } = await sb
    .from("athletes")
    .select("*")
    .order("full_name", { ascending: true });

  return (
    <div className="space-y-8">
      <Card title="Add athlete">
        <AthleteForm />
      </Card>
      <Card title="Roster">
        {!athletes || athletes.length === 0 ? (
          <p className="text-sm text-ppa-muted">No athletes yet — add one above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ppa-muted">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Sport</th>
                <th className="py-2 pr-4">Level</th>
                <th className="py-2 pr-4">Position</th>
                <th className="py-2 pr-4">Body mass</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-medium">{a.full_name}</td>
                  <td className="py-2 pr-4 text-ppa-muted">{a.sport}</td>
                  <td className="py-2 pr-4 text-ppa-muted">{a.level}</td>
                  <td className="py-2 pr-4 text-ppa-muted">{a.position ?? a.position_group}</td>
                  <td className="py-2 pr-4 tabular">
                    {a.body_mass_kg != null ? `${a.body_mass_kg} kg` : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/athletes/${a.id}`}
                        className="text-ppa-accent hover:underline"
                      >
                        View →
                      </Link>
                      <DeleteButton table="athletes" id={a.id} label={a.full_name} />
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
