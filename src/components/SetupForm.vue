<script setup>
import { ref, watch } from 'vue'
import { normalizeClubs, snapshotTournament, validateTournament } from '../lib/tournament.js'

const emit = defineEmits(['generate'])
const props = defineProps({ initialData: { type: Object, default: null }, busy: Boolean })
const validationErrors = ref([])
const storageNotice = ref('')

const STORAGE_KEY = 'game-scheduler-state'

const clubs = ref(normalizeClubs([
  { name: 'Klubb A', teams: [{ name: 'Lag 1' }, { name: 'Lag 2' }] },
  { name: 'Klubb B', teams: [{ name: 'Lag 1' }, { name: 'Lag 2' }] },
]))

const settings = ref({
  startTime: '09:00',
  endTime: '17:00',
  matchLength: 15,
  breakLength: 5,
  numRinks: 1,
  minGames: 2,
  maxGames: 5,
  minRest: 20,
  allowInterClub: false,
  pauses: [],
  foodBreaks: [],
})

const showAdvanced = ref(false)

function applyInitialData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Ogiltigt utkast')
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('Ogiltiga inställningar')
  const candidateClubs = normalizeClubs(data.clubs)
  const candidateSettings = { ...settings.value, ...data.settings }
  const errors = validateTournament(candidateSettings, candidateClubs)
  if (errors.length) throw new Error(errors.join(' '))
  const snapshot = snapshotTournament(candidateSettings, candidateClubs)
  clubs.value = snapshot.clubs
  settings.value = snapshot.settings
}

try {
  if (props.initialData) {
    applyInitialData({ clubs: props.initialData.c, settings: props.initialData.s })
  } else {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) applyInitialData(JSON.parse(saved))
  }
} catch {
  storageNotice.value = 'Det sparade utkastet kunde inte läsas. Standardinställningarna används.'
}

// Persist on change
watch([clubs, settings], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      clubs: clubs.value,
      settings: settings.value,
    }))
  } catch {
    storageNotice.value = 'Utkastet kunde inte sparas i webbläsaren.'
  }
}, { deep: true })

function addClub() {
  let number = 0
  while (clubs.value.some(club => club.name === `Klubb ${String.fromCharCode(65 + number)}`)) number++
  const letter = String.fromCharCode(65 + number)
  clubs.value.push(...normalizeClubs([{ name: `Klubb ${letter}`, teams: [{ name: 'Lag 1' }] }]))
}

function moveClub(index, direction) {
  const destination = index + direction
  if (destination < 0 || destination >= clubs.value.length) return
  const club = clubs.value.splice(index, 1)[0]
  clubs.value.splice(destination, 0, club)
}

function removeClub(index) {
  clubs.value.splice(index, 1)
}

const dragClubIndex = ref(null)

function onClubDragStart(index) {
  dragClubIndex.value = index
}

function onClubDragOver(e, index) {
  e.preventDefault()
  if (dragClubIndex.value === null || dragClubIndex.value === index) return
  const dragged = clubs.value.splice(dragClubIndex.value, 1)[0]
  clubs.value.splice(index, 0, dragged)
  dragClubIndex.value = index
}

function onClubDragEnd() {
  dragClubIndex.value = null
}

function addTeam(clubIndex) {
  const club = clubs.value[clubIndex]
  let number = 1
  while (club.teams.some(team => team.name === `Lag ${number}`)) number++
  club.teams.push({ id: crypto.randomUUID(), name: `Lag ${number}` })
}

function removeTeam(clubIndex, teamIndex) {
  clubs.value[clubIndex].teams.splice(teamIndex, 1)
}

