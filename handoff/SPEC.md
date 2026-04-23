# 1080 App — Build Specification for Claude Code

**This document is the complete spec for the PPA 1080 Sprint Analyser.**
Hand this whole folder to Claude Code inside your `1080-App` repo. It has everything needed to scaffold and build the app from zero.

---

## Context

You're building a web app for **Plummer Performance Academy (PPA)** — a speed and athletic performance coaching business run by Adam Plummer, a right-wing rugby player competing at Shute Shield level (Hunter Wildfires) in Newcastle NSW.

PPA owns a **1080 Sprint** (resisted/assisted sprint trainer). Its native tablet software exports xlsx files with raw 1 kHz sampled sprint data plus a derived dashboard. Those exports are hard to track longitudinally — every session is one-off, there's no trend view, no rugby-specific benchmarking, and no way to compare athletes.

**This app fixes that.** Coach uploads a 1080 xlsx → app parses it → all metrics (F₀, V₀, Pmax, splits, step mechanics) save to Supabase → dashboard shows session + rugby norm rankings + trend charts over time. Optional Phase 2: add GCT/stiffness data from an external sensor (OptoGait, Playermaker).

The schema and parser logic are both already designed and tested. Your job is to build a clean Next.js 14 app around them that compiles, deploys to Vercel, and works against Supabase project `mjjxwiszqagpdmldkzwt` (already provisioned with the schema).

---

## Repo

`github.com/plummerperformance-byte/1080-App` — currently empty.

## Stack (non-negotiable)

- **Next.js 14** App Router
- **TypeScript** strict mode
- **Supabase** (Postgres + Storage + Auth — auth wired in v0.2)
- **Tailwind CSS**
- **Recharts** for charts
- **SheetJS (xlsx) 0.18.5** pinned — `^0.18.5` from npm, NOT the CDN version
- **react-dropzone** for file uploads
- **@supabase/ssr** + **@supabase/supabase-js** (see pinning note below)
- **Vercel** for deploy

### ⚠️ Critical Supabase client version pin

`@supabase/supabase-js@2.104` introduced a generics rewrite that rejects hand-written `Database` types unless they perfectly match the auto-generated shape. I hit hours of `never` type errors fighting this. **Two paths — pick one:**

**Option A (recommended):** Pin `@supabase/supabase-js@^2.45.4`. This version has straightforward generics that accept `Database` types built with `Partial<Row>` for Insert/Update. The schema you're targeting doesn't use any 2.104-only features, so there's zero runtime downside.

**Option B:** Use `@supabase/supabase-js@latest` AND install the Supabase CLI, run `supabase gen types typescript --project-id mjjxwiszqagpdmldkzwt > src/types/database.generated.ts` AFTER the schema is applied. This produces the exact type shape the library expects. Don't hand-write it.

**Do not** try option C ("hand-write types for 2.104"). I burned an hour and the types still resolved to `never` in insert calls. If you go Option B, delete my reference `database-types.reference.ts` and use the generated file.

---

## The build — Phase 1 (v0.1)

### Pages

1. **`/`** — Home dashboard. Recent sessions (last 5) from `v_session_summaries` view, plus three entry-point cards: "Upload session", "Manage athletes", "Phase 2 preview".
2. **`/athletes`** — List + inline add-athlete form. Required: `full_name`. Optional but recommended: DOB, sex, sport, level, position, position_group, team, body mass, height.
3. **`/athletes/[id]`** — Single athlete: six trend charts (Max V, F₀ rel, V₀, Pmax rel, 10m split, 40m split) across all their sessions, plus a sessions table.
4. **`/upload`** — The core flow. Athlete picker → xlsx dropzone → parse in browser → preview metrics → save to Supabase. On success, push to `/sessions/[id]`.
5. **`/sessions/[id]`** — Full session dashboard: five rank-banded headline cards (Max V / F₀ rel / V₀ / Pmax rel / 40m), headline verdict, F–v profile chart, splits vs elite reference bar chart, full metrics grid, per-step table.

### Components

- Simple `<Metric>` / `<RankCard>` / `<Row>` / `<Field>` / `<Select>` building blocks. No need for shadcn — it adds setup overhead that's not worth it for v0.1.
- Layout: top nav with PPA branding, `max-w-7xl` container.

### Styling

- Use Tailwind. PPA colours: accent red `#EF4444`, navy `#1F2937`, muted grey `#6B7280`, light bg `#F3F4F6`.
- Rank colours (for Poor→Elite bands): `#FCA5A5` / `#FDE68A` / `#FEF3C7` / `#BBF7D0` / `#86EFAC`.
- Fonts: Inter, system-ui fallback.
- Minimal. Generous whitespace. Tabular numbers for metric values.

---

## Data flow — the upload journey

When the coach drops an xlsx:

