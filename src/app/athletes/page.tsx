"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/Field";
import { Select } from "@/components/Select";
import { createClient } from "@/lib/supabase/client";
import {
  LEVEL_OPTIONS,
  POSITION_GROUP_OPTIONS,
  SEX_OPTIONS,
  SPORT_OPTIONS,
} from "@/lib/enums";
import type {
  Athlete,
  LevelEnum,
  PositionGroupEnum,
  SexEnum,
  SportEnum,
} from "@/types/database";

type FormState = {
  full_name: string;
  date_of_birth: string;
  sex: SexEnum;
  sport: SportEnum;
  level: LevelEnum;
  position: string;
  position_group: PositionGroupEnum;
  team: string;
  height_cm: string;
  body_mass_kg: string;
};

const EMPTY_FORM: FormState = {
  full_name: "",
  date_of_birth: "",
  sex: "male",
  sport: "rugby_union",
  level: "club",
  position: "",
  position_group: "back",
  team: "",
  height_cm: "",
  body_mass_kg: "",
};

export default function AthletesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("athletes")
      .select("*")
      .order("full_name", { ascending: true });
    if (err) setError(err.message);
    else setAthletes(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError("Full name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      date_of_birth: form.date_of_birth || null,
      sex: form.sex,
      sport: form.sport,
      level: form.level,
      position: form.position.trim() || null,
      position_group: form.position_group,
      team: form.team.trim() || null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      body_mass_kg: form.body_mass_kg ? Number(form.body_mass_kg) : null,
    };
    const { error: err } = await supabase.from("athletes").insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setForm(EMPTY_FORM);
    await load();
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Athletes</h1>
        <p className="mt-1 text-sm text-ppa-muted">
          Create and manage athletes. Full name is required; everything else is
          optional but drives the rank bands.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field
          label="Full name *"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <Field
          label="Date of birth"
          type="date"
          value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
        />
        <Select
          label="Sex"
          options={SEX_OPTIONS}
          value={form.sex}
          onChange={(e) => setForm({ ...form, sex: e.target.value as SexEnum })}
        />
        <Select
          label="Sport"
          options={SPORT_OPTIONS}
          value={form.sport}
          onChange={(e) =>
            setForm({ ...form, sport: e.target.value as SportEnum })
          }
        />
        <Select
          label="Level"
          options={LEVEL_OPTIONS}
          value={form.level}
          onChange={(e) =>
            setForm({ ...form, level: e.target.value as LevelEnum })
          }
        />
        <Select
          label="Position group"
          options={POSITION_GROUP_OPTIONS}
          value={form.position_group}
          onChange={(e) =>
            setForm({
              ...form,
              position_group: e.target.value as PositionGroupEnum,
            })
          }
        />
        <Field
          label="Position"
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
          placeholder="e.g. right wing"
        />
        <Field
          label="Team"
          value={form.team}
          onChange={(e) => setForm({ ...form, team: e.target.value })}
        />
        <Field
          label="Height (cm)"
          type="number"
          step="0.1"
          value={form.height_cm}
          onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
        />
        <Field
          label="Body mass (kg)"
          type="number"
          step="0.1"
          value={form.body_mass_kg}
          onChange={(e) => setForm({ ...form, body_mass_kg: e.target.value })}
        />
        <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between">
          {error ? (
            <div className="text-sm text-ppa-red">{error}</div>
          ) : (
            <div />
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-ppa-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add athlete"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-3 text-sm font-medium">
          All athletes ({athletes.length})
        </div>
        {loading ? (
          <div className="px-6 py-6 text-sm text-ppa-muted">Loading…</div>
        ) : athletes.length === 0 ? (
          <div className="px-6 py-6 text-sm text-ppa-muted">
            No athletes yet. Add one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-ppa-muted">
              <tr>
                <th className="px-6 py-2">Name</th>
                <th className="px-6 py-2">Sport</th>
                <th className="px-6 py-2">Level</th>
                <th className="px-6 py-2">Position</th>
                <th className="px-6 py-2 text-right">Body mass</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-6 py-2 font-medium">{a.full_name}</td>
                  <td className="px-6 py-2 text-ppa-muted">{a.sport}</td>
                  <td className="px-6 py-2 text-ppa-muted">{a.level}</td>
                  <td className="px-6 py-2 text-ppa-muted">
                    {a.position ?? "—"}
                  </td>
                  <td className="px-6 py-2 text-right tabular">
                    {a.body_mass_kg != null ? `${a.body_mass_kg} kg` : "—"}
                  </td>
                  <td className="px-6 py-2 text-right">
                    <Link
                      href={`/athletes/${a.id}`}
                      className="text-ppa-navy hover:text-ppa-red"
                    >
                      View →
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
