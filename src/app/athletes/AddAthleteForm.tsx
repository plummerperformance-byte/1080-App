"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Field, Row, Select, TextInput } from "@/components/ui";
import type { LevelEnum, PositionGroupEnum, SexEnum, SportEnum } from "@/types/database";

export default function AddAthleteForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<SexEnum>("male");
  const [sport, setSport] = useState<SportEnum>("rugby_union");
  const [level, setLevel] = useState<LevelEnum>("club");
  const [position, setPosition] = useState("");
  const [positionGroup, setPositionGroup] = useState<PositionGroupEnum>("back");
  const [team, setTeam] = useState("");
  const [bodyMass, setBodyMass] = useState("");
  const [height, setHeight] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const { error } = await sb.from("athletes").insert({
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
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setFullName("");
    setDob("");
    setPosition("");
    setTeam("");
    setBodyMass("");
    setHeight("");
    router.refresh();
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
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Add athlete"}
      </Button>
    </form>
  );
}
