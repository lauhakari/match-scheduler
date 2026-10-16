# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Production build
npm run preview   # Preview production build
npm test          # Unit, Vue component, PDF and SQLite API checks
npm run db:local   # Initialize local D1 only
npm run dev:pages  # Built app and local D1 on port 8788
```

Tests use Node's built-in runner. Vue components run in jsdom; API tests execute real SQLite SQL through a D1-compatible adapter. Use Node 24 LTS or newer.

## Architecture

This is a Vue 3 + Vite + Tailwind CSS 4 app. Generation/PDF logic runs client-side. Cloudflare Pages Functions store shared schedules in D1; no Laravel backend is used.

**Data flow:**
1. `SetupForm.vue` is the five-step planner (Turnering → Speldag → Lag → Matcher → Spelschema). It owns the draft, validation, local-storage persistence and the stepper, renders the step bodies (`StepTournament.vue`; `StepDay.vue`, which holds the day's times and embeds the pause rows from `StepBreaks.vue`; `StepTeams.vue`; `StepMatches.vue`) and the `PlanOverview.vue` checks panel ("Dagen går ihop": capacity numbers, per-rink day strip and `planChecks` with one-click fixes that patch the settings), and emits an independent snapshot to `App.vue` on submit. Steps 1–4 stay mounted (`v-show`) so inputs keep state and tests can reach them at any step; the step 5 slot hosts the schedule. Validation messages are routed to a step by keyword in `stepFor`.
2. `App.vue` calls `useScheduler().generate(settings, clubs)`, bumps `resultVersion` so the form jumps to step 5, and renders `ScheduleView.vue` (header, PDF menu, share card, club/team filter, Tidslinje/Per lag switch).
3. `ScheduleGrid.vue` renders the time-slot table with consecutive empty rounds collapsed; `TeamScheduleList.vue` lists each team's games; `ScheduleStats.vue` shows per-team game counts and warnings with a recovery hint, for the organiser only: shared links never show it, and the full-schedule PDF leaves the team summary out unless the organiser ticks it.

**Composables:**
- `useScheduler.js` — core scheduling algorithm. Builds a list of valid matchups, then greedily assigns them to time slots across rinks, prioritising pairs where both teams have few games, then other clubs before the own club. Tracks `gamesPlayed` and `lastGameEnd` per team to enforce `minRest` and `maxGames` constraints. The greedy pass runs several times (bounded by tournament size), alternating between the preferred policy and fallbacks without the cross-club preference or the pair ranking, and keeps the result with the fewest teams under `minGames`, then the most games, then the evenest counts, then the fewest internal games. Each pair meets at most once; the slot loop must stay in step with `dayTimeline.js`.
- `usePdfExport.js` — uses jsPDF + jspdf-autotable to export the schedule as a PDF
- `useShareUrl.js` — reads validated legacy compressed `#s=` links.
- `useSavedSchedule.js` — saves/loads/version-updates through `/api/schedules`. Public URLs use `/s/:id`; secret edit tokens live in URL fragments and authorize mutations through headers.
- `src/lib/tournament.js` — shared validation, identity helpers, workload limits, snapshots, `DEFAULT_SETTINGS`, `estimateCapacity` (rounds after play-stopping pauses; games per team capped by opponents, each team's rest and a joint bound where rounds closer together than match length plus rest share one appearance per team; estimated end; an upper bound, not a feasibility proof), `mealCapacityFloor` and `parseTeamList` (paste import, one club per line).
- `src/lib/dayTimeline.js` — pure mirror of the scheduler's slot loop: playable rounds and play-stopping pauses for a draft. Tests assert it matches `useScheduler` round for round.
- `src/lib/planChecks.js` — the checks panel's status, summary, Kontroller list with settings patches, and the day-strip cells. Fixes are offered only when the patched settings clear the check: later end time and shorter gap between matches (never below 2 minutes) are found by re-running `estimateCapacity`.
- `src/lib/clubColors.js` — club colour palette shared by the grid, team list, stats and filter chips.

`functions/api/schedules/[[path]].js` is the D1 API; migration SQL lives in `migrations/`. Never deploy the placeholder database ID or apply remote migrations without authorization. See README for local development/deployment.

**Team identity:** New clubs/teams have stable UUIDs. Legacy teams fall back to `"ClubName::TeamName"`. Club names and per-club team names are validated for uniqueness; `::` is reserved. Pause/color grouping still uses validated club names.

**Settings shape** (`DEFAULT_SETTINGS` in `src/lib/tournament.js`):
```js
{
  name, date, venue,    // optional strings; date is "YYYY-MM-DD" or ""
  rinkLabel,            // 'Rink' | 'Plan' | 'Bana' — what the UI and PDFs call a playing surface
  rinkNames,            // optional string[] (≤10, ≤40 chars); blank entries fall back to "<rinkLabel> N"
  startTime, endTime,   // "HH:MM" strings
  matchLength,          // minutes
  breakLength,          // minutes (added to matchLength = slot length)
  numRinks,
  minGames, maxGames,
  minRest,              // minimum minutes between a team's games
  allowInterClub,       // boolean — allow teams from same club to play each other
}
```

All new settings fields are optional so old saves, drafts and `#s=` links keep loading.

**Language:** The UI is in Swedish and written for non-technical organisers (e.g. "Skapa spelschema", "Generera om", "Spara & dela"). Avoid jargon like "slot", "fönster" or abbreviations in labels.
