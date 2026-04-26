"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Pill } from "@/components/ui";
import DeleteButton from "@/components/DeleteButton";
import AthleteForm from "../AthleteForm";
import type { Athlete } from "@/types/database";

export default function EditableHeader({ athlete }: { athlete: Athlete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card title="Edit athlete">
        <AthleteForm initial={athlete} onCancel={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{athlete.full_name}</h1>
        <div className="mt-1 flex flex-wrap gap-2 text-sm text-ppa-muted">
          <Pill>{athlete.sport}</Pill>
          <Pill>{athlete.level}</Pill>
          {athlete.position ? <Pill>{athlete.position}</Pill> : null}
          <Pill>{athlete.position_group}</Pill>
          {athlete.body_mass_kg ? <Pill>{athlete.body_mass_kg} kg</Pill> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/upload?athlete=${athlete.id}`}
          className="rounded-md bg-ppa-navy px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          New session
        </Link>
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-ppa-navy hover:bg-gray-50"
        >
          Edit
        </button>
        <DeleteButton
          table="athletes"
          id={athlete.id}
          label={athlete.full_name}
          redirectTo="/athletes"
        />
      </div>
    </div>
  );
}
