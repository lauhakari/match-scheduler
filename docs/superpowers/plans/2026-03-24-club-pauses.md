# Club Pauses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-club scheduled pause windows (e.g. lunch breaks) that the scheduler respects when assigning games.

**Architecture:** Pauses are stored as an array on `settings` (global start time + label) with per-club durations on each club object. The scheduler precomputes blocked intervals per club and skips matches that overlap them. The UI adds a collapsible "Advanced settings" section in `SetupForm.vue` with pause management and per-club duration fields.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Tailwind CSS v4, Vite. No test runner — verify manually via the dev server (`npm run dev`).

---

## File Map

| File | Change |
|------|--------|
| `src/composables/useScheduler.js` | Add pause-blocking logic |
| `src/components/SetupForm.vue` | Add advanced settings section + per-club pause duration fields |

No other files need changes.

---

### Task 1: Add pause-blocking to the scheduler

**Files:**
- Modify: `src/composables/useScheduler.js`

- [ ] **Step 1: Open the file and locate the slot assignment loop**

  Read `src/composables/useScheduler.js`. The loop starts at line ~96 (`for (const slotStart of timeSlots)`). The per-rink inner loop checks `busyThisSlot`, `maxGames`, and `minRest` before assigning a match.

- [ ] **Step 2: Add `isClubBlocked` helper and precomputed intervals**

  Add this block just before the `usedMatchups` declaration (around line 93):

  ```js
  // Precompute blocked intervals per club: { clubName: [[startMin, endMin], ...] }
  const clubBlocked = {}
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

  function isClubBlocked(clubName, slotStart, slotEnd) {
    return (clubBlocked[clubName] || []).some(
      ([bStart, bEnd]) => slotStart < bEnd && slotEnd > bStart
    )
  }
  ```

- [ ] **Step 3: Add the pause check inside the assignment loop**

  In the inner `for (const [home, away] of shuffled)` loop, after the `minRest` check (around line 126), add:

  ```js
  // Skip if either club is on a pause during this slot
  const slotEnd = slotStart + settings.matchLength
  if (isClubBlocked(home.clubName, slotStart, slotEnd)) continue
  if (isClubBlocked(away.clubName, slotStart, slotEnd)) continue
  ```

- [ ] **Step 4: Manual verification**

  Run `npm run dev`. In the form, temporarily hardcode a club's pause by adding `pauseDurations: { "test": 60 }` and a matching pause in settings (via browser console or temporarily in the component). Generate a schedule and confirm no games appear for that club during the blocked window.

- [ ] **Step 5: Commit**

  ```bash
  git add src/composables/useScheduler.js
  git commit -m "feat: respect per-club pause windows in scheduler"
  ```

---

### Task 2: Add "Advanced settings" section to SetupForm — pause management

**Files:**
- Modify: `src/components/SetupForm.vue`

- [ ] **Step 1: Add `pauses` to the settings ref and `showAdvanced` toggle**

  In the `settings` ref (around line 13), add:
  ```js
  pauses: [],
  ```

  Below the `settings` ref declaration, add:
  ```js
  const showAdvanced = ref(false)
  ```

- [ ] **Step 2: Add `addPause` and `removePause` functions**

  After the existing `removeTeam` function, add:

  ```js
  function addPause() {
    settings.value.pauses.push({
      id: crypto.randomUUID(),
      startTime: '12:00',
      label: '',
    })
  }

  function removePause(index) {
    const pause = settings.value.pauses[index]
    // Clean up per-club durations for this pause
    clubs.value.forEach(club => {
      if (club.pauseDurations) {
        delete club.pauseDurations[pause.id]
      }
    })
    settings.value.pauses.splice(index, 1)
  }
  ```

- [ ] **Step 3: Add the advanced settings toggle and pause list to the template**

  At the bottom of the `<template>` form, before the submit/generate button, add:

  ```html
  <!-- Advanced settings -->
  <div class="mt-6 border-t border-slate-800/60 pt-4">
    <button
      type="button"
      @click="showAdvanced = !showAdvanced"
      class="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
    >
      <span :class="showAdvanced ? 'rotate-90' : ''" class="inline-block transition-transform">›</span>
      Avancerade inställningar
    </button>

    <div v-if="showAdvanced" class="mt-4 space-y-3">
      <div class="text-xs font-medium uppercase tracking-widest text-slate-600 mb-2">Pauser</div>

      <div
        v-for="(pause, index) in settings.pauses"
        :key="pause.id"
        class="flex items-center gap-3"
      >
        <input
          v-model="pause.label"
          type="text"
          placeholder="Namn (t.ex. Lunch)"
          class="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
        />
        <input
          v-model="pause.startTime"
          type="time"
          class="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
        />
        <button
          type="button"
          @click="removePause(index)"
          class="text-slate-600 hover:text-red-400 transition-colors cursor-pointer px-1"
        >×</button>
      </div>

      <button
        type="button"
        @click="addPause"
        class="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
      >
        + Lägg till paus
      </button>
    </div>
  </div>
  ```

- [ ] **Step 4: Manual verification**

  Run `npm run dev`. Open advanced settings, add a pause, confirm it appears with label + time inputs and can be removed. Check `localStorage` in devtools to confirm pauses persist.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/SetupForm.vue
  git commit -m "feat: add advanced settings section with pause management"
  ```

---

### Task 3: Add per-club pause duration fields to club cards

**Files:**
- Modify: `src/components/SetupForm.vue`

- [ ] **Step 1: Add `getPauseDuration` and `setPauseDuration` helpers**

  Add after `removePause`:

  ```js
  function getPauseDuration(club, pauseId) {
    return club.pauseDurations?.[pauseId] || 0
  }

  function setPauseDuration(club, pauseId, value) {
    if (!club.pauseDurations) club.pauseDurations = {}
    const num = parseInt(value, 10)
    if (num > 0) {
      club.pauseDurations[pauseId] = num
    } else {
      delete club.pauseDurations[pauseId]
    }
  }
  ```

- [ ] **Step 2: Add duration fields to each club card**

  In the club card template, after the teams list and before the "Lägg till lag" button, add:

  ```html
  <!-- Pause durations (shown only when pauses exist) -->
  <div v-if="settings.pauses.length > 0" class="mt-3 pt-3 border-t border-slate-700/50">
    <div class="text-xs text-slate-600 uppercase tracking-widest mb-2">Pauser</div>
    <div
      v-for="pause in settings.pauses"
      :key="pause.id"
      class="flex items-center gap-3 mb-2"
    >
      <span class="text-xs text-slate-400 flex-1">{{ pause.label || pause.startTime }}</span>
      <input
        :value="getPauseDuration(club, pause.id)"
        @input="setPauseDuration(club, pause.id, $event.target.value)"
        type="number"
        min="0"
        placeholder="0"
        class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
      />
      <span class="text-xs text-slate-600">min</span>
    </div>
  </div>
  ```

- [ ] **Step 3: Manual verification**

  Run `npm run dev`. Add a pause in advanced settings. Confirm each club card now shows the pause with a duration input. Set different durations per club. Generate a schedule and confirm no games appear for a club during its pause window (cross-check times in the grid).

- [ ] **Step 4: Verify share URL round-trips pauses correctly**

  Generate a schedule with pauses configured. Click "Dela schema". Open the copied URL in a new tab. Confirm the schedule renders correctly with no games during pause windows.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/SetupForm.vue
  git commit -m "feat: add per-club pause duration fields to club cards"
  ```
