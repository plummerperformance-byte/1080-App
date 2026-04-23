import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedSprint } from "@/lib/parser/1080-parser";
import type { Database, TestTypeEnum } from "@/types/database";

/**
 * Inserts a full sprint session from a ParsedSprint. Returns the new
 * session_id so the caller can redirect to /sessions/[session_id].
 *
 * Order mirrors the SPEC:
 *   sessions → sprints → sprint_metrics → step_events → (storage) → raw_files.
 * Storage upload is non-blocking: a failure there does not abort the save.
 */
export async function saveSprintSession(
  supabase: SupabaseClient<Database>,
  args: {
    athleteId: string;
    sessionDate: string;
    notes: string | null;
    testType: TestTypeEnum;
    parsed: ParsedSprint;
    file: File;
  },
): Promise<{ sessionId: string; sprintId: string; storageWarning?: string }> {
  const { athleteId, sessionDate, notes, testType, parsed, file } = args;

  // 1. sessions
  const { data: sessionRow, error: sessionErr } = await supabase
    .from("sessions")
    .insert({
      athlete_id: athleteId,
      session_date: sessionDate,
      body_mass_kg: parsed.bodyMassKg,
      notes,
    })
    .select("id")
    .single();
  if (sessionErr || !sessionRow) {
    throw new Error(`Session insert failed: ${sessionErr?.message ?? "unknown"}`);
  }
  const sessionId = sessionRow.id;

  // 2. sprints
  const loadPctBm =
    parsed.bodyMassKg > 0 ? (parsed.avgLoadKg / parsed.bodyMassKg) * 100 : null;
  const { data: sprintRow, error: sprintErr } = await supabase
    .from("sprints")
    .insert({
      session_id: sessionId,
      sprint_number: 1,
      test_type: testType,
      sensor_source: "1080_sprint",
      load_kg: parsed.avgLoadKg,
      load_pct_bm: loadPctBm,
      distance_reached_m: parsed.maxDistM,
      duration_s: parsed.durationS,
      sprint_start_offset_s: parsed.sprintStartOffsetS > 0 ? parsed.sprintStartOffsetS : null,
      steps_derived: parsed.stepsDerived,
    })
    .select("id")
    .single();
  if (sprintErr || !sprintRow) {
    throw new Error(`Sprint insert failed: ${sprintErr?.message ?? "unknown"}`);
  }
  const sprintId = sprintRow.id;

  // 3. sprint_metrics
  const m = parsed.metrics;
  const { error: metricsErr } = await supabase.from("sprint_metrics").insert({
    sprint_id: sprintId,
    max_v_ms: m.maxVms,
    time_to_max_v_s: m.timeToMaxVS,
    dist_to_max_v_m: m.distToMaxVM,
    time_to_90pct_v_s: m.timeTo90PctVS,
    dist_to_90pct_v_m: m.distTo90PctVM,
    split_10m_s: m.split10mS,
    split_20m_s: m.split20mS,
    split_30m_s: m.split30mS,
    split_40m_s: m.split40mS,
    tau: m.tau,
    f0_n: m.f0N,
    f0_rel_nkg: m.f0RelNkg,
    v0_ms: m.v0Ms,
    pmax_w: m.pmaxW,
    pmax_rel_wkg: m.pmaxRelWkg,
    fv_slope: m.fvSlope,
    fv_imbalance_pct: m.fvImbalancePct,
    rf_max_pct: m.rfMaxPct,
    drf: m.drf,
    peak_accel_ms2: m.peakAccelMs2,
    peak_power_w: m.peakPowerW,
    peak_power_rel_wkg: m.peakPowerRelWkg,
    v_dropoff_pct: m.vDropoffPct,
    total_steps: m.totalSteps,
    step_freq_hz: m.stepFreqHz,
    avg_step_length_m: m.avgStepLengthM,
    step_length_std_m: m.stepLengthStdM,
    fv_profile_valid: parsed.fvProfileValid,
    weakest_split: parsed.classification.sprintProfile,
    profile_classification: parsed.classification.fvBalance,
    chart_samples: parsed.chartSamples,
  });
  if (metricsErr) {
    throw new Error(`Sprint metrics insert failed: ${metricsErr.message}`);
  }

  // 4. step_events
  if (parsed.steps.length > 0) {
    const rows = parsed.steps.map((s) => ({
      sprint_id: sprintId,
      step_number: s.stepNumber,
      foot_side: "unknown" as const,
      t_strike_s: s.tStrikeS,
      step_length_m: s.stepLengthM,
      step_velocity_ms: s.stepVelocityMs,
      step_frequency_hz: s.stepFrequencyHz,
      peak_force_n: s.peakForceN,
      sensor_source: "1080_sprint" as const,
    }));
    const { error: stepsErr } = await supabase.from("step_events").insert(rows);
    if (stepsErr) {
      throw new Error(`Step events insert failed: ${stepsErr.message}`);
    }
  }

  // 5 & 6. Storage upload + raw_files pointer (non-blocking).
  let storageWarning: string | undefined;
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const storagePath = `${athleteId}/${sessionId}/${safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from("raw-1080-files")
      .upload(storagePath, file, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
    if (uploadErr) {
      storageWarning = `File upload to Storage failed: ${uploadErr.message}. Session saved without raw file.`;
    } else {
      const { error: rawErr } = await supabase.from("raw_files").insert({
        sprint_id: sprintId,
        session_id: sessionId,
        storage_bucket: "raw-1080-files",
        storage_path: storagePath,
        file_type: "xlsx",
        sensor_source: "1080_sprint",
        size_bytes: file.size,
      });
      if (rawErr) {
        storageWarning = `raw_files pointer failed: ${rawErr.message}. File uploaded but not indexed.`;
      }
    }
  } catch (err) {
    storageWarning = `Storage step threw: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  return { sessionId, sprintId, storageWarning };
}
