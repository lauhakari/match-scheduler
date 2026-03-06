<script setup>
import { ref, watch } from 'vue'

const emit = defineEmits(['generate'])

const STORAGE_KEY = 'game-scheduler-state'

const clubs = ref([
  { name: 'Club A', teams: [{ name: 'Team 1' }, { name: 'Team 2' }] },
  { name: 'Club B', teams: [{ name: 'Team 1' }, { name: 'Team 2' }] },
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
})

// Load from localStorage
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const parsed = JSON.parse(saved)
    if (parsed.clubs) clubs.value = parsed.clubs
    if (parsed.settings) settings.value = { ...settings.value, ...parsed.settings }
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
  clubs.value.push({ name: `Club ${letter}`, teams: [{ name: 'Team 1' }] })
}

function removeClub(index) {
  clubs.value.splice(index, 1)
}

function addTeam(clubIndex) {
  const club = clubs.value[clubIndex]
  club.teams.push({ name: `Team ${club.teams.length + 1}` })
}

function removeTeam(clubIndex, teamIndex) {
  clubs.value[clubIndex].teams.splice(teamIndex, 1)
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
          Clubs & Teams
          <span class="text-sm font-body font-normal tracking-normal text-slate-500 ml-2 lowercase">
            {{ totalTeams() }} teams across {{ clubs.length }} clubs
          </span>
        </h2>
        <button
          @click="addClub"
          class="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-ice-400 border border-slate-700 hover:border-ice-500/40 rounded-lg transition-all duration-200 cursor-pointer"
        >
          + Add Club
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
              placeholder="Club name"
            />
            <button
              v-if="clubs.length > 1"
              @click="removeClub(ci)"
              class="text-slate-500 hover:text-rose-400 transition-colors text-lg leading-none cursor-pointer"
              title="Remove club"
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
                placeholder="Team name"
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
          >+ Add team</button>
        </div>
      </div>
    </section>

    <!-- Tournament Settings -->
    <section>
      <h2 class="font-display text-2xl tracking-wide text-slate-300 uppercase mb-5">
        Tournament Settings
      </h2>

      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          <!-- Time range -->
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Start Time</label>
            <input
              v-model="settings.startTime"
              type="time"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">End Time</label>
            <input
              v-model="settings.endTime"
              type="time"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Match Length</label>
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
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Break Between</label>
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
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Number of Rinks</label>
            <input
              v-model.number="settings.numRinks"
              type="number"
              min="1"
              max="10"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Min Games / Team</label>
            <input
              v-model.number="settings.minGames"
              type="number"
              min="1"
              max="20"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Max Games / Team</label>
            <input
              v-model.number="settings.maxGames"
              type="number"
              min="1"
              max="20"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-ice-500/50 focus:ring-1 focus:ring-ice-500/20 transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Min Rest Between</label>
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
              Allow inter-club matches
            </span>
            <span class="text-xs text-slate-600">(teams from the same club can play each other)</span>
          </label>
        </div>
      </div>
    </section>

    <!-- Generate button -->
    <div class="flex justify-center pt-2">
      <button
        @click="handleGenerate"
        :disabled="totalTeams() < 2"
        class="group relative px-8 py-3.5 bg-ice-500 hover:bg-ice-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-display text-xl tracking-widest uppercase rounded-xl transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
      >
        <span class="relative z-10">Generate Schedule</span>
        <div class="absolute inset-0 rounded-xl bg-ice-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </button>
    </div>
  </div>
</template>
