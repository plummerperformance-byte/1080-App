"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Field, Row, Select, TextInput } from "@/components/ui";
import type {
  Athlete,
  LevelEnum,
  PositionGroupEnum,
  SexEnum,
  SportEnum,
} from "@/types/database";

type Props = {
  /** Pass an existing athlete to render as an edit form. Omit for "add new". */
  initial?: Athlete;
  /** Hide the secondary cancel button. */
  hideCancel?: boolean;
  onCancel?: () => void;
};

export default function AthleteForm({ initial, hideCancel, onCancel }: Props) {
  const router = useRouter();
  const isEdit = !!initial;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [dob, setDob] = useState(initial?.date_of_birth ?? "");
  const [sex, setSex] = useState<SexEnum>(initial?.sex ?? "male");
  const [sport, setSport] = useState<SportEnum>(initial?.sport ?? "rugby_union");
  const [level, setLevel] = useState<LevelEnum>(initial?.level ?? "club");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [positionGroup, setPositionGroup] = useState<PositionGroupEnum>(
    initial?.position_group ?? "back",
  );
  const [team, setTeam] = useState(initial?.team ?? "");
  const [bodyMass, setBodyMass] = useState(
    initial?.body_mass_kg != null ? String(initial.body_mass_kg) : "",
  );
  const [height, setHeight] = useState(
    initial?.height_cm != null ? String(initial.height_cm) : "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const payload = {
      full_name: fullName.trim(),
      date_of_birth: dob || null,
      sex,
      sport,
      level,
      position: position.trim() || null,
      position_group: positionGroup,
      team: team.trim() || null,
      body_mass_kg: bodyMass ? Number(bodyMass) : null,
      height_cm: height ? Number(height) : null,
    };
    const { error } = isEdit
      ? await sb.from("athletes").update(payload).eq("id", initial!.id)
      : await sb.from("athletes").insert(payload);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!isEdit) {
      setFullName("");
      setDob("");
      setPosition("");
      setTeam("");
      setBodyMass("");
      setHeight("");
    }
    router.refresh();
    if (isEdit && onCancel) onCancel();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Row>
        <Field label="Full name *">
          <TextInput
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Smith"
          />
        </Field>
        <Field label="DOB">
          <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label="Sex">
          <Select value={sex} onChange={(e) => setSex(e.target.value as SexEnum)}>
            <option value="male">male</option>
            <option value="female">female</option>
            <option value="other">other</option>
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Sport">
          <Select value={sport} onChange={(e) => setSport(e.target.value as SportEnum)}>
            <option value="rugby_union">rugby_union</option>
            <option value="rugby_league">rugby_league</option>
            <option value="rugby_sevens">rugby_sevens</option>
            <option value="rugby_touch">rugby_touch</option>
            <option value="afl">afl</option>
            <option value="soccer">soccer</option>
            <option value="basketball">basketball</option>
            <option value="track">track</option>
            <option value="other">other</option>
          </Select>
        </Field>
        <Field label="Level">
          <Select value={level} onChange={(e) => setLevel(e.target.value as LevelEnum)}>
            <option value="developmental">developmental</option>
            <option value="club">club</option>
            <option value="semi_pro">semi_pro</option>
            <option value="pro">pro</option>
            <option value="international">international</option>
          </Select>
        </Field>
        <Field label="Position group">
          <Select
            value={positionGroup}
            onChange={(e) => setPositionGroup(e.target.value as PositionGroupEnum)}
          >
            <option value="back">back</option>
            <option value="forward">forward</option>
            <option value="hit_up_forward">hit_up_forward</option>
            <option value="adjustable">adjustable</option>
            <option value="outside_back">outside_back</option>
            <option value="other">other</option>
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Position (free text)">
          <TextInput
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="right wing"
          />
        </Field>
        <Field label="Team">
          <TextInput value={team} onChange={(e) => setTeam(e.target.value)} />
        </Field>
        <Field label="Body mass (kg)">
          <TextInput
            type="number"
            step="0.1"
            value={bodyMass}
            onChange={(e) => setBodyMass(e.target.value)}
          />
        </Field>
        <Field label="Height (cm)">
          <TextInput
            type="number"
            step="0.1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </Field>
      </Row>
      {error ? <div className="text-sm text-ppa-accent">{error}</div> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add athlete"}
        </Button>
        {isEdit && !hideCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
