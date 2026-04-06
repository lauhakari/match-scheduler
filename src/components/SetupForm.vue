<script setup>
import { ref, watch } from 'vue'

const emit = defineEmits(['generate'])

const STORAGE_KEY = 'game-scheduler-state'

const clubs = ref([
  { name: 'Klubb A', teams: [{ name: 'Lag 1' }, { name: 'Lag 2' }] },
  { name: 'Klubb B', teams: [{ name: 'Lag 1' }, { name: 'Lag 2' }] },
])

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

// Load from localStorage
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const parsed = JSON.parse(saved)
    if (parsed.clubs) clubs.value = parsed.clubs
    if (parsed.settings) settings.value = { ...settings.value, ...parsed.settings }
    if (!Array.isArray(settings.value.pauses)) settings.value.pauses = []
    if (!Array.isArray(settings.value.foodBreaks)) settings.value.foodBreaks = []
  }
} catch {}

// Persist on change
watch([clubs, settings], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      clubs: clubs.value,
      settings: settings.value,
    }))
  } catch {}
}, { deep: true })

function addClub() {
  const letter = String.fromCharCode(65 + clubs.value.length)
  clubs.value.push({ name: `Klubb ${letter}`, teams: [{ name: 'Lag 1' }] })
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
  club.teams.push({ name: `Lag ${club.teams.length + 1}` })
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
    const num = parseInt(str, 10)
    if (Number.isFinite(num) && num >= 0) {
      club.pauseDurations[pauseId] = num
    }
  }
}

function handleGenerate() {
  emit('generate', { settings: { ...settings.value }, clubs: clubs.value.map(c => ({ ...c, teams: [...c.teams], pauseDurations: c.pauseDurations ? { ...c.pauseDurations } : undefined })) })
}

const totalTeams = () => clubs.value.reduce((sum, c) => sum + c.teams.length, 0)

const CLUB_COLORS = [
  'from-ice-500/20 to-ice-600/5 border-ice-500/30',
  'from-amber-400/20 to-amber-500/5 border-amber-400/30',
  'from-emerald-400/20 to-emerald-500/5 border-emerald-400/30',
  'from-rose-400/20 to-rose-500/5 border-rose-400/30',
  'from-purple-400/20 to-purple-500/5 border-purple-400/30',
  'from-cyan-400/20 to-cyan-500/5 border-cyan-400/30',
  'from-orange-400/20 to-orange-500/5 border-orange-400/30',
  'from-pink-400/20 to-pink-500/5 border-pink-400/30',
]
</script>

