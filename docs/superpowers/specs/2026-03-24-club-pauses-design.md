# Club Pauses — Design Spec

**Date:** 2026-03-24
**Status:** Approved

## Summary

Add support for per-club scheduled pauses (e.g. lunch breaks) in the tournament scheduler. Pauses are configured in an "Advanced settings" section and are completely optional — tournaments with no pauses behave exactly as today.

## Motivation

Different clubs travel to and from tournaments at different times and need different-length lunch breaks. A global timeline pause doesn't work; each club needs its own unavailability window.

## Data Model

### `settings.pauses` (new field)

Array of pause definitions added to the existing settings object. Each pause has a global start time that applies to all clubs.

```js
settings.pauses = [
  { id: "p1", startTime: "12:00", label: "Lunch" }
]
```

- `id` — unique string, generated on creation (e.g. `crypto.randomUUID()`)
- `startTime` — "HH:MM" string, same format as `settings.startTime`
- `label` — optional display name (e.g. "Lunch", "Morgonpaus")
- Defaults to `[]` — no pauses

### `club.pauseDurations` (new field)

Map of pause ID → duration in minutes, added to each club object.

```js
{ name: "Klubb A", teams: [...], pauseDurations: { "p1": 60 } }
```

- Missing key or value `0` = club has no break for that pause
- Defaults to `{}` — no durations set

### Persistence

No changes needed. `SetupForm` already deep-watches `clubs` and `settings` and persists both to `localStorage`. Pauses are included in the share URL automatically since `useShareUrl` serialises the full objects.

## UI — `SetupForm.vue`

### Advanced settings section

- Collapsible section at the bottom of the form, collapsed by default
- Toggle label: "Avancerade inställningar" with a chevron icon
- Contents: a list of pause entries + an "+ Lägg till paus" button

Each pause entry row:
```
[Label input (optional)]  [Start time input HH:MM]  [× remove button]
```

### Per-club pause durations

- When `settings.pauses` has at least one entry, each club card shows a small "Pauser" row beneath its teams list
- One duration field per pause: `{label || "Paus"}: [___] min`
- Input defaults to `0` (no break for this club)
- Hidden entirely when `settings.pauses` is empty

## Scheduler — `useScheduler.js`

### Precompute blocked intervals

Before the slot assignment loop, build a map of blocked time intervals per club:

```js
const clubBlocked = {}  // { clubName: [[startMin, endMin], ...] }

clubs.forEach(club => {
  clubBlocked[club.name] = (settings.pauses || [])
    .map(pause => {
      const duration = club.pauseDurations?.[pause.id] || 0
      if (!duration) return null
      const start = timeToMinutes(pause.startTime)
      return [start, start + duration]
    })
    .filter(Boolean)
})
```

### Assignment check

In the per-rink assignment loop, after the existing `busyThisSlot` and `minRest` checks, add:

```js
function isClubBlocked(clubName, slotStart, slotEnd) {
  return (clubBlocked[clubName] || []).some(
    ([bStart, bEnd]) => slotStart < bEnd && slotEnd > bStart
  )
}

if (isClubBlocked(home.clubName, slotStart, slotStart + settings.matchLength)) continue
if (isClubBlocked(away.clubName, slotStart, slotStart + settings.matchLength)) continue
```

Overlap check: a match overlaps a pause if `matchStart < pauseEnd && matchEnd > pauseStart`.

### Warnings

No new warnings needed. Teams that get fewer games than `minGames` due to a pause will already be caught by the existing warning system.

## PDF Export — `usePdfExport.js`

No changes required. Pauses are reflected implicitly in the schedule (clubs simply have no games during their pause window). If a pause label display is desired in the PDF in future, that can be added separately.

## Share URL — `useShareUrl.js`

No changes required. Pauses are included automatically since the full `clubs` and `settings` objects are serialised.

## Out of Scope

- Per-team (non-club-level) pauses
- Pause placement by duration only (no start time) — start time is always specified
- Displaying pause slots visually in `ScheduleGrid` (can be added later)