1. **Parse in the browser** (not server) using `reference/1080-parser.reference.ts` as the authoritative algorithm. This file already:
   - Finds the `Raw Data <date>` sheet
   - Extracts sprint samples from derived columns G (time s), H (speed m/s), I (distance m), M (force N), R (RF%)
   - Reads body mass from col L, mean load from col K
   - Fits `v(t) = Vmax × (1 − exp(−t/τ))` via grid + golden-section search on τ, **fitting the acceleration phase only (t ≤ timeToMaxV)** — matches the 1080 Excel Solver range; including the plateau/decel tail biases τ high and under-estimates F₀
   - Derives F₀ = Vmax/τ (per kg), V₀ = Vmax, Pmax = F₀ × V₀ / 4, slope, RFmax, DRF
   - Extracts splits at 10/20/30/40m with DNF guards
   - Pulls step mechanics from the "Step Table" sheet (column names: `Step Count`, `Step Velocity`, `Step Distance`, `Step Frequency` — with trailing whitespace tolerance)
   - Classifies sprint profile (Acceleration / Late Acceleration / Transition / Max V weak) and F-v balance (force deficit / balanced / velocity deficit per Jimenez-Reyes bands)

2. **Show a preview card** with the key metrics + warnings. Parser returns warnings like "Avg load > 10% BM — F-V profile not strictly Samozino".

3. **On Save**: insert in this order:
   1. `sessions` row (athlete_id, date, body_mass_kg, notes)
   2. `sprints` row (session_id, sprint_number=1, test_type, sensor_source='1080_sprint', load, distance_reached)
   3. `sprint_metrics` row (all derived metrics)
   4. `step_events` rows (one per step from 1080 step table — GCT and stiffness left null)
   5. Upload original xlsx to Storage bucket `raw-1080-files` under path `{athlete_id}/{session_id}/{filename}`, then insert `raw_files` pointer. Non-blocking — if Storage fails, don't abort.

4. Redirect to `/sessions/[id]`.

---

## Data model — already provisioned

Schema is at `reference/schema.sql`. **Run this FIRST** in Supabase SQL Editor before coding:

- Project: `https://supabase.com/dashboard/project/mjjxwiszqagpdmldkzwt`
- SQL Editor → New Query → paste full contents → Run
- Storage: create a private bucket named `raw-1080-files`

Schema highlights:
- 7 tables: `athletes`, `sessions`, `sprints`, `sprint_metrics`, `step_events`, `raw_files`, `norms`
- Enums for sport, level, position_group, test_type, sensor_source, foot_side, sex
- View `v_session_summaries` for the home page
- Seeded norms for: F₀ rel, V₀, Pmax rel, RFmax, DRF, 10m split, 40m split, Max V, step frequency, avg step length, GCT — keyed by sport × level × position × sex, with Poor/Fair/Good/Great/Elite bands
- RLS enabled with permissive policies for dev (anon + authenticated can read/write). **Tighten before multi-coach rollout** — add `owner_id` to athletes, write real policies.
- Seeded with rugby-specific norms from Morin & Samozino 2017, Cross et al. 2015, Nicholson et al. 2021, Till et al. 2014, Calderbank et al. 2021.

---

## Norms — how the rank pills work

Each metric card on the session page shows a Poor/Fair/Good/Great/Elite pill next to the value. Algorithm:

```typescript
function selectNorm(norms, metricName, athleteContext) {
  // Score each norm row: +8 for sport match, +4 for level, +2 for sex, +1 for position_group
  // Return highest-scoring row
}

function rankValue(value, norm) {
  if (!norm || value == null) return "n/a";
  if (norm.higher_is_better) {
    if (value < norm.poor_max) return "Poor";
    if (value < norm.fair_max) return "Fair";
    if (value < norm.good_max) return "Good";
    if (value < norm.great_max) return "Great";
    return "Elite";
  } else {
    // Lower-is-better (split times, GCT)
    if (value > norm.poor_max) return "Poor";
    // ... inverse ladder
    return "Elite";
  }
}
```

---

## Environment

```
NEXT_PUBLIC_SUPABASE_URL=https://mjjxwiszqagpdmldkzwt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Settings → API>
```

---

## Known gotchas (things I wasted time on so you don't have to)

