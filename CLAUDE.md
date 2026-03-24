# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Production build
npm run preview   # Preview production build
```

No test runner is configured.

## Architecture

This is a Vue 3 + Vite + Tailwind CSS 4 single-page app for generating tournament game schedules. All logic runs client-side — no backend.

**Data flow:**
1. `SetupForm.vue` collects clubs/teams and tournament settings, persists them to `localStorage`, and emits a `generate` event to `App.vue`
2. `App.vue` calls `useScheduler().generate(settings, clubs)` and passes the resulting `schedule` reactive ref down to display components
3. `ScheduleGrid.vue` renders the time-slot table; `ScheduleStats.vue` shows per-team game counts and warnings

**Composables:**
- `useScheduler.js` — core scheduling algorithm. Builds a list of valid matchups, then greedily assigns them to time slots across rinks, prioritising teams with fewer games. Tracks `gamesPlayed` and `lastGameEnd` per team to enforce `minRest` and `maxGames` constraints.
- `usePdfExport.js` — uses jsPDF + jspdf-autotable to export the schedule as a PDF
- `useShareUrl.js` — serialises `{ clubs, settings, schedule }` with lz-string, stores it in the URL hash (`#s=…`), and copies the URL to clipboard. On mount, `App.vue` checks for this hash to render a read-only shared view.

**Team identity:** Teams are identified by the composite string `"ClubName::TeamName"`. Two teams from different clubs can share the same team name without collision.

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
