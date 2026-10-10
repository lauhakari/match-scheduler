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
1. `SetupForm.vue` collects and validates input, saves local drafts and emits an independent snapshot to `App.vue`
2. `App.vue` calls `useScheduler().generate(settings, clubs)` and passes the resulting `schedule` reactive ref down to display components
3. `ScheduleGrid.vue` renders the time-slot table; `ScheduleStats.vue` shows per-team game counts and warnings

**Composables:**
- `useScheduler.js` — core scheduling algorithm. Builds a list of valid matchups, then greedily assigns them to time slots across rinks, prioritising teams with fewer games. Tracks `gamesPlayed` and `lastGameEnd` per team to enforce `minRest` and `maxGames` constraints.
- `usePdfExport.js` — uses jsPDF + jspdf-autotable to export the schedule as a PDF
- `useShareUrl.js` — reads validated legacy compressed `#s=` links.
- `useSavedSchedule.js` — saves/loads/version-updates through `/api/schedules`. Public URLs use `/s/:id`; secret edit tokens live in URL fragments and authorize mutations through headers.
- `src/lib/tournament.js` — shared validation, identity helpers, workload limits and snapshots.

`functions/api/schedules/[[path]].js` is the D1 API; migration SQL lives in `migrations/`. Never deploy the placeholder database ID or apply remote migrations without authorization. See README for local development/deployment.

**Team identity:** New clubs/teams have stable UUIDs. Legacy teams fall back to `"ClubName::TeamName"`. Club names and per-club team names are validated for uniqueness; `::` is reserved. Pause/color grouping still uses validated club names.

**Settings shape** (defined in `SetupForm.vue`):
```js
{
  startTime, endTime,   // "HH:MM" strings
  matchLength,          // minutes
  breakLength,          // minutes (added to matchLength = slot length)
  numRinks,
  minGames, maxGames,
  minRest,              // minimum minutes between a team's games
  allowInterClub,       // boolean — allow teams from same club to play each other
}
```

**Language:** The UI is in Swedish (e.g. "Spelschema", "Generera om", "Dela schema").
