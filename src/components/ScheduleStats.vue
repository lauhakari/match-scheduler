<script setup>
const props = defineProps({
  schedule: Object,
  warnings: Array,
  clubs: Array,
})

const CLUB_DOT_COLORS = [
  'bg-ice-400',
  'bg-amber-400',
  'bg-emerald-400',
  'bg-rose-400',
  'bg-purple-400',
  'bg-cyan-400',
  'bg-orange-400',
  'bg-pink-400',
]

function getDotColor(clubName) {
  const idx = props.clubs.findIndex(c => c.name === clubName)
  return CLUB_DOT_COLORS[idx % CLUB_DOT_COLORS.length]
}
</script>

<template>
  <div class="space-y-6 animate-fade-in-up" style="animation-delay: 100ms">
    <!-- Warnings -->
    <div v-if="warnings.length > 0" role="status" aria-live="polite" class="bg-amber-400/10 border border-amber-400/20 rounded-xl p-4">
      <div class="flex items-center gap-2 mb-2">
        <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
        </svg>
        <span class="font-display text-sm tracking-wider uppercase text-amber-400">Varningar</span>
      </div>
      <ul class="space-y-1">
        <li v-for="(w, i) in warnings" :key="i" class="text-sm text-amber-300/80 pl-6">
          {{ w }}
        </li>
      </ul>
    </div>

    <!-- Team stats -->
    <div>
      <h3 class="font-display text-lg tracking-wider uppercase text-slate-400 mb-3">Lagsammanfattning</h3>
      <div class="overflow-x-auto rounded-xl border border-slate-800">
        <table class="w-full">
          <thead>
            <tr class="bg-slate-900/80">
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Klubb</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Lag</th>
              <th class="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Matcher</th>
              <th class="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(team, i) in schedule.teamStats"
              :key="team.id"
              class="transition-colors hover:bg-slate-900/30"
              :class="i % 2 === 0 ? 'bg-slate-900/10' : ''"
            >
              <td class="px-4 py-2.5 text-sm">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full shrink-0" :class="getDotColor(team.clubName)"></span>
                  <span class="text-slate-300">{{ team.clubName }}</span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-sm text-white font-medium">{{ team.name }}</td>
              <td class="px-4 py-2.5 text-center">
                <span class="inline-block font-display text-lg text-white">{{ team.games }}</span>
              </td>
              <td class="px-4 py-2.5 text-center">
                <span
                  v-if="team.belowMin"
                  class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-400/15 text-amber-400 border border-amber-400/20"
                >Under min</span>
                <span
                  v-else-if="team.atMax"
                  class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400"
                >Vid max</span>
                <span
                  v-else
                  class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-400/15 text-emerald-400 border border-emerald-400/20"
                >OK</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
