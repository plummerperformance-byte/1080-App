"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Field } from "@/components/Field";
import { Row } from "@/components/Row";
import { Select } from "@/components/Select";
import { TEST_TYPE_OPTIONS } from "@/lib/enums";
import { parse1080File, type ParsedSprint } from "@/lib/parser/1080-parser";
import { saveSprintSession } from "@/lib/save-sprint";
import { createClient } from "@/lib/supabase/client";
import type { Athlete, TestTypeEnum } from "@/types/database";

function fmt(n: number | null | undefined, digits = 2, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

export default function UploadPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState<string>("");
  const [sessionDate, setSessionDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [testType, setTestType] = useState<TestTypeEnum>("unresisted_sprint");
  const [notes, setNotes] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSprint | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAthletes() {
      const { data, error } = await supabase
        .from("athletes")
        .select("*")
        .order("full_name", { ascending: true });
      if (error) {
        setSaveError(error.message);
        return;
      }
      setAthletes(data ?? []);
      if (data && data.length > 0 && !athleteId) setAthleteId(data[0].id);
    }
    void loadAthletes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setParsed(null);
    setParseError(null);
    setParsing(true);
    try {
      const result = await parse1080File(f);
      setParsed(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: false,
    onDrop: (accepted) => {
      if (accepted.length > 0) void handleFile(accepted[0]);
    },
  });

  async function handleSave() {
    if (!athleteId) {
      setSaveError("Pick an athlete first.");
      return;
    }
    if (!parsed || !file) {
      setSaveError("Drop a 1080 xlsx file first.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const { sessionId, storageWarning } = await saveSprintSession(supabase, {
        athleteId,
        sessionDate,
        notes: notes.trim() || null,
        testType,
        parsed,
        file,
      });
      if (storageWarning) console.warn(storageWarning);
      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const m = parsed?.metrics;

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Upload session</h1>
        <p className="mt-1 text-sm text-ppa-muted">
          Pick an athlete, drop the 1080 xlsx export, review the parsed
          metrics, then save.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Athlete *"
          options={athletes.map((a) => ({ value: a.id, label: a.full_name }))}
          value={athleteId}
          onChange={(e) => setAthleteId(e.target.value)}
        />
        <Field
          label="Session date"
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
        />
        <Select
          label="Test type"
          options={TEST_TYPE_OPTIONS}
          value={testType}
          onChange={(e) => setTestType(e.target.value as TestTypeEnum)}
        />
        <Field
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition ${
          isDragActive
            ? "border-ppa-red bg-white"
            : "border-gray-300 bg-white hover:border-ppa-navy"
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-sm">
          {file ? (
            <div className="space-y-1">
              <div className="font-medium">{file.name}</div>
              <div className="text-ppa-muted">
                {(file.size / 1024).toFixed(0)} KB · click or drop again to
                replace
              </div>
            </div>
          ) : isDragActive ? (
            <div className="font-medium">Drop it.</div>
          ) : (
            <div className="space-y-1">
              <div className="font-medium">
                Drop a 1080 Sprint xlsx here, or click to select
              </div>
              <div className="text-ppa-muted">.xlsx only</div>
            </div>
          )}
        </div>
      </div>

      {parsing ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-ppa-muted">
          Parsing…
        </div>
      ) : parseError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-ppa-red">
          <div className="font-semibold">Parse failed</div>
          <div className="mt-1">{parseError}</div>
        </div>
      ) : parsed && m ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ppa-muted">
              Parsed metrics
            </h2>
            <div className="mt-4 space-y-0">
              <Row
                label="Body mass"
                value={fmt(parsed.bodyMassKg, 1, " kg")}
              />
              <Row
                label="Avg in-sprint load"
                value={fmt(parsed.avgLoadKg, 2, " kg")}
                sub={`${fmt((parsed.avgLoadKg / parsed.bodyMassKg) * 100, 1, "%")} of BM`}
              />
              <Row
                label="Distance reached"
                value={fmt(parsed.maxDistM, 2, " m")}
              />
              <Row label="Duration" value={fmt(parsed.durationS, 2, " s")} />
              <Row label="Max V" value={fmt(m.maxVms, 3, " m/s")} />
              <Row label="Time to max V" value={fmt(m.timeToMaxVS, 3, " s")} />
              <Row
                label="F₀ (rel)"
                value={fmt(m.f0RelNkg, 2, " N/kg")}
                sub={fmt(m.f0N, 1, " N total")}
              />
              <Row label="V₀" value={fmt(m.v0Ms, 3, " m/s")} />
              <Row
                label="Pmax (rel)"
                value={fmt(m.pmaxRelWkg, 2, " W/kg")}
                sub={fmt(m.pmaxW, 0, " W total")}
              />
              <Row label="τ" value={fmt(m.tau, 3)} />
              <Row label="RFmax" value={fmt(m.rfMaxPct, 2, " %")} />
              <Row label="DRF" value={fmt(m.drf, 3)} />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ppa-muted">
              Splits & steps
            </h2>
            <div className="mt-4 space-y-0">
              <Row label="10 m" value={fmt(m.split10mS, 3, " s")} />
              <Row label="20 m" value={fmt(m.split20mS, 3, " s")} />
              <Row label="30 m" value={fmt(m.split30mS, 3, " s")} />
              <Row label="40 m" value={fmt(m.split40mS, 3, " s")} />
              <Row label="Total steps" value={m.totalSteps.toString()} />
              <Row label="Step freq" value={fmt(m.stepFreqHz, 2, " Hz")} />
              <Row
                label="Avg step length"
                value={fmt(m.avgStepLengthM, 2, " m")}
              />
              <Row
                label="Step length σ"
                value={fmt(m.stepLengthStdM, 3, " m")}
              />
              <Row
                label="F-V profile"
                value={
                  parsed.fvProfileValid ? "Valid (Samozino)" : "Invalid"
                }
                sub={parsed.classification.fvBalance ?? "—"}
              />
              <Row
                label="Weakest phase"
                value={parsed.classification.sprintProfile}
              />
            </div>

            {parsed.warnings.length > 0 ? (
              <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs">
                <div className="font-semibold">Warnings</div>
                <ul className="mt-1 list-disc pl-4">
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {parsed ? (
        <div className="flex items-center justify-between">
          {saveError ? (
            <div className="text-sm text-ppa-red">{saveError}</div>
          ) : (
            <div />
          )}
          <button
            type="button"
            disabled={saving || !athleteId}
            onClick={() => void handleSave()}
            className="rounded-md bg-ppa-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save session"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
