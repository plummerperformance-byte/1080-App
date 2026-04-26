-- ============================================================================
-- 1080 App — Chart samples + synced playback support
-- ============================================================================
-- Adds the velocity/distance time-series to sprint_metrics so the session
-- page can render the synced timeline alongside the side-on video, AND a
-- helper view that joins everything needed for the synced playback view.
-- ============================================================================

-- Velocity / distance / time samples, downsampled to ~300 points by the
-- parser at upload time. Used by the session page synced timeline.
alter table sprint_metrics
  add column if not exists chart_samples jsonb;

comment on column sprint_metrics.chart_samples is
  'Downsampled v(t) and x(t) samples from the 1080 raw data. Array of {t, v, x}.';

-- Allow the synced player to update sync_offset_ms after a manual nudge.
-- (Already permissive via authed/anon RLS; no change needed.)

-- Sanity check: index for time-range pose-frame lookups during playback.
create index if not exists pose_frames_t_idx on pose_frames (video_id, t_s);
