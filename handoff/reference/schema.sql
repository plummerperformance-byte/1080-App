-- ============================================================================
-- 1080 App — Initial Schema
-- Plummer Performance Academy
-- ============================================================================
-- Design principles:
--   * Raw files live in Storage (cheap). Derived metrics live in Postgres.
--   * Step events are a first-class table — ready for GCT/stiffness sensor data.
--   * Norms are parameterised by sport/level/sex/position so they can evolve.
--   * RLS enabled but permissive for v0.1 (solo-coach use). Tighten before
--     multi-coach rollout.
-- ============================================================================

-- ---------- EXTENSIONS ------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------- ENUMS -----------------------------------------------------------
create type sex_enum as enum ('male','female','other');

create type sport_enum as enum (
  'rugby_union','rugby_league','rugby_sevens','rugby_touch',
  'afl','soccer','basketball','track','other'
);

create type level_enum as enum (
  'developmental','club','semi_pro','pro','international'
);

create type position_group_enum as enum (
  'forward','back',
  -- rugby league specific
  'hit_up_forward','adjustable','outside_back',
  -- generic
  'other'
);

create type test_type_enum as enum (
  'unresisted_sprint',
  'resisted_sprint',
  'assisted_sprint',
  'acceleration_to_deceleration',
  'load_velocity_profile',
  'multi_load_fv_profile',
  'other'
);

create type sensor_source_enum as enum (
  '1080_sprint',
  'opto_gait',
  'playermaker',
  'output_sports',
  'timing_gates',
  'mysprint_ios',
  'manual',
  'other'
);

create type foot_side_enum as enum ('left','right','unknown');

