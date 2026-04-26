# PPA 1080 Sprint Analyser

Web app for **Plummer Performance Academy**. Coach uploads a 1080 Sprint xlsx
export → app parses it → metrics save to Supabase → dashboard shows session +
rugby-norm rankings + trend charts. Phase 2 adds **side-on sprint video
technique tracking** via MediaPipe Pose, all in the browser.

The full build spec lives in [`reference/SPEC.md`](reference/SPEC.md).

## What's in the app today

**Phase 1 — 1080 sprint analytics**

- Athletes page with add-athlete form
- Athlete detail page with six trend charts (Max V, F₀ rel, V₀, Pmax rel, 10m, 40m)
- Upload page that parses 1080 xlsx in the browser, previews metrics, saves to Supabase
- Session detail page with five rank-banded headline cards, splits chart, full metrics grid, per-step table

**Phase 2 — sprint technique video tracker** *(new — Apr 2026)*

- Drop a side-on sprint video alongside the 1080 xlsx on the upload page
- Browser-side MediaPipe Pose Landmarker extracts 33 keypoints per frame
- Custom layer derives:
  - Joint angles (trunk lean, hip flexion, knee flexion, ankle dorsiflexion, hip extension)
  - Foot-strike / toe-off events from ankle Y-trajectory
  - Per-step contact time + flight time (fills `step_events.gct_ms` / `flight_time_ms`)
  - Per-phase technique assessment (acceleration / max velocity / deceleration) with diagnostic flags
- Session page replays the video alongside the 1080 metrics with a synced timeline

All ML runs in the browser via WASM — no server-side compute, no per-rep cost.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript strict
- Tailwind CSS
- Supabase (Postgres + Storage) — `@supabase/supabase-js@2.45.4` per spec
- SheetJS `xlsx@0.18.5` for parsing
- `@mediapipe/tasks-vision@0.10.14` for pose detection
- Recharts for charts

## Setup

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Apply schema
# In Supabase SQL Editor, run in order:
#   supabase/migrations/20260423000000_initial_schema.sql
#   supabase/migrations/20260426000000_video_pose_phase2.sql
# Then create a private storage bucket named `raw-1080-files`.

# 4. Run
npm run dev
```

## Project layout

```
src/
  app/
    page.tsx                       Home — recent sessions + entry cards
    athletes/                      Roster + add-athlete + per-athlete trends
    upload/                        1080 xlsx + video upload flow
    sessions/[id]/                 Full session dashboard with video playback
  components/ui.tsx                Metric / RankCard / Field / Select / Card / Pill
  lib/
    parser-1080.ts                 xlsx → ParsedSprint (browser-side)
    norms.ts                       selectNorm + rankValue (Poor → Elite bands)
    supabase/{client,server}.ts    Supabase clients
    pose/
      analyser.ts                  MediaPipe wrapper — analyseSprintVideo(file)
      angles.ts                    Joint-angle math
      events.ts                    Foot-strike / toe-off detection
      types.ts                     Public types for the pose module
  types/database.ts                Hand-written DB types
supabase/migrations/               Postgres schema (Phase 1 + Phase 2)
reference/                         Original spec + sample xlsx + parser source
```

## Definition of done — Phase 1

- [x] `npm run build` succeeds with zero TypeScript errors
- [x] Athlete CRUD via `/athletes`
- [x] Upload `sample_play.xlsx` via `/upload`, preview shows correct metrics, save succeeds
- [x] Session detail page shows rank pills matching the norms
- [x] Athlete detail page shows trend charts
- [x] Home page shows recent sessions
- [ ] Deploys to Vercel clean *(awaiting first deploy)*

## Definition of done — Phase 2

- [x] Schema delta applied (`sprint_videos`, `pose_frames`, `technique_assessments`)
- [x] Browser-side MediaPipe pose analysis runs on dropped video
- [x] Per-frame joint angles + gait events persisted
- [x] Session page replays the video with technique panel
- [ ] Frame-by-frame stick-figure overlay on the session page *(roadmap)*
- [ ] Manual sync-offset slider for video ↔ 1080 alignment *(roadmap)*

## Known caveats

- **Pose model accuracy** — MediaPipe Pose Landmarker Lite is fast but loses joint precision
  at high motion blur. Switch to Heavy via `analyser.ts` `POSE_MODEL_URL` if needed.
- **Foot-strike detection** — ankle-Y heuristic is ~±15ms vs. force plate. Good enough for
  rugby-relative coaching, not for biomechanics research.
- **Video timeline ↔ 1080 timeline** — `sync_offset_ms` is currently always 0. A manual slider
  on the session page is on the roadmap. For now, start the video at the same instant as the
  1080 sprint to keep them aligned.
- **Video storage** — videos go into the same `raw-1080-files` bucket. Supabase free tier
  caps at 1 GB; budget ~5–20 MB per sprint clip.
