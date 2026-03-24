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

function handleGenerate() {
  emit('generate', { settings: { ...settings.value }, clubs: clubs.value.map(c => ({ ...c, teams: [...c.teams] })) })
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
  <div class="space-y-8">
    <!-- Clubs & Teams -->
    <section>
      <div class="flex items-center justify-between mb-5">
        <h2 class="font-display text-2xl tracking-wide text-slate-300 uppercase">
          Klubbar & Lag
          <span class="text-sm font-body font-normal tracking-normal text-slate-500 ml-2 lowercase">
            {{ totalTeams() }} lag i {{ clubs.length }} klubbar
          </span>
        </h2>
        <button
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
          class="bg-gradient-to-br rounded-xl border p-5 animate-fade-in-up"
          :class="CLUB_COLORS[ci % CLUB_COLORS.length]"
          :style="{ animationDelay: `${ci * 60}ms` }"
        >
          <div class="flex items-center gap-3 mb-4">
            <input
              v-model="club.name"
              class="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-white font-semibold text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              placeholder="Klubbnamn"
            />
            <button
              v-if="clubs.length > 1"
              @click="removeClub(ci)"
              class="text-slate-500 hover:text-rose-400 transition-colors text-lg leading-none cursor-pointer"
              title="Ta bort klubb"
            >&times;</button>
          </div>

          <div class="space-y-2 mb-3">
            <div
              v-for="(team, ti) in club.teams"
              :key="ti"
              class="flex items-center gap-2 animate-slide-down"
              :style="{ animationDelay: `${ti * 40}ms` }"
            >
              <span class="text-slate-600 text-xs w-4 text-right shrink-0">{{ ti + 1 }}</span>
              <input
                v-model="team.name"
                class="flex-1 bg-slate-900/40 border border-slate-700/40 rounded-md px-3 py-1.5 text-slate-200 text-sm focus:outline-none focus:border-ice-500/40 transition-all"
                placeholder="Lagnamn"
              />
              <button
                v-if="club.teams.length > 1"
                @click="removeTeam(ci, ti)"
                class="text-slate-600 hover:text-rose-400 transition-colors text-sm cursor-pointer"
              >&times;</button>
            </div>
          </div>

          <button
            @click="addTeam(ci)"
            class="text-xs text-slate-500 hover:text-ice-400 transition-colors cursor-pointer"
          >+ Lägg till lag</button>
        </div>
      </div>
    </section>

    <!-- Tournament Settings -->
    <section>
      <h2 class="font-display text-2xl tracking-wide text-slate-300 uppercase mb-5">
        Turneringsinställningar
      </h2>

      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          <!-- Time range -->
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Starttid</label>
            <input
              v-model="settings.startTime"
              type="time"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Sluttid</label>
            <input
              v-model="settings.endTime"
              type="time"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Matchlängd</label>
            <div class="relative">
              <input
                v-model.number="settings.matchLength"
                type="number"
                min="5"
                max="120"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-12 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">min</span>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Paus mellan</label>
            <div class="relative">
              <input
                v-model.number="settings.breakLength"
                type="number"
                min="0"
                max="60"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-12 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">min</span>
            </div>
          </div>

          <!-- Rinks & games -->
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Antal rinkar</label>
            <input
              v-model.number="settings.numRinks"
              type="number"
              min="1"
              max="10"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Min matcher / lag</label>
            <input
              v-model.number="settings.minGames"
              type="number"
              min="1"
              max="20"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Max matcher / lag</label>
            <input
              v-model.number="settings.maxGames"
              type="number"
              min="1"
              max="20"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Min vila mellan</label>
            <div class="relative">
              <input
                v-model.number="settings.minRest"
                type="number"
                min="0"
                max="120"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-12 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">min</span>
            </div>
          </div>
        </div>

        <!-- Inter-club toggle -->
        <div class="mt-5 pt-5 border-t border-slate-800">
          <label class="flex items-center gap-3 cursor-pointer group">
            <div class="relative">
              <input
                v-model="settings.allowInterClub"
                type="checkbox"
                class="sr-only peer"
              />
              <div class="w-10 h-5 bg-slate-700 rounded-full peer-checked:bg-ice-500/60 transition-colors"></div>
              <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-slate-400 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-all"></div>
            </div>
            <span class="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
              Tillåt internmatcher
            </span>
            <span class="text-xs text-slate-600">(lag från samma klubb kan möta varandra)</span>
          </label>
        </div>
      </div>
    </section>

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

    <!-- Generate button -->
    <div class="flex justify-center pt-2">
      <button
        @click="handleGenerate"
        :disabled="totalTeams() < 2"
        class="group relative px-8 py-3.5 bg-ice-500 hover:bg-ice-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-display text-xl tracking-widest uppercase rounded-xl transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
      >
        <span class="relative z-10">Generera Spelschema</span>
        <div class="absolute inset-0 rounded-xl bg-ice-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </button>
    </div>
  </div>
</template>