-- ---------- ATHLETES --------------------------------------------------------
create table athletes (
  id              uuid primary key default uuid_generate_v4(),
  full_name       text not null,
  date_of_birth   date,
  sex             sex_enum default 'male',
  sport           sport_enum default 'rugby_union',
  level           level_enum default 'club',
  position        text,                -- free text e.g. "right wing"
  position_group  position_group_enum default 'back',
  team            text,
  height_cm       numeric(5,1),
  body_mass_kg    numeric(5,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index athletes_name_idx on athletes using gin (to_tsvector('english', full_name));

-- ---------- SESSIONS --------------------------------------------------------
create table sessions (
  id               uuid primary key default uuid_generate_v4(),
  athlete_id       uuid not null references athletes(id) on delete cascade,
  session_date     date not null default current_date,
  session_time     time,
  location         text,
  surface          text,                -- grass, synthetic, indoor-rubber etc
  weather          text,
  temperature_c    numeric(4,1),
  notes            text,
  -- Context — useful for interpreting results
  rpe_pre          smallint check (rpe_pre between 0 and 10),
  whoop_recovery   smallint check (whoop_recovery between 0 and 100),
  hrv_ms           numeric(5,1),
  sleep_hours      numeric(4,1),
  -- Body mass at time of session (may differ from athlete.body_mass_kg)
  body_mass_kg     numeric(5,2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index sessions_athlete_date_idx on sessions (athlete_id, session_date desc);

-- ---------- SPRINTS ---------------------------------------------------------
-- One session can contain multiple sprints (e.g. 5 sprints at different loads
-- for a multi-load F-V profile).
create table sprints (
  id                 uuid primary key default uuid_generate_v4(),
  session_id         uuid not null references sessions(id) on delete cascade,
  sprint_number      smallint not null,
  test_type          test_type_enum not null default 'unresisted_sprint',
  sensor_source      sensor_source_enum not null default '1080_sprint',
  load_kg            numeric(5,2),
  load_pct_bm        numeric(5,2),
  distance_target_m  numeric(5,1),
  distance_reached_m numeric(6,2),
  duration_s         numeric(5,3),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (session_id, sprint_number)
);

create index sprints_session_idx on sprints (session_id, sprint_number);

-- ---------- SPRINT METRICS --------------------------------------------------
-- All derived metrics from one sprint. One-to-one with sprints.
create table sprint_metrics (
  sprint_id                  uuid primary key references sprints(id) on delete cascade,

  -- Sprint performance
  max_v_ms                   numeric(5,3),
  time_to_max_v_s            numeric(5,3),
  dist_to_max_v_m            numeric(6,2),
  time_to_90pct_v_s          numeric(5,3),
  dist_to_90pct_v_m          numeric(6,2),

  -- Splits (null if distance not reached)
  split_10m_s                numeric(5,3),
  split_20m_s                numeric(5,3),
  split_30m_s                numeric(5,3),
  split_40m_s                numeric(5,3),

  -- Samozino F-V profile (valid only for ~unresisted sprints)
  tau                        numeric(5,3),     -- exponential time constant
  f0_n                       numeric(7,2),     -- theoretical max horizontal force (N)
  f0_rel_nkg                 numeric(5,3),     -- F0 per kg BM
  v0_ms                      numeric(5,3),     -- theoretical max velocity (m/s)
  pmax_w                     numeric(7,1),     -- peak mechanical power (W)
  pmax_rel_wkg               numeric(5,2),     -- Pmax per kg BM
  fv_slope                   numeric(6,2),     -- linear F-v slope
  fv_imbalance_pct           numeric(5,1),     -- % deviation from optimal F-v

  -- Mechanical effectiveness (Morin RF% & DRF)
  rf_max_pct                 numeric(5,2),
  drf                        numeric(6,3),

  -- Additional performance metrics
  peak_accel_ms2             numeric(5,2),
  peak_power_w               numeric(7,1),
  peak_power_rel_wkg         numeric(5,2),
  v_dropoff_pct              numeric(5,2),     -- (maxV - endV)/maxV

  -- Step-level aggregates (can be from 1080 OR from external sensor)
  total_steps                smallint,
  step_freq_hz               numeric(4,2),     -- mean step freq over sprint
  avg_step_length_m          numeric(4,2),
  step_length_std_m          numeric(4,3),
  avg_gct_ms                 numeric(5,1),     -- null until sensor available
  avg_flight_time_ms         numeric(5,1),     -- null until sensor available
  avg_stiffness_knm          numeric(5,2),     -- null until sensor available
  rsi                        numeric(4,2),     -- reactive strength index

  -- Classification (derived by app logic, cached here for fast queries)
  profile_classification     text,             -- 'force_deficit','velocity_deficit','balanced'
  weakest_split              text,             -- 'acceleration','late_accel','transition','max_v'
  fv_profile_valid           boolean default true,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ---------- STEP EVENTS -----------------------------------------------------
-- Per-step data. Populated from 1080 step table AND/OR external sensor.
-- GCT/flight/stiffness columns are nullable — only populated when a sensor
-- that measures them (OptoGait, Playermaker, high-speed video) is connected.
create table step_events (
  id                 uuid primary key default uuid_generate_v4(),
  sprint_id          uuid not null references sprints(id) on delete cascade,
  step_number        smallint not null,
  foot_side          foot_side_enum default 'unknown',
  -- Timing
  t_strike_s         numeric(6,4),           -- foot-strike time in sprint
  t_takeoff_s        numeric(6,4),           -- toe-off time in sprint
  gct_ms             numeric(5,1),           -- ground contact time (ms)
  flight_time_ms     numeric(5,1),
  step_period_ms     numeric(5,1),           -- strike-to-strike
  -- Kinematics
  step_length_m      numeric(4,2),
  step_velocity_ms   numeric(5,3),           -- avg V during step
  step_frequency_hz  numeric(4,2),
  -- Kinetics (from 1080 or force sensor)
  peak_force_n       numeric(7,2),
  peak_force_left_n  numeric(7,2),           -- L/R asymmetry from 1080 L/R analysis
  peak_force_right_n numeric(7,2),
  asymmetry_pct      numeric(5,2),           -- |L-R|/max(L,R) * 100
  -- Derived
  stiffness_knm      numeric(6,2),           -- vertical leg stiffness
  sensor_source      sensor_source_enum not null default '1080_sprint',

  created_at         timestamptz not null default now(),
  unique (sprint_id, step_number, foot_side)
);

create index step_events_sprint_idx on step_events (sprint_id, step_number);

-- ---------- RAW FILES -------------------------------------------------------
-- Pointers to raw xlsx/CSV files in Supabase Storage. Keeps sprints.id clean
-- while preserving re-analysable source data.
create table raw_files (
  id             uuid primary key default uuid_generate_v4(),
  sprint_id      uuid references sprints(id) on delete cascade,
  session_id     uuid references sessions(id) on delete cascade,
  storage_bucket text not null default 'raw-1080-files',
  storage_path   text not null,
  file_type      text not null,        -- xlsx, csv, mp4
  sensor_source  sensor_source_enum default '1080_sprint',
  size_bytes     bigint,
  uploaded_at    timestamptz not null default now(),
  check (sprint_id is not null or session_id is not null)
);

-- ---------- NORMS -----------------------------------------------------------
-- Benchmark bands keyed by (metric, sport, level, sex, position_group).
-- Used for colour-coded rank display. Start rugby-focused; extend later.
create table norms (
  id              uuid primary key default uuid_generate_v4(),
  metric_name     text not null,              -- e.g. 'f0_rel_nkg', 'v0_ms'
  unit            text,                        -- display unit
  sport           sport_enum default 'rugby_union',
  level           level_enum default 'club',
  sex             sex_enum default 'male',
  position_group  position_group_enum,         -- null = any position
  -- Banding: value below X = <band>
  poor_max        numeric(8,3),
  fair_max        numeric(8,3),
  good_max        numeric(8,3),
  great_max       numeric(8,3),
  -- Elite is open-ended above great_max
  higher_is_better boolean not null default true,
  source          text,                        -- citation
  notes           text,
  created_at      timestamptz not null default now()
);

create index norms_lookup_idx on norms (metric_name, sport, level, sex, position_group);

-- ---------- VIEWS -----------------------------------------------------------
-- Convenience view: latest metrics per athlete for the trend dashboard
create view v_session_summaries as
select
  s.id               as session_id,
  s.athlete_id,
  a.full_name        as athlete_name,
  a.position_group,
  s.session_date,
  s.body_mass_kg,
  count(sp.id)       as sprint_count,
  max(sm.max_v_ms)   as best_max_v_ms,
  avg(sm.f0_rel_nkg) as avg_f0_rel,
  avg(sm.v0_ms)      as avg_v0,
  avg(sm.pmax_rel_wkg) as avg_pmax_rel,
  min(sm.split_10m_s)  as best_10m_s,
  min(sm.split_40m_s)  as best_40m_s,
  s.notes
from sessions s
join athletes a on a.id = s.athlete_id
left join sprints sp on sp.session_id = s.id
left join sprint_metrics sm on sm.sprint_id = sp.id
group by s.id, a.full_name, a.position_group;

-- ---------- SEED: NORMS -----------------------------------------------------
-- Rugby-focused norms. Sources:
--   Morin & Samozino (2017), jbmorin.net normative ranges
--   Cross et al. (2015) Mechanical properties of sprinting in elite rugby codes
--   Nicholson et al. (2021) Academy rugby league F-V profiles
--   Calderbank et al. (2021) Step mechanics in academy RU
-- These are starting points — refine as you collect your own PPA data.

-- F0 (N/kg) — rugby club level, male, any position
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('f0_rel_nkg','N/kg','rugby_union','club','male',null, 4.5, 5.5, 6.5, 7.5, true,
 'Morin & Samozino 2017 normative ranges'),
('f0_rel_nkg','N/kg','rugby_union','pro','male',null,  6.0, 7.0, 8.0, 9.0, true,
 'Morin & Samozino 2017; Cross et al. 2015 elite RU'),
('f0_rel_nkg','N/kg','rugby_league','club','male',null, 4.0, 5.0, 6.0, 7.0, true,
 'Nicholson et al. 2021 academy RL');

-- V0 (m/s)
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('v0_ms','m/s','rugby_union','club','male',null, 7.5, 8.5, 9.5, 10.3, true,
 'Morin & Samozino 2017'),
('v0_ms','m/s','rugby_union','pro','male',null,  8.5, 9.3, 10.0, 10.8, true,
 'Cross et al. 2015 elite RU'),
('v0_ms','m/s','rugby_league','club','male',null, 7.0, 8.0, 9.0, 10.0, true,
 'Nicholson et al. 2021 academy RL');

-- Pmax (W/kg)
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('pmax_rel_wkg','W/kg','rugby_union','club','male',null, 11, 14, 17, 20, true,
 'Morin & Samozino 2017'),
('pmax_rel_wkg','W/kg','rugby_union','pro','male',null,  15, 18, 21, 24, true,
 'Morin 2017-18 French elite RU follow-up'),
('pmax_rel_wkg','W/kg','rugby_league','club','male',null, 10, 13, 16, 19, true,
 'Nicholson et al. 2021');

-- RFmax (%)
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('rf_max_pct','%','rugby_union','club','male',null, 28, 36, 44, 52, true,
 'Morin & Samozino 2017 (20–60% range)'),
('rf_max_pct','%','rugby_union','pro','male',null,  38, 46, 52, 58, true,
 'Morin & Samozino 2017');

-- DRF (%) — lower (closer to 0) is better, so higher_is_better = true when
-- we interpret the value as "-4% is better than -10%". Store as the raw %,
-- ranking logic handles direction.
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('drf','%','rugby_union','club','male',null, -9, -8, -7, -6, true,
 'Morin & Samozino 2017 (-10 to -4% range); higher is better'),
('drf','%','rugby_union','pro','male',null,  -8, -7, -6, -5, true,
 'Morin & Samozino 2017');

-- 10m split (s) — lower is better
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('split_10m_s','s','rugby_union','club','male','forward', 2.20, 2.10, 2.00, 1.95, false,
 'Barr et al. 2014; Crean 2015 rugby benchmarks'),
('split_10m_s','s','rugby_union','club','male','back',    2.10, 2.00, 1.90, 1.82, false,
 'Barr et al. 2014'),
('split_10m_s','s','rugby_league','club','male','forward', 2.15, 2.06, 1.98, 1.92, false,
 'Till et al. 2014 English U20 RL'),
('split_10m_s','s','rugby_league','club','male','back',    2.05, 1.99, 1.91, 1.85, false,
 'Till et al. 2014');

-- 40m split (s)
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('split_40m_s','s','rugby_union','club','male','forward', 6.10, 5.90, 5.70, 5.55, false,
 'Rugby literature aggregate'),
('split_40m_s','s','rugby_union','club','male','back',    5.85, 5.65, 5.45, 5.25, false,
 'Rugby literature aggregate'),
('split_40m_s','s','rugby_league','club','male','forward', 6.00, 5.80, 5.65, 5.50, false,
 'Till et al. 2014 U20 RL (5.80s backs)'),
('split_40m_s','s','rugby_league','club','male','back',    5.80, 5.65, 5.45, 5.30, false,
 'Till et al. 2014');

-- Max V (m/s)
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('max_v_ms','m/s','rugby_union','club','male','forward', 7.5, 8.3, 9.0, 9.5, true,
 'Rugby literature aggregate'),
('max_v_ms','m/s','rugby_union','club','male','back',    8.5, 9.2, 9.8, 10.3, true,
 'Rugby literature aggregate'),
('max_v_ms','m/s','rugby_league','club','male','forward', 7.5, 8.2, 8.8, 9.3, true,
 'Rugby literature aggregate'),
('max_v_ms','m/s','rugby_league','club','male','back',    8.4, 9.0, 9.6, 10.2, true,
 'Rugby literature aggregate');

-- Step frequency (Hz) at max V
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('step_freq_hz','Hz','rugby_union','club','male',null, 3.8, 4.0, 4.3, 4.5, true,
 'Elite sprinter SF ~4.5-5.0 Hz; team sport slightly lower');

-- Step length (m) at max V
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('avg_step_length_m','m','rugby_union','club','male',null, 1.80, 2.00, 2.20, 2.35, true,
 'Field-sport literature; depends on leg length');

-- GCT at max V (ms) — lower is better
insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
('avg_gct_ms','ms','rugby_union','club','male',null, 180, 160, 140, 120, false,
 'Elite sprinters 80–120 ms; rugby typically 120–160 ms');

-- ---------- TRIGGERS: auto-update updated_at --------------------------------
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger athletes_touch before update on athletes
  for each row execute function touch_updated_at();
create trigger sessions_touch before update on sessions
  for each row execute function touch_updated_at();
create trigger sprint_metrics_touch before update on sprint_metrics
  for each row execute function touch_updated_at();

-- ---------- RLS -------------------------------------------------------------
-- Enabled but permissive for v0.1. Tighten before multi-coach rollout by
-- adding an `owner_id` to athletes and writing real policies.
alter table athletes       enable row level security;
alter table sessions       enable row level security;
alter table sprints        enable row level security;
alter table sprint_metrics enable row level security;
alter table step_events    enable row level security;
alter table raw_files      enable row level security;
alter table norms          enable row level security;

-- Permissive policies — anyone authenticated can read/write. Replace for prod.
create policy "authed_all" on athletes       for all to authenticated using (true) with check (true);
create policy "authed_all" on sessions       for all to authenticated using (true) with check (true);
create policy "authed_all" on sprints        for all to authenticated using (true) with check (true);
create policy "authed_all" on sprint_metrics for all to authenticated using (true) with check (true);
create policy "authed_all" on step_events    for all to authenticated using (true) with check (true);
create policy "authed_all" on raw_files      for all to authenticated using (true) with check (true);
create policy "authed_read" on norms         for select to authenticated using (true);

-- For local dev without auth, allow anon too. REMOVE BEFORE PRODUCTION.
create policy "anon_dev_all" on athletes       for all to anon using (true) with check (true);
create policy "anon_dev_all" on sessions       for all to anon using (true) with check (true);
create policy "anon_dev_all" on sprints        for all to anon using (true) with check (true);
create policy "anon_dev_all" on sprint_metrics for all to anon using (true) with check (true);
create policy "anon_dev_all" on step_events    for all to anon using (true) with check (true);
create policy "anon_dev_all" on raw_files      for all to anon using (true) with check (true);
create policy "anon_dev_read" on norms         for select to anon using (true);

-- ---------- STORAGE BUCKET --------------------------------------------------
-- Run this manually in the Supabase dashboard under Storage, OR uncomment:
-- insert into storage.buckets (id, name, public) values ('raw-1080-files', 'raw-1080-files', false);

-- ============================================================================
-- DONE. Next steps:
--  1. In Supabase Storage, create a private bucket named 'raw-1080-files'.
--  2. Grab your anon key + URL from Settings → API, paste into .env.local.
--  3. Run the Next.js app.
-- ============================================================================