<template>
  <form class="space-y-8" @submit.prevent="handleGenerate" novalidate>
    <!-- Clubs & Teams -->
    <section aria-labelledby="clubs-heading">
      <div class="flex items-center justify-between mb-5">
        <h2 id="clubs-heading" class="font-display text-2xl tracking-wide text-slate-300 uppercase">
          Klubbar & Lag
          <span class="text-sm font-body font-normal tracking-normal text-slate-500 ml-2 lowercase">
            {{ totalTeams() }} lag i {{ clubs.length }} klubbar
          </span>
        </h2>
        <button
          type="button"
          @click="addClub"
          class="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-ice-400 border border-slate-700 hover:border-ice-500/40 rounded-lg transition-all duration-200 cursor-pointer"
        >
          + Lägg till klubb
        </button>
      </div>

      <div class="grid gap-4" :class="clubs.length > 2 ? 'sm:grid-cols-2' : ''">
        <div
          v-for="(club, ci) in clubs"
          :key="ci"
          draggable="true"
          @dragstart="onClubDragStart(ci)"
          @dragover="onClubDragOver($event, ci)"
          @dragend="onClubDragEnd"
          class="bg-gradient-to-br rounded-xl border p-5 animate-fade-in-up cursor-grab active:cursor-grabbing"
          :class="[CLUB_COLORS[ci % CLUB_COLORS.length], dragClubIndex === ci ? 'opacity-50' : '']"
          :style="{ animationDelay: `${ci * 60}ms` }"
        >
          <div class="flex items-center gap-3 mb-4">
            <label :for="`club-name-${ci}`" class="sr-only">Klubbnamn</label>
            <input
              :id="`club-name-${ci}`"
              :name="`club-name-${ci}`"
              v-model="club.name"
              type="text"
              autocomplete="organization"
              class="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              placeholder="Klubbnamn"
            />
            <label
              :for="`club-cluster-${ci}`"
              class="flex items-center gap-1 cursor-pointer group"
              title="Samla lagets matcher närmare i tid (för lag som reser långt)"
            >
              <input
                :id="`club-cluster-${ci}`"
                :name="`club-cluster-${ci}`"
                v-model="club.cluster"
                type="checkbox"
                class="accent-ice-500 w-3.5 h-3.5"
              />
              <span class="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors">Samla</span>
            </label>
            <button
              v-if="clubs.length > 1"
              type="button"
              @click="removeClub(ci)"
              :aria-label="`Ta bort ${club.name || 'klubb'}`"
              class="text-slate-500 hover:text-rose-400 transition-colors text-lg leading-none cursor-pointer"
            >&times;</button>
          </div>

          <fieldset>
            <legend class="sr-only">Lag i {{ club.name || `Klubb ${ci + 1}` }}</legend>
            <div class="space-y-2 mb-3">
              <div
                v-for="(team, ti) in club.teams"
                :key="ti"
                class="flex items-center gap-2 animate-slide-down"
                :style="{ animationDelay: `${ti * 40}ms` }"
              >
                <span class="text-slate-600 text-xs w-4 text-right shrink-0" aria-hidden="true">{{ ti + 1 }}</span>
                <label :for="`team-name-${ci}-${ti}`" class="sr-only">Lagnamn {{ ti + 1 }}</label>
                <input
                  :id="`team-name-${ci}-${ti}`"
                  :name="`team-name-${ci}-${ti}`"
                  v-model="team.name"
                  type="text"
                  class="flex-1 bg-slate-900/40 border border-slate-700/40 rounded-md px-3 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-ice-500/40 transition-all"
                  placeholder="Lagnamn"
                />
                <button
                  v-if="club.teams.length > 1"
                  type="button"
                  @click="removeTeam(ci, ti)"
                  :aria-label="`Ta bort ${team.name || `lag ${ti + 1}`}`"
                  class="text-slate-600 hover:text-rose-400 transition-colors text-sm cursor-pointer"
                >&times;</button>
              </div>
            </div>
          </fieldset>

          <!-- Pause durations (shown only when pauses exist) -->
          <div v-if="settings.pauses.some(p => !p.recurring)" class="mt-3 pt-3 border-t border-slate-700/50">
            <p class="text-xs text-slate-600 uppercase tracking-widest mb-2">Pauser</p>
            <div
              v-for="pause in settings.pauses.filter(p => !p.recurring)"
              :key="pause.id"
              class="flex items-center gap-3 mb-2"
            >
              <label
                :for="`pause-duration-${ci}-${pause.id}`"
                class="text-xs text-slate-400 flex-1"
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
                class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
              />
              <span class="text-xs text-slate-600" aria-hidden="true">min</span>
            </div>
          </div>

          <button
            type="button"
            @click="addTeam(ci)"
            class="text-xs text-slate-500 hover:text-ice-400 transition-colors cursor-pointer"
          >+ Lägg till lag</button>
        </div>
      </div>
    </section>

    <!-- Tournament Settings -->
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading" class="font-display text-2xl tracking-wide text-slate-300 uppercase mb-5">
        Turneringsinställningar
      </h2>

      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          <!-- Time range -->
          <div>
            <label for="start-time" class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Starttid</label>
            <input
              id="start-time"
              name="start-time"
              v-model="settings.startTime"
              type="time"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label for="end-time" class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Sluttid</label>
            <input
              id="end-time"
              name="end-time"
              v-model="settings.endTime"
              type="time"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label for="match-length" class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Matchlängd</label>
            <div class="relative">
              <input
                id="match-length"
                name="match-length"
                v-model.number="settings.matchLength"
                type="number"
                min="5"
                max="120"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-12 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">min</span>
            </div>
          </div>
          <div>
            <label
              for="break-length"
              class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5"
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
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-12 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">min</span>
            </div>
          </div>

          <!-- Rinks & games -->
          <div>
            <label for="num-rinks" class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Antal rinkar</label>
            <input
              id="num-rinks"
              name="num-rinks"
              v-model.number="settings.numRinks"
              type="number"
              min="1"
              max="10"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label for="min-games" class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Min matcher / lag</label>
            <input
              id="min-games"
              name="min-games"
              v-model.number="settings.minGames"
              type="number"
              min="1"
              max="20"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label for="max-games" class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Max matcher / lag</label>
            <input
              id="max-games"
              name="max-games"
              v-model.number="settings.maxGames"
              type="number"
              min="1"
              max="20"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label
              for="min-rest"
              class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5"
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
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-12 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">min</span>
            </div>
          </div>
        </div>

        <!-- Inter-club toggle -->
        <div class="mt-5 pt-5 border-t border-slate-800">
          <div class="flex items-center gap-3">
            <div class="relative">
              <input
                id="allow-inter-club"
                name="allow-inter-club"
                v-model="settings.allowInterClub"
                type="checkbox"
                class="sr-only peer"
              />
              <div
                class="w-10 h-5 bg-slate-700 rounded-full peer-checked:bg-ice-500/60 transition-colors cursor-pointer"
                aria-hidden="true"
                @click="settings.allowInterClub = !settings.allowInterClub"
              ></div>
              <div
                class="absolute left-0.5 top-0.5 w-4 h-4 bg-slate-400 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-all pointer-events-none"
                aria-hidden="true"
              ></div>
            </div>
            <label for="allow-inter-club" class="text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer">
              Tillåt internmatcher
            </label>
            <span class="text-xs text-slate-600">(lag från samma klubb kan möta varandra)</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Advanced settings -->
    <div class="mt-6 border-t border-slate-800/60 pt-4">
      <button
        type="button"
        :aria-expanded="showAdvanced"
        aria-controls="advanced-settings-panel"
        @click="showAdvanced = !showAdvanced"
        class="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
      >
        <span :class="showAdvanced ? 'rotate-90' : ''" class="inline-block transition-transform" aria-hidden="true">›</span>
        Avancerade inställningar
      </button>

      <div
        v-if="showAdvanced"
        id="advanced-settings-panel"
        class="mt-4 space-y-3"
      >
        <div class="flex items-center gap-2 mb-2">
          <p class="text-xs font-medium uppercase tracking-widest text-slate-600">Pauser</p>
          <div class="flex-1"></div>
          <p class="text-[10px] text-slate-700 text-right w-20 pr-1" aria-hidden="true">Fönster</p>
          <p class="text-[10px] text-slate-700 text-right w-20 pr-1" aria-hidden="true">Standard</p>
          <div class="w-4"></div>
        </div>

        <div
          v-for="(pause, index) in settings.pauses"
          :key="pause.id"
          class="flex items-center gap-3"
          role="group"
          :aria-label="`Paus ${index + 1}`"
        >
          <label :for="`pause-label-${pause.id}`" class="sr-only">Pausnamn</label>
          <input
            :id="`pause-label-${pause.id}`"
            :name="`pause-label-${pause.id}`"
            v-model="pause.label"
            type="text"
            placeholder="Namn (t.ex. Lunch)"
            class="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
          />
          <label :for="`pause-start-${pause.id}`" class="sr-only">Starttid</label>
          <input
            :id="`pause-start-${pause.id}`"
            :name="`pause-start-${pause.id}`"
            v-model="pause.startTime"
            type="time"
            class="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
          />
          <div class="relative" title="Fönster inom vilket klubbarnas pauser sprids ut (0 = alla börjar samtidigt)">
            <label :for="`pause-window-${pause.id}`" class="sr-only">Fönsterlängd i minuter</label>
            <input
              :id="`pause-window-${pause.id}`"
              :name="`pause-window-${pause.id}`"
              v-model.number="pause.windowDuration"
              type="number"
              min="0"
              placeholder="0"
              class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
            />
            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">fön</span>
          </div>
          <div class="relative" title="Standard pauslängd för klubbar utan eget värde">
            <label :for="`pause-default-${pause.id}`" class="sr-only">Standard pauslängd i minuter</label>
            <input
              :id="`pause-default-${pause.id}`"
              :name="`pause-default-${pause.id}`"
              v-model.number="pause.defaultDuration"
              type="number"
              min="0"
              placeholder="60"
              class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
            />
            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">min</span>
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
              class="accent-ice-500 w-3.5 h-3.5"
            />
            <span class="text-xs text-slate-500 group-hover:text-slate-400 transition-colors">Åter.</span>
          </label>
          <template v-if="pause.recurring">
            <select
              :id="`pause-mode-${pause.id}`"
              :name="`pause-mode-${pause.id}`"
              v-model="pause.recurringMode"
              class="bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-slate-500"
              title="Återkommande efter tid eller antal omgångar"
            >
              <option value="slots">Var X omg.</option>
              <option value="time">Var X min</option>
            </select>
            <div v-if="pause.recurringMode === 'slots'" class="relative" title="Antal omgångar mellan varje paus">
              <label :for="`pause-interval-slots-${pause.id}`" class="sr-only">Pausintervall i omgångar</label>
              <input
                :id="`pause-interval-slots-${pause.id}`"
                :name="`pause-interval-slots-${pause.id}`"
                v-model.number="pause.intervalSlots"
                type="number"
                min="1"
                placeholder="5"
                class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
              />
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">omg</span>
            </div>
            <div v-else class="relative" title="Intervall mellan varje paus (minuter)">
              <label :for="`pause-interval-${pause.id}`" class="sr-only">Pausintervall i minuter</label>
              <input
                :id="`pause-interval-${pause.id}`"
                :name="`pause-interval-${pause.id}`"
                v-model.number="pause.intervalMinutes"
                type="number"
                min="1"
                placeholder="120"
                class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
              />
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">int</span>
            </div>
          </template>
          <button
            type="button"
            @click="removePause(index)"
            :aria-label="`Ta bort paus ${pause.label || index + 1}`"
            class="text-slate-600 hover:text-red-400 transition-colors cursor-pointer px-1"
          >&times;</button>
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

    <!-- Matpauser (food breaks) -->
    <div>
      <label class="block text-sm font-medium text-slate-400 mb-3">Matpauser</label>
      <div class="space-y-2">
        <div
          v-for="(fb, index) in settings.foodBreaks"
          :key="fb.id"
          class="flex items-center gap-3"
          role="group"
          :aria-label="`Matpaus ${index + 1}`"
        >
          <label :for="`fb-label-${fb.id}`" class="sr-only">Matpausnamn</label>
          <input
            :id="`fb-label-${fb.id}`"
            :name="`fb-label-${fb.id}`"
            v-model="fb.label"
            type="text"
            placeholder="Lunch"
            class="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
          />
          <label :for="`fb-start-${fb.id}`" class="sr-only">Starttid</label>
          <input
            :id="`fb-start-${fb.id}`"
            :name="`fb-start-${fb.id}`"
            v-model="fb.startTime"
            type="time"
            class="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
          />
          <div class="relative" title="Längd per matpass (minuter)">
            <label :for="`fb-duration-${fb.id}`" class="sr-only">Längd i minuter</label>
            <input
              :id="`fb-duration-${fb.id}`"
              :name="`fb-duration-${fb.id}`"
              v-model.number="fb.duration"
              type="number"
              min="1"
              placeholder="50"
              class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
            />
            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">min</span>
          </div>
          <div class="relative" title="Max antal lag per matpass">
            <label :for="`fb-max-${fb.id}`" class="sr-only">Max lag per pass</label>
            <input
              :id="`fb-max-${fb.id}`"
              :name="`fb-max-${fb.id}`"
              v-model.number="fb.maxTeamsPerSlot"
              type="number"
              min="1"
              placeholder="6"
              class="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
            />
            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs" aria-hidden="true">lag</span>
          </div>
          <button
            type="button"
            @click="removeFoodBreak(index)"
            :aria-label="`Ta bort matpaus ${fb.label || index + 1}`"
            class="text-slate-600 hover:text-red-400 transition-colors cursor-pointer px-1"
          >&times;</button>
        </div>

        <button
          type="button"
          @click="addFoodBreak"
          class="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          + Lägg till matpaus
        </button>
      </div>
    </div>

    <!-- Generate button -->
    <div class="flex justify-center pt-2">
      <button
        type="submit"
        :disabled="totalTeams() < 2"
        :aria-disabled="totalTeams() < 2"
        class="group relative px-8 py-3.5 bg-ice-500 hover:bg-ice-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-display text-xl tracking-widest uppercase rounded-xl transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
      >
        <span class="relative z-10">Generera Spelschema</span>
        <div class="absolute inset-0 rounded-xl bg-ice-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true"></div>
      </button>
    </div>
  </form>
</template>