function addPause() {
  settings.value.pauses.push({
    id: crypto.randomUUID(),
    startTime: '12:00',
    label: '',
    defaultDuration: 60,
    windowDuration: 0,
    recurring: false,
    recurringMode: 'slots',  // 'slots' or 'time'
    intervalSlots: 5,
    intervalMinutes: 120,
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

function addFoodBreak() {
  settings.value.foodBreaks.push({
    id: crypto.randomUUID(),
    startTime: '11:30',
    label: 'Lunch',
    duration: 50,
    maxTeamsPerSlot: 6,
  })
}

function removeFoodBreak(index) {
  settings.value.foodBreaks.splice(index, 1)
}

function getPauseDuration(club, pauseId) {
  if (club.pauseDurations && pauseId in club.pauseDurations) {
    return club.pauseDurations[pauseId]
  }
  return '' // empty = will use pause default
}

function setPauseDuration(club, pauseId, value) {
  if (!club.pauseDurations) club.pauseDurations = {}
  const str = String(value).trim()
  if (str === '') {
    delete club.pauseDurations[pauseId] // revert to default
  } else {
    club.pauseDurations[pauseId] = Number(str)
  }
}

function handleGenerate() {
  if (props.busy) return
  validationErrors.value = validateTournament(settings.value, clubs.value)
  if (validationErrors.value.length) return
  emit('generate', snapshotTournament(settings.value, clubs.value))
}

const totalTeams = () => clubs.value.reduce((sum, c) => sum + c.teams.length, 0)

const CLUB_COLORS = ['#3159e8', '#227d72', '#b9792d', '#975273', '#745ea3', '#397e99']
</script>

<template>
  <form class="setup-form" @submit.prevent="handleGenerate" novalidate>
    <p class="setup-guidance">Börja med lagen och anpassa sedan matchdagen. Ditt utkast sparas automatiskt i den här webbläsaren.</p>
    <p v-if="storageNotice" role="status" class="storage-notice">{{ storageNotice }}</p>
    <div class="setup-columns">
    <section class="panel clubs-panel" aria-labelledby="clubs-heading">
      <div class="step-heading">
        <span class="step-number" aria-hidden="true">01</span>
        <div class="step-title"><h2 id="clubs-heading" class="section-heading">Klubbar &amp; lag</h2><p>Vilka är med på matchdagen?</p></div>
        <span class="team-count">{{ totalTeams() }} lag · {{ clubs.length }} klubbar</span>
      </div>
      <div class="club-list">
        <div
          v-for="(club, ci) in clubs"
          :key="club.id"
          draggable="true"
          @dragstart="onClubDragStart(ci)"
          @dragover="onClubDragOver($event, ci)"
          @dragend="onClubDragEnd"
          class="club-card"
          :class="{ 'is-dragging': dragClubIndex === ci }"
          :style="{ '--club-color': CLUB_COLORS[ci % CLUB_COLORS.length] }"
        >
          <div class="club-card-heading">
            <label :for="`club-name-${ci}`" class="sr-only">Klubbnamn</label>
            <input
              :id="`club-name-${ci}`"
              :name="`club-name-${ci}`"
              v-model="club.name"
              type="text"
              autocomplete="organization"
              class="club-name"
              placeholder="Klubbnamn"
            />
            <label
              :for="`club-cluster-${ci}`"
              class="cluster-control"
              title="Samla lagets matcher närmare i tid (för lag som reser långt)"
            >
              <input
                :id="`club-cluster-${ci}`"
                :name="`club-cluster-${ci}`"
                v-model="club.cluster"
                type="checkbox"
                class="w-3.5 h-3.5"
              />
              <span class="cluster-label">Samla</span>
            </label>
            <button
              v-if="clubs.length > 1"
              type="button"
              @click="removeClub(ci)"
              :aria-label="`Ta bort ${club.name || 'klubb'}`"
              class="transition-colors text-lg leading-none cursor-pointer"
            >&times;</button>
          </div>

          <div class="club-order">
            <button type="button" :disabled="ci === 0" @click="moveClub(ci, -1)" :aria-label="`Flytta ${club.name} uppåt`" class="reorder-button">↑ Flytta upp</button>
            <button type="button" :disabled="ci === clubs.length - 1" @click="moveClub(ci, 1)" :aria-label="`Flytta ${club.name} nedåt`" class="reorder-button">↓ Flytta ned</button>
          </div>
          <fieldset>
            <legend class="sr-only">Lag i {{ club.name || `Klubb ${ci + 1}` }}</legend>
            <div class="space-y-2 mb-3">
              <div
                v-for="(team, ti) in club.teams"
                :key="team.id"
                class="team-row"
              >
                <span class="team-number" aria-hidden="true">{{ ti + 1 }}</span>
                <label :for="`team-name-${ci}-${ti}`" class="sr-only">Lagnamn {{ ti + 1 }}</label>
                <input
                  :id="`team-name-${ci}-${ti}`"
                  :name="`team-name-${ci}-${ti}`"
                  v-model="team.name"
                  type="text"
                  class="min-w-0 flex-1 border rounded-md px-3 py-1.5 text-sm transition-all"
                  placeholder="Lagnamn"
                />
                <button
                  v-if="club.teams.length > 1"
                  type="button"
                  @click="removeTeam(ci, ti)"
                  :aria-label="`Ta bort ${team.name || `lag ${ti + 1}`}`"
                  class="transition-colors text-sm cursor-pointer"
                >&times;</button>
              </div>
            </div>
          </fieldset>

          <!-- Pause durations (shown only when pauses exist) -->
          <div v-if="settings.pauses.some(p => !p.recurring)" class="club-pauses">
            <p class="text-xs mb-2">Pauser</p>
            <div
              v-for="pause in settings.pauses.filter(p => !p.recurring)"
              :key="pause.id"
              class="flex items-center gap-3 mb-2"
            >
              <label
                :for="`pause-duration-${ci}-${pause.id}`"
                class="text-xs flex-1"
              >{{ pause.label || pause.startTime }}</label>
              <input
                :id="`pause-duration-${ci}-${pause.id}`"
                :name="`pause-duration-${ci}-${pause.id}`"
                :value="getPauseDuration(club, pause.id)"
                @input="setPauseDuration(club, pause.id, $event.target.value)"
                type="number"
                min="0"
                :placeholder="pause.defaultDuration ?? 60"
                :aria-label="`Pauslängd för ${club.name || `klubb ${ci + 1}`} — ${pause.label || pause.startTime}`"
                :title="`Lämna tomt för att använda standard (${pause.defaultDuration ?? 60} min). Sätt till 0 för ingen paus.`"
                class="w-20 shrink-0 border rounded-lg px-3 py-1.5 text-sm"
              />
              <span class="text-xs" aria-hidden="true">min</span>
            </div>
          </div>

          <button
            type="button"
            @click="addTeam(ci)"
            class="add-team"
          >+ Lägg till lag</button>
        </div>
      </div>
      <button type="button" @click="addClub" class="add-club">+ Lägg till klubb</button>
      <p class="capacity-note">Upp till 20 klubbar och 80 lag. Dra korten eller använd pilarna för att ändra ordning.</p>
    </section>

    <section class="panel settings-panel" aria-labelledby="settings-heading">
      <div class="step-heading">
        <span class="step-number" aria-hidden="true">02</span>
        <div class="step-title"><h2 id="settings-heading" class="section-heading">Matchdagen</h2><p>Tider, spelplaner och återhämtning.</p></div>
      </div>
      <div class="settings-body">
        <div class="settings-fields">
          <!-- Time range -->
          <div>
            <label for="start-time" class="block text-xs font-medium mb-1.5">Starttid</label>
            <input
              id="start-time"
              name="start-time"
              v-model="settings.startTime"
              type="time"
              class="w-full border rounded-lg px-3 py-2 text-sm transition-all"
            />
          </div>
          <div>
            <label for="end-time" class="block text-xs font-medium mb-1.5">Sluttid</label>
            <input
              id="end-time"
              name="end-time"
              v-model="settings.endTime"
              type="time"
              class="w-full border rounded-lg px-3 py-2 text-sm transition-all"
            />
          </div>
          <div>
            <label for="match-length" class="block text-xs font-medium mb-1.5">Matchlängd</label>
            <div class="relative">
              <input
                id="match-length"
                name="match-length"
                v-model.number="settings.matchLength"
                type="number"
                min="5"
                max="120"
                class="w-full border rounded-lg px-3 py-2 pr-12 text-sm transition-all"
              />
              <span class="absolute right-3 top-1/2 text-xs" aria-hidden="true">min</span>
            </div>
          </div>
          <div>
            <label
              for="break-length"
              class="block text-xs font-medium mb-1.5"
              title="Tid mellan varje matchslot på rinken — t.ex. för isrengöring eller uppvärmning"
            >Paus per match</label>
            <div class="relative">
              <input
                id="break-length"
                name="break-length"
                v-model.number="settings.breakLength"
                type="number"
                min="0"
                max="60"
                class="w-full border rounded-lg px-3 py-2 pr-12 text-sm transition-all"
              />
              <span class="absolute right-3 top-1/2 text-xs" aria-hidden="true">min</span>
            </div>
          </div>

          <!-- Rinks & games -->
          <div>
            <label for="num-rinks" class="block text-xs font-medium mb-1.5">Antal rinkar</label>
            <input
              id="num-rinks"
              name="num-rinks"
              v-model.number="settings.numRinks"
              type="number"
              min="1"
              max="10"
              class="w-full border rounded-lg px-3 py-2 text-sm transition-all"
            />
          </div>
          <div>
            <label for="min-games" class="block text-xs font-medium mb-1.5">Min matcher / lag</label>
            <input
              id="min-games"
              name="min-games"
              v-model.number="settings.minGames"
              type="number"
              min="1"
              max="20"
              class="w-full border rounded-lg px-3 py-2 text-sm transition-all"
            />
          </div>
          <div>
            <label for="max-games" class="block text-xs font-medium mb-1.5">Max matcher / lag</label>
            <input
              id="max-games"
              name="max-games"
              v-model.number="settings.maxGames"
              type="number"
              min="1"
              max="20"
              class="w-full border rounded-lg px-3 py-2 text-sm transition-all"
            />
          </div>
          <div>
            <label
              for="min-rest"
              class="block text-xs font-medium mb-1.5"
              title="Minsta tid ett lag måste vänta mellan sina egna matcher"
            >Vila per lag</label>
            <div class="relative">
              <input
                id="min-rest"
                name="min-rest"
                v-model.number="settings.minRest"
                type="number"
                min="0"
                max="120"
                class="w-full border rounded-lg px-3 py-2 pr-12 text-sm transition-all"
              />
              <span class="absolute right-3 top-1/2 text-xs" aria-hidden="true">min</span>
            </div>
          </div>
        </div>

        <!-- Inter-club toggle -->
        <div class="mt-5 pt-5">
          <div class="flex flex-wrap items-center gap-3">
            <input id="allow-inter-club" name="allow-inter-club" v-model="settings.allowInterClub" type="checkbox" />
            <label for="allow-inter-club" class="text-sm transition-colors cursor-pointer">
              Tillåt internmatcher
            </label>
            <span class="text-xs">(lag från samma klubb kan möta varandra)</span>
          </div>
        </div>
      </div>
    </section>

    </div>

    <section class="panel breaks-panel" aria-labelledby="breaks-heading">
      <div class="step-heading">
        <span class="step-number" aria-hidden="true">03</span>
        <div class="step-title"><h2 id="breaks-heading" class="section-heading">Pauser &amp; mat</h2><p>Ge plats för allt som händer mellan matcherna.</p></div>
        <span class="optional-badge">Valfritt</span>
      </div>
      <div class="break-columns">
    <div class="pause-settings">
      <button
        type="button"
        :aria-expanded="showAdvanced"
        aria-controls="advanced-settings-panel"
        @click="showAdvanced = !showAdvanced"
        class="advanced-toggle"
      >
        <span :class="showAdvanced ? 'rotate-90' : ''" class="inline-block transition-transform" aria-hidden="true">›</span>
        Avancerade inställningar
      </button>

      <div
        v-if="showAdvanced"
        id="advanced-settings-panel"
        class="mt-4 space-y-3"
      >
        <p class="text-xs font-medium">Pauser</p>
        <p class="text-xs">Fönster sprider klubbarnas pauser. Standard anger pauslängd; varje klubb kan välja en egen längd.</p>

        <div
          v-for="(pause, index) in settings.pauses"
          :key="pause.id"
          class="break-row"
          role="group"
          :aria-label="`Paus ${index + 1}`"
        >
          <div class="break-name">
            <label :for="`pause-label-${pause.id}`" class="block text-xs mb-1">Pausnamn</label>
            <input
              :id="`pause-label-${pause.id}`"
              :name="`pause-label-${pause.id}`"
              v-model="pause.label"
              type="text"
              placeholder="Namn (t.ex. Lunch)"
              class="w-full min-w-0 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div class="min-w-0">
            <label :for="`pause-start-${pause.id}`" class="block text-xs mb-1">Starttid</label>
            <input
              :id="`pause-start-${pause.id}`"
              :name="`pause-start-${pause.id}`"
              v-model="pause.startTime"
              type="time"
              class="w-full min-w-0 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div class="relative min-w-0" title="Fönster inom vilket klubbarnas pauser sprids ut (0 = alla börjar samtidigt)">
            <label :for="`pause-window-${pause.id}`" class="block text-xs mb-1">Fönsterlängd i minuter</label>
            <input
              :id="`pause-window-${pause.id}`"
              :name="`pause-window-${pause.id}`"
              v-model.number="pause.windowDuration"
              type="number"
              min="0"
              placeholder="0"
              class="w-full min-w-0 border rounded-lg px-3 py-2 pr-8 text-sm"
            />
            <span class="input-unit" aria-hidden="true">fön</span>
          </div>
          <div class="relative min-w-0" title="Standard pauslängd för klubbar utan eget värde">
            <label :for="`pause-default-${pause.id}`" class="block text-xs mb-1">Standard pauslängd i minuter</label>
            <input
              :id="`pause-default-${pause.id}`"
              :name="`pause-default-${pause.id}`"
              v-model.number="pause.defaultDuration"
              type="number"
              min="0"
              placeholder="60"
              class="w-full min-w-0 border rounded-lg px-3 py-2 pr-8 text-sm"
            />
            <span class="input-unit" aria-hidden="true">min</span>
          </div>
          <label
            :for="`pause-recurring-${pause.id}`"
            class="flex items-center gap-1.5 cursor-pointer group"
            title="Återkommande paus med jämna intervall"
          >
            <input
              :id="`pause-recurring-${pause.id}`"
              :name="`pause-recurring-${pause.id}`"
              v-model="pause.recurring"
              type="checkbox"
              class="w-3.5 h-3.5"
            />
            <span class="text-xs transition-colors">Åter.</span>
          </label>
          <template v-if="pause.recurring">
            <label :for="`pause-mode-${pause.id}`" class="sr-only">Typ av återkommande paus</label>
            <select
              :id="`pause-mode-${pause.id}`"
              :name="`pause-mode-${pause.id}`"
              v-model="pause.recurringMode"
              class="border rounded-lg px-2 py-2 text-xs"
              title="Återkommande efter tid eller antal omgångar"
            >
              <option value="slots">Var X omg.</option>
              <option value="time">Var X min</option>
            </select>
            <div v-if="pause.recurringMode === 'slots'" class="relative min-w-0" title="Antal omgångar mellan varje paus">
              <label :for="`pause-interval-slots-${pause.id}`" class="block text-xs mb-1">Pausintervall i omgångar</label>
              <input
                :id="`pause-interval-slots-${pause.id}`"
                :name="`pause-interval-slots-${pause.id}`"
                v-model.number="pause.intervalSlots"
                type="number"
                min="1"
                placeholder="5"
                class="w-full min-w-0 border rounded-lg px-3 py-2 pr-8 text-sm"
              />
              <span class="input-unit" aria-hidden="true">omg</span>
            </div>
            <div v-else class="relative min-w-0" title="Intervall mellan varje paus (minuter)">
              <label :for="`pause-interval-${pause.id}`" class="block text-xs mb-1">Pausintervall i minuter</label>
              <input
                :id="`pause-interval-${pause.id}`"
                :name="`pause-interval-${pause.id}`"
                v-model.number="pause.intervalMinutes"
                type="number"
                min="1"
                placeholder="120"
                class="w-full min-w-0 border rounded-lg px-3 py-2 pr-8 text-sm"
              />
              <span class="input-unit" aria-hidden="true">int</span>
            </div>
          </template>
          <button
            type="button"
            @click="removePause(index)"
            :aria-label="`Ta bort paus ${pause.label || index + 1}`"
            class="transition-colors cursor-pointer px-1"
          >&times;</button>
        </div>

        <button
          type="button"
          @click="addPause"
          class="text-xs transition-colors cursor-pointer"
        >
          + Lägg till paus
        </button>
      </div>
    </div>

    <!-- Matpauser (food breaks) -->
    <div class="meal-settings">
      <h3 class="block text-sm font-medium mb-3">Matpauser</h3>
      <p class="text-xs mb-3">Matpassen fördelas inom turneringens tider. Varje pass har ett högsta antal lag.</p>
      <div class="space-y-2">
        <div
          v-for="(fb, index) in settings.foodBreaks"
          :key="fb.id"
          class="break-row"
          role="group"
          :aria-label="`Matpaus ${index + 1}`"
        >
          <div class="break-name">
            <label :for="`fb-label-${fb.id}`" class="block text-xs mb-1">Matpausnamn</label>
            <input
              :id="`fb-label-${fb.id}`"
              :name="`fb-label-${fb.id}`"
              v-model="fb.label"
              type="text"
              placeholder="Lunch"
              class="w-full min-w-0 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div class="min-w-0">
            <label :for="`fb-start-${fb.id}`" class="block text-xs mb-1">Starttid</label>
            <input
              :id="`fb-start-${fb.id}`"
              :name="`fb-start-${fb.id}`"
              v-model="fb.startTime"
              type="time"
              class="w-full min-w-0 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div class="relative min-w-0" title="Längd per matpass (minuter)">
            <label :for="`fb-duration-${fb.id}`" class="block text-xs mb-1">Längd i minuter</label>
            <input
              :id="`fb-duration-${fb.id}`"
              :name="`fb-duration-${fb.id}`"
              v-model.number="fb.duration"
              type="number"
              min="1"
              placeholder="50"
              class="w-full min-w-0 border rounded-lg px-3 py-2 pr-8 text-sm"
            />
            <span class="input-unit" aria-hidden="true">min</span>
          </div>
          <div class="relative min-w-0" title="Max antal lag per matpass">
            <label :for="`fb-max-${fb.id}`" class="block text-xs mb-1">Max lag per pass</label>
            <input
              :id="`fb-max-${fb.id}`"
              :name="`fb-max-${fb.id}`"
              v-model.number="fb.maxTeamsPerSlot"
              type="number"
              min="1"
              placeholder="6"
              class="w-full min-w-0 border rounded-lg px-3 py-2 pr-8 text-sm"
            />
            <span class="input-unit" aria-hidden="true">lag</span>
          </div>
          <button
            type="button"
            @click="removeFoodBreak(index)"
            :aria-label="`Ta bort matpaus ${fb.label || index + 1}`"
            class="transition-colors cursor-pointer px-1"
          >&times;</button>
        </div>

        <button
          type="button"
          @click="addFoodBreak"
          class="text-xs transition-colors cursor-pointer"
        >
          + Lägg till matpaus
        </button>
      </div>
    </div>

    </div>
    </section>

    <div aria-live="polite" aria-atomic="true">
      <div v-if="validationErrors.length" class="validation-errors">
        <p class="font-semibold mb-2">Kontrollera inställningarna innan du genererar:</p>
        <ul class="list-disc pl-5 space-y-1"><li v-for="error in validationErrors" :key="error">{{ error }}</li></ul>
      </div>
    </div>
    <div class="generate-strip">
      <div><strong>Redo för första nedsläpp?</strong><p>Generera, kontrollera och dela matchdagen med lagen.</p></div>
      <button type="submit" :disabled="props.busy || totalTeams() < 2" :aria-disabled="props.busy || totalTeams() < 2" class="button button-primary generate-button">
        Generera Spelschema <span aria-hidden="true">→</span>
      </button>
    </div>
    <p class="generation-note">Kontrollera schemats varningar före publicering. Alla önskemål kan inte alltid uppfyllas.</p>
  </form>
</template>

<style scoped>
.setup-form { display: grid; gap: 24px; }
.setup-guidance { color: var(--muted); font-size: 14px; line-height: 1.6; }
.setup-columns { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); gap: 24px; align-items: start; }
.clubs-panel, .settings-panel, .breaks-panel { padding: 26px; min-width: 0; }
.step-heading { display: flex; align-items: center; gap: 13px; margin-bottom: 24px; flex-wrap: wrap; }
.step-number { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border: 1px solid var(--line); border-radius: 10px; font-size: 12px; font-weight: 700; color: var(--blue); background: var(--paper); }
.step-title { flex: 1; min-width: 0; }
.step-title p { color: var(--muted); font-size: 12px; margin-top: 4px; line-height: 1.5; }
.team-count, .optional-badge { font-size: 11px; font-weight: 600; color: var(--teal); background: #edf5f2; padding: 6px 9px; border-radius: 6px; white-space: nowrap; }
.club-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.club-card { border: 1px solid var(--line); border-top: 3px solid var(--club-color); border-radius: 10px; padding: 16px; background: var(--surface); min-width: 0; }
.club-card.is-dragging { opacity: .5; }
.club-card-heading { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.setup-form input:not([type="checkbox"]), .setup-form select { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 7px; padding: 9px 10px; background: var(--surface); color: var(--ink); font-size: 13px; min-height: 40px; box-sizing: border-box; }
.setup-form input:focus, .setup-form select:focus { outline: 2px solid #3159e82b; border-color: var(--blue); outline-offset: 1px; }
.setup-form input[type="checkbox"] { accent-color: var(--blue); width: 15px; height: 15px; flex-shrink: 0; }
.setup-form input.club-name { flex: 1; border: 0; font-size: 16px; font-weight: 700; padding: 4px 0; border-radius: 3px; min-height: 32px; width: 90px; }
.cluster-control { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.cluster-label { color: var(--muted); font-size: 11px; }
.club-order { display: flex; gap: 12px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--line); }
.reorder-button { font-size: 10px; color: var(--muted); padding: 4px 0; cursor: pointer; }
button:disabled { opacity: .4; cursor: not-allowed; }
.team-row { display: flex; align-items: center; gap: 8px; }
.team-number { color: var(--muted); font-size: 11px; width: 12px; flex-shrink: 0; }
.club-card button[aria-label^="Ta bort"], .break-row button[aria-label^="Ta bort"] { display: grid; place-items: center; width: 26px; height: 30px; flex-shrink: 0; color: var(--muted); font-size: 19px; cursor: pointer; border-radius: 5px; }
button[aria-label^="Ta bort"]:hover { color: #b54242; background: #fff1ef; }
.club-pauses { border-top: 1px solid var(--line); margin-top: 14px; padding-top: 14px; }
.club-pauses input:not([type="checkbox"]) { width: 70px; }
.add-team { font-size: 12px; font-weight: 600; color: var(--blue); padding: 8px 0 0; cursor: pointer; }
.add-club { display: block; width: 100%; padding: 13px; margin-top: 16px; color: var(--blue); font-size: 12px; font-weight: 600; border: 1px dashed #b9c6dc; border-radius: 8px; background: #f7f9fd; cursor: pointer; }
.add-club:hover { background: #edf2fc; border-color: var(--blue); }
.capacity-note { color: var(--muted); font-size: 11px; line-height: 1.6; margin-top: 14px; }
.settings-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; row-gap: 20px; }
.settings-fields label { display: block; color: var(--muted); font-size: 11px; font-weight: 600; margin-bottom: 7px; }
.settings-fields .relative input { padding-right: 36px; }
.input-unit { position: absolute; right: 10px; bottom: 13px; color: var(--muted); font-size: 10px; pointer-events: none; }
.settings-body > div:last-child:not(.settings-fields) { border-top: 1px solid var(--line); margin-top: 22px; padding-top: 18px; }
.settings-body label[for="allow-inter-club"] { font-size: 12px; color: var(--ink); font-weight: 600; }
.settings-body span { color: var(--muted); }
.break-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.pause-settings { padding-right: 32px; border-right: 1px solid var(--line); }
.advanced-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--ink); cursor: pointer; padding: 0 0 12px; }
.meal-settings h3 { color: var(--ink); font-size: 13px; margin-bottom: 9px; }
.break-columns p { color: var(--muted); font-size: 12px; line-height: 1.6; }
.break-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 12px; border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin: 12px 0; }
.break-name { grid-column: 1 / -1; min-width: 0; }
.break-row label { color: var(--muted); font-size: 11px; }
.break-columns button:not(.advanced-toggle):not([aria-label]) { color: var(--teal); font-size: 12px; font-weight: 600; padding: 8px 0; cursor: pointer; }
.break-row select { grid-column: 1 / -1; }
.break-row input + .input-unit { display: none; }
.storage-notice { color: #8a6420; background: #fff8e8; padding: 12px 16px; border-radius: 8px; font-size: 13px; }
.validation-errors { color: #9a3737; background: #fff0ed; border: 1px solid #edcbc6; padding: 18px; border-radius: 10px; font-size: 13px; }
.generate-strip { background: #edf1fb; border: 1px solid #d9e1f5; border-radius: 12px; padding: 24px 28px; display: flex; align-items: center; justify-content: space-between; gap: 22px; }
.generate-strip strong { color: var(--ink); font-size: 16px; }
.generate-strip p { font-size: 12px; color: var(--muted); margin-top: 5px; line-height: 1.6; }
.generate-button { gap: 20px; white-space: nowrap; }
.generation-note { text-align: center; color: var(--muted); font-size: 11px; margin-top: -12px; line-height: 1.6; }
button:focus-visible, select:focus-visible, input[type="checkbox"]:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
@media (max-width: 1050px) { .club-list { grid-template-columns: 1fr; } .team-count { margin-left: 49px; } }
@media (max-width: 760px) { .setup-columns, .break-columns { grid-template-columns: 1fr; } .club-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pause-settings { border-right: 0; padding-right: 0; border-bottom: 1px solid var(--line); padding-bottom: 22px; } .generate-strip { align-items: flex-start; flex-direction: column; } .generate-button { width: 100%; justify-content: center; } }
@media (max-width: 480px) { .clubs-panel, .settings-panel, .breaks-panel { padding: 20px; } .club-list { grid-template-columns: 1fr; } .generate-strip { padding: 22px; } .setup-columns { gap: 18px; } .step-heading { margin-bottom: 20px; } }
</style>
