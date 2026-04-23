/**
 * Database types — shape matches what `supabase gen types typescript` would
 * produce. Insert and Update are `Partial<Row>` — this matches the generics
 * expected by @supabase/supabase-js@2.45.4 and lets us write inserts that
 * omit auto-populated columns (id, created_at, updated_at, defaults).
 *
 * If you upgrade to supabase-js >= 2.104 later, replace this file with a
 * generated one: `supabase gen types typescript --project-id mjjxwiszqagpdmldkzwt`.
 */

export type SexEnum = "male" | "female" | "other";
export type SportEnum =
  | "rugby_union" | "rugby_league" | "rugby_sevens" | "rugby_touch"
  | "afl" | "soccer" | "basketball" | "track" | "other";
export type LevelEnum =
  | "developmental" | "club" | "semi_pro" | "pro" | "international";
export type PositionGroupEnum =
  | "forward" | "back"
  | "hit_up_forward" | "adjustable" | "outside_back"
  | "other";
export type TestTypeEnum =
  | "unresisted_sprint" | "resisted_sprint" | "assisted_sprint"
  | "acceleration_to_deceleration" | "load_velocity_profile"
  | "multi_load_fv_profile" | "other";
export type SensorSourceEnum =
  | "1080_sprint" | "opto_gait" | "playermaker" | "output_sports"
  | "timing_gates" | "mysprint_ios" | "manual" | "other";
export type FootSideEnum = "left" | "right" | "unknown";

export type Athlete = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  sex: SexEnum;
  sport: SportEnum;
  level: LevelEnum;
  position: string | null;
  position_group: PositionGroupEnum;
  team: string | null;
  height_cm: number | null;
  body_mass_kg: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Session = {
  id: string;
  athlete_id: string;
  session_date: string;
  session_time: string | null;
  location: string | null;
  surface: string | null;
  weather: string | null;
  temperature_c: number | null;
  notes: string | null;
  rpe_pre: number | null;
  whoop_recovery: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  body_mass_kg: number | null;
  created_at: string;
  updated_at: string;
};

export type Sprint = {
  id: string;
  session_id: string;
  sprint_number: number;
  test_type: TestTypeEnum;
  sensor_source: SensorSourceEnum;
  load_kg: number | null;
  load_pct_bm: number | null;
  distance_target_m: number | null;
  distance_reached_m: number | null;
  duration_s: number | null;
  notes: string | null;
  sprint_start_offset_s: number | null;
  steps_derived: boolean | null;
  created_at: string;
};

export type SprintMetrics = {
  sprint_id: string;
  max_v_ms: number | null;
  time_to_max_v_s: number | null;
  dist_to_max_v_m: number | null;
  time_to_90pct_v_s: number | null;
  dist_to_90pct_v_m: number | null;
  split_10m_s: number | null;
  split_20m_s: number | null;
  split_30m_s: number | null;
  split_40m_s: number | null;
  tau: number | null;
  f0_n: number | null;
  f0_rel_nkg: number | null;
  v0_ms: number | null;
  pmax_w: number | null;
  pmax_rel_wkg: number | null;
  fv_slope: number | null;
  fv_imbalance_pct: number | null;
  rf_max_pct: number | null;
  drf: number | null;
  peak_accel_ms2: number | null;
  peak_power_w: number | null;
  peak_power_rel_wkg: number | null;
  v_dropoff_pct: number | null;
  total_steps: number | null;
  step_freq_hz: number | null;
  avg_step_length_m: number | null;
  step_length_std_m: number | null;
  avg_gct_ms: number | null;
  avg_flight_time_ms: number | null;
  avg_stiffness_knm: number | null;
  rsi: number | null;
  profile_classification: string | null;
  weakest_split: string | null;
  fv_profile_valid: boolean;
  created_at: string;
  updated_at: string;
};

export type StepEvent = {
  id: string;
  sprint_id: string;
  step_number: number;
  foot_side: FootSideEnum;
  t_strike_s: number | null;
  t_takeoff_s: number | null;
  gct_ms: number | null;
  flight_time_ms: number | null;
  step_period_ms: number | null;
  step_length_m: number | null;
  step_velocity_ms: number | null;
  step_frequency_hz: number | null;
  peak_force_n: number | null;
  peak_force_left_n: number | null;
  peak_force_right_n: number | null;
  asymmetry_pct: number | null;
  stiffness_knm: number | null;
  sensor_source: SensorSourceEnum;
  created_at: string;
};

export type RawFile = {
  id: string;
  sprint_id: string | null;
  session_id: string | null;
  storage_bucket: string;
  storage_path: string;
  file_type: string;
  sensor_source: SensorSourceEnum;
  size_bytes: number | null;
  uploaded_at: string;
};

export type Norm = {
  id: string;
  metric_name: string;
  unit: string | null;
  sport: SportEnum;
  level: LevelEnum;
  sex: SexEnum;
  position_group: PositionGroupEnum | null;
  poor_max: number | null;
  fair_max: number | null;
  good_max: number | null;
  great_max: number | null;
  higher_is_better: boolean;
  source: string | null;
  notes: string | null;
  created_at: string;
};

export type SessionSummary = {
  session_id: string;
  athlete_id: string;
  athlete_name: string;
  position_group: PositionGroupEnum;
  session_date: string;
  body_mass_kg: number | null;
  sprint_count: number;
  best_max_v_ms: number | null;
  avg_f0_rel: number | null;
  avg_v0: number | null;
  avg_pmax_rel: number | null;
  best_10m_s: number | null;
  best_40m_s: number | null;
  notes: string | null;
};

export type Database = {
  public: {
    Tables: {
      athletes: {
        Row: Athlete;
        Insert: Partial<Athlete>;
        Update: Partial<Athlete>;
        Relationships: [];
      };
      sessions: {
        Row: Session;
        Insert: Partial<Session>;
        Update: Partial<Session>;
        Relationships: [];
      };
      sprints: {
        Row: Sprint;
        Insert: Partial<Sprint>;
        Update: Partial<Sprint>;
        Relationships: [];
      };
      sprint_metrics: {
        Row: SprintMetrics;
        Insert: Partial<SprintMetrics>;
        Update: Partial<SprintMetrics>;
        Relationships: [];
      };
      step_events: {
        Row: StepEvent;
        Insert: Partial<StepEvent>;
        Update: Partial<StepEvent>;
        Relationships: [];
      };
      raw_files: {
        Row: RawFile;
        Insert: Partial<RawFile>;
        Update: Partial<RawFile>;
        Relationships: [];
      };
      norms: {
        Row: Norm;
        Insert: Partial<Norm>;
        Update: Partial<Norm>;
        Relationships: [];
      };
    };
    Views: {
      v_session_summaries: {
        Row: SessionSummary;
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: {
      sex_enum: SexEnum;
      sport_enum: SportEnum;
      level_enum: LevelEnum;
      position_group_enum: PositionGroupEnum;
      test_type_enum: TestTypeEnum;
      sensor_source_enum: SensorSourceEnum;
      foot_side_enum: FootSideEnum;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
