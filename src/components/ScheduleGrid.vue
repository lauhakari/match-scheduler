<script setup>
import { computed } from 'vue'

const props = defineProps({
  schedule: Object,
  clubs: Array,
})

const CLUB_COLORS = [
  { bg: 'bg-ice-500/15', text: 'text-ice-300', border: 'border-ice-500/25', dot: 'bg-ice-400' },
  { bg: 'bg-amber-400/15', text: 'text-amber-300', border: 'border-amber-400/25', dot: 'bg-amber-400' },
  { bg: 'bg-emerald-400/15', text: 'text-emerald-300', border: 'border-emerald-400/25', dot: 'bg-emerald-400' },
  { bg: 'bg-rose-400/15', text: 'text-rose-300', border: 'border-rose-400/25', dot: 'bg-rose-400' },
  { bg: 'bg-purple-400/15', text: 'text-purple-300', border: 'border-purple-400/25', dot: 'bg-purple-400' },
  { bg: 'bg-cyan-400/15', text: 'text-cyan-300', border: 'border-cyan-400/25', dot: 'bg-cyan-400' },
  { bg: 'bg-orange-400/15', text: 'text-orange-300', border: 'border-orange-400/25', dot: 'bg-orange-400' },
  { bg: 'bg-pink-400/15', text: 'text-pink-300', border: 'border-pink-400/25', dot: 'bg-pink-400' },
]

const clubColorMap = computed(() => {
  const map = {}
  if (props.clubs) {
    props.clubs.forEach((club, i) => {
      map[club.name] = CLUB_COLORS[i % CLUB_COLORS.length]
    })
  }
  return map
})

function getTeamColor(clubName) {
  return clubColorMap.value[clubName] || CLUB_COLORS[0]
}

const rinkColumns = computed(() => {
  return Array.from({ length: props.schedule.numRinks }, (_, i) => i + 1)
})
</script>

<template>
  <div class="animate-fade-in-up">
    <div class="overflow-x-auto rounded-xl border border-slate-800">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-slate-900/80">
            <th class="px-4 py-3 text-left font-display text-sm tracking-widest uppercase text-slate-500 border-b border-slate-800 w-32">
              Time
            </th>
            <th
              v-for="rink in rinkColumns"
              :key="rink"
              class="px-4 py-3 text-center font-display text-sm tracking-widest uppercase text-slate-500 border-b border-slate-800 border-l border-slate-800"
            >
              Rink {{ rink }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(slot, si) in schedule.slots"
            :key="si"
            class="group transition-colors hover:bg-slate-900/40"
            :class="si % 2 === 0 ? 'bg-slate-900/20' : 'bg-transparent'"
          >
            <td class="px-4 py-3 border-b border-slate-800/60 align-middle">
              <div class="font-display text-lg tracking-wider text-white">{{ slot.time }}</div>
              <div class="text-xs text-slate-600">{{ slot.endTime }}</div>
            </td>
            <td
              v-for="rink in rinkColumns"
              :key="rink"
              class="px-3 py-3 border-b border-slate-800/60 border-l border-slate-800/60 align-middle"
            >
              <template v-for="match in slot.matches.filter(m => m.rink === rink)" :key="match.rink">
                <div v-if="match.home && match.away" class="flex flex-col items-center gap-1">
                  <div
                    class="w-full rounded-lg border px-3 py-1.5 text-center text-sm font-medium"
                    :class="[getTeamColor(match.home.clubName).bg, getTeamColor(match.home.clubName).text, getTeamColor(match.home.clubName).border]"
                  >
                    <span class="text-[10px] uppercase tracking-wider opacity-60">{{ match.home.clubName }}</span>
                    <span class="mx-1.5 opacity-30">|</span>
                    {{ match.home.name }}
                  </div>
                  <span class="text-[10px] text-slate-600 font-display tracking-widest">VS</span>
                  <div
                    class="w-full rounded-lg border px-3 py-1.5 text-center text-sm font-medium"
                    :class="[getTeamColor(match.away.clubName).bg, getTeamColor(match.away.clubName).text, getTeamColor(match.away.clubName).border]"
                  >
                    <span class="text-[10px] uppercase tracking-wider opacity-60">{{ match.away.clubName }}</span>
                    <span class="mx-1.5 opacity-30">|</span>
                    {{ match.away.name }}
                  </div>
                </div>
                <div v-else class="text-center text-slate-700 text-sm">—</div>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