1. **Supabase client typing** — see version pin note above. Go with Option A (2.45) unless you've got time for Option B.
2. **Step Table column names** — the 1080 uses `Step Count` / `Step Velocity` / `Step Distance ` (trailing space) / `Step Frequency`, NOT what you'd guess like `Step Number` / `Length (m)`. Parser handles this with whitespace-tolerant key lookup.
3. **Split times** — when the sprint doesn't reach the target distance, the 1080's own formulas return the last measured time (e.g. a 19m sprint shows 4.7s for the 40m split). The parser guards this by checking `MAX(dist) >= target` and returning `null` otherwise.
4. **F-V profile validity** — Samozino only works for essentially unresisted sprints. If `avg_load_kg > bodyMassKg * 0.10` (10% BM cutoff per standard Samozino practice), the parser sets `fvProfileValid = false` and adds a warning. Don't compute F-v balance classification when invalid. (Earlier 5% BM cutoff was too strict — 1080 minimum-tether sprints register ~5 kg avg load even though coaches call them "unresisted".)
5. **Mumbai region** — the Supabase project is in `ap-south-1`. Fine for solo dev, ~200 ms latency from NSW. If this rolls out to PPA clients, migrate to `ap-southeast-2` (Sydney).
6. **GCT is not extractable from 1080 raw data alone** — we tested. FFT on 1 kHz speed shows step events (dominant 4.3 Hz for Play's sprint), but separating foot-strike from toe-off within a step is unreliable (±20–30ms error, and it breaks entirely under load). Schema fields exist (`step_events.gct_ms`, `sprint_metrics.avg_gct_ms`) but stay null until a second sensor is wired in.

---

## Test data

`reference/sample_play.xlsx` and `reference/sample_kai.xlsx` are real 1080 exports. Use them to verify the parser works end-to-end.

Expected parse results (verified against the reference xlsx files with the accel-phase-only τ fit and 10% BM validity threshold):

**Play (minimum-tether, 94 kg athlete):**
- maxVms ≈ 10.609 m/s
- avgLoadKg ≈ 4.91 kg (minimum-tether in-sprint avg; not the ~1.15 kg resting tether tension)
- split_10m_s ≈ 2.066 s, split_40m_s ≈ 5.605 s
- f0_rel_nkg ≈ 6.0, v0_ms ≈ 10.609, pmax_rel_wkg ≈ 15.9
- total_steps ≈ 23, step_freq_hz ≈ 3.9
- fvProfileValid = true (4.91 kg < 10% of 94 kg)
- distance_reached ≈ 44.7 m → all four splits present

**Kai (heavy resisted, 94 kg athlete):**
- maxVms ≈ 6.36 m/s
- avgLoadKg ≈ 17.28 kg
- distance_reached ≈ 20.6 m → split_20m_s is present (4.59 s); split_30m_s and split_40m_s should be **null**
- fvProfileValid = false
- warnings include "Avg load > 10% BM" and "Sprint ended at 20.6 m — splits beyond that are null"

---

## Phase 2 (do not build yet — just leave hooks)

- **Auth** — Supabase Auth with email magic links. Tighten RLS with per-coach ownership.
- **Multi-load F-V profiler** — Take 5+ sprints at increasing loads in one session → linear regression → true Samozino profile. Single-sprint method overestimates F₀ under load. The schema already supports multiple sprints per session.
- **External sensor integration** — OptoGait/Playermaker/Output Sports CSV importers. Populates `gct_ms`, `flight_time_ms`, `stiffness_knm` on `step_events`. Add `sensor_source` filter to trend queries.
- **PDF export** — Client-facing session reports with PPA branding (`plummerperformance.com`). Use `@react-pdf/renderer`.
- **Athlete portal** — View-only login for athletes to see their own profile.
- **Coach comparisons** — Overlay multiple athletes on same chart.
- **Session context capture** — RPE-pre, Whoop recovery, HRV at upload time. Schema fields exist (`sessions.rpe_pre`, `sessions.whoop_recovery`, `sessions.hrv_ms`).

---

## Definition of done (v0.1)

- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] `npm run dev` runs locally and connects to Supabase
- [ ] Can create an athlete via `/athletes`
- [ ] Can upload `sample_play.xlsx` via `/upload`, preview shows correct metrics (maxV ≈ 10.6, f0_rel ≈ 6.0, fvProfileValid=true), save succeeds
- [ ] Can upload `sample_kai.xlsx` — shows DNF splits correctly (30m+40m null), fvProfileValid = false with 10% BM warning
- [ ] Session detail page shows rank pills matching the norms
- [ ] Athlete detail page shows trend charts (even with just 2 sessions)
- [ ] Home page `/` shows recent sessions from the view
- [ ] Deploys to Vercel clean

---

## Starting prompt for Claude Code

Paste this into Claude Code after opening the empty `1080-App` repo and dropping this whole `handoff/` folder into the repo root:

> Read `handoff/SPEC.md` in full. Then read the four reference files in `handoff/reference/`. Scaffold a Next.js 14 TypeScript app that implements Phase 1 of the spec. Use Supabase client v2.45.4 (see Option A in the spec). Run the schema in my Supabase project first (I've already confirmed the project ID). Test the parser against `handoff/reference/sample_play.xlsx` before wiring it into the upload page. When you hit the first TypeScript error, stop and summarise before going further. I'd rather fix things step by step than have you push through and leave landmines.
