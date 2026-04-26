-- ============================================================================
-- 1080 App — Phase 2: Sprint Technique Video Tracker
-- Plummer Performance Academy
-- ============================================================================
-- Adds side-on video + MediaPipe pose tracking. Extends the 1080-only schema
-- with three tables and one enum value:
--   * sprint_videos             — one video per sprint, with sync metadata
--   * pose_frames               — per-frame keypoints + joint angles (jsonb)
--   * technique_assessments     — per-phase rollups (acceleration / max V / decel)
--
-- Why pose-from-video matters: the 1080 captures kinetics (force, velocity,
-- distance, time) but not kinematics (joint angles, posture, technique).
-- Side-on video + MediaPipe Pose Landmarker fills that gap AND fills the
-- previously-null sprint_metrics.avg_gct_ms / avg_flight_time_ms columns
-- via foot-strike / toe-off detection from ankle keypoint trajectories.
--
-- All processing runs in the browser via TensorFlow.js + MediaPipe (Apache 2.0).
-- The server only stores the resulting JSON — no ML on Vercel.
-- ============================================================================

-- ---------- ENUM EXTENSIONS -------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type t join pg_enum e on t.oid = e.enumtypid
                 where t.typname = 'sensor_source_enum' and e.enumlabel = 'video_pose') then
    alter type sensor_source_enum add value 'video_pose';
  end if;
end $$;

create type camera_side_enum as enum ('left','right','front','rear','unknown');

-- ---------- SPRINT VIDEOS ---------------------------------------------------
create table sprint_videos (
  id              uuid primary key default uuid_generate_v4(),
  sprint_id       uuid not null references sprints(id) on delete cascade,
  storage_bucket  text not null default 'raw-1080-files',
  storage_path    text not null,
  camera_side     camera_side_enum not null default 'unknown',
  fps             numeric(5,2),
  duration_s      numeric(6,3),
  width_px        integer,
  height_px       integer,
  -- Time offset (ms) between video t=0 and 1080 t=0. Positive means video
  -- starts AFTER 1080 starts. Used by the session page to sync playback.
  sync_offset_ms  integer not null default 0,
  uploaded_at     timestamptz not null default now()
);

create index sprint_videos_sprint_idx on sprint_videos (sprint_id);

-- ---------- POSE FRAMES -----------------------------------------------------
-- Per-frame MediaPipe Pose output. Stored as jsonb so the 33-keypoint payload
-- is queryable without bloating the row. Frame storage is downsampled to
-- ~5-10 Hz at insert time (the analyser runs at 30 fps, but per-frame storage
-- is wasteful at that rate).
create table pose_frames (
  id            uuid primary key default uuid_generate_v4(),
  video_id      uuid not null references sprint_videos(id) on delete cascade,
  frame_index   integer not null,
  t_s           numeric(6,3) not null,
  -- keypoints: { "left_shoulder": { x, y, z, visibility }, ... }
  keypoints     jsonb not null,
  -- joint_angles: { "trunkLeanDeg": -32.4, "kneeFlexionDeg": 95.1, ... }
  joint_angles  jsonb,
  created_at    timestamptz not null default now(),
  unique (video_id, frame_index)
);

create index pose_frames_video_idx on pose_frames (video_id, t_s);

-- ---------- TECHNIQUE ASSESSMENTS -------------------------------------------
-- One row per sprint × phase (acceleration / max_velocity / deceleration).
-- Mean joint angles + stride timing + diagnostic flags ("Trunk too upright
-- in acceleration", etc).
create table technique_assessments (
  id                       uuid primary key default uuid_generate_v4(),
  sprint_id                uuid not null references sprints(id) on delete cascade,
  video_id                 uuid not null references sprint_videos(id) on delete cascade,
  phase                    text not null check (phase in ('acceleration','max_velocity','deceleration')),
  trunk_lean_deg           numeric(6,2),
  knee_drive_deg           numeric(6,2),
  ankle_dorsiflexion_deg   numeric(6,2),
  hip_extension_deg        numeric(6,2),
  contact_time_ms          numeric(6,2),
  flight_time_ms           numeric(6,2),
  flags                    text[] default '{}',
  created_at               timestamptz not null default now(),
  unique (sprint_id, phase)
);

create index technique_assessments_sprint_idx on technique_assessments (sprint_id);

-- ---------- RLS -------------------------------------------------------------
alter table sprint_videos          enable row level security;
alter table pose_frames            enable row level security;
alter table technique_assessments  enable row level security;

create policy "authed_all" on sprint_videos          for all to authenticated using (true) with check (true);
create policy "authed_all" on pose_frames            for all to authenticated using (true) with check (true);
create policy "authed_all" on technique_assessments  for all to authenticated using (true) with check (true);

create policy "anon_dev_all" on sprint_videos          for all to anon using (true) with check (true);
create policy "anon_dev_all" on pose_frames            for all to anon using (true) with check (true);
create policy "anon_dev_all" on technique_assessments  for all to anon using (true) with check (true);

-- ---------- SEED: TECHNIQUE NORMS -------------------------------------------
-- Rugby-specific kinematic targets. Sources:
--   Mann (2011) "The Mechanics of Sprinting and Hurdling"
--   Clark et al. (2020) Sprint mechanics in field-sport athletes
--   Healy et al. (2019) Sprint kinematics in elite sprinters vs. team-sport athletes

insert into norms (metric_name, unit, sport, level, sex, position_group,
                   poor_max, fair_max, good_max, great_max, higher_is_better, source) values
-- Trunk lean (deg from vertical) during acceleration — more negative = more lean
('trunk_lean_accel_deg','°','rugby_union','club','male',null, -15, -25, -35, -42, false,
 'Mann 2011 / Clark 2020; elite accel ~ -45°'),
-- Knee flex angle (deg) at max V — lower = better knee drive
('knee_flex_maxv_deg','°','rugby_union','club','male',null, 130, 115, 100, 90, false,
 'Mann 2011; elite ~85-90°'),
-- Ground contact time (ms) at max V — lower = better
('contact_time_maxv_ms','ms','rugby_union','club','male',null, 180, 160, 140, 110, false,
 'Healy 2019; elite sprinters 80-100ms, rugby 120-160ms'),
-- Hip extension at toe-off (deg) — higher = better drive
('hip_extension_deg','°','rugby_union','club','male',null, 165, 175, 185, 195, true,
 'Mann 2011 / Clark 2020');
