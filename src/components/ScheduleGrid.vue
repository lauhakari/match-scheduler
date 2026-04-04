<script setup>
import { computed } from 'vue'
import { expandPauses } from '../composables/useScheduler.js'

const props = defineProps({
  schedule: Object,
  clubs: Array,
  pauses: { type: Array, default: () => [] },
})

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function getEffectiveDuration(club, pause) {
  const lookupId = pause.originalId || pause.id
  if (club.pauseDurations && lookupId in club.pauseDurations) {
    return club.pauseDurations[lookupId]
  }
  return pause.defaultDuration || 0
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Interleaved rows: { type: 'slot', slot } or { type: 'pause', label, startTime, endTime, clubs }
const rows = computed(() => {
  const result = []
  const inserted = new Set()

  const lastSlot = props.schedule.slots[props.schedule.slots.length - 1]
  const endMin = lastSlot ? timeToMinutes(lastSlot.endTime) : 0
  const allPauses = [
    ...expandPauses(props.pauses, endMin),
    ...(props.schedule.generatedPauses || []),
    ...(props.schedule.foodBreakPauses || []),
  ]

  for (const slot of props.schedule.slots) {
    const slotStart = timeToMinutes(slot.time)

    for (const pause of allPauses) {
      if (inserted.has(pause.id)) continue
      const pauseStart = timeToMinutes(pause.startTime)
      if (slotStart >= pauseStart) {
        const affected = (props.clubs || [])
          .filter(club => {
            if (pause._isFoodBreak) return (pause._clubNames || []).includes(club.name)
            return true
          })
          .map(club => {
            const dur = pause._isFoodBreak ? pause.defaultDuration : getEffectiveDuration(club, pause)
            return dur > 0 ? { name: club.name, duration: dur, endTime: minutesToTime(pauseStart + dur) } : null
          })
          .filter(Boolean)
        if (affected.length > 0) {
          const windowDuration = pause.windowDuration || 0

          // Compute staggered start times (same logic as scheduler)
          const maxDur = Math.max(...affected.map(c => c.duration))
          const spread = windowDuration > 0 && affected.length > 1
            ? Math.max(0, Math.floor((windowDuration - maxDur) / (affected.length - 1) / 10) * 10)
            : 0
          const wStart = timeToMinutes(pause.startTime)
          const affectedWithTimes = affected.map((c, i) => {
            const start = wStart + i * spread
            return { ...c, startTime: minutesToTime(start), endTime: minutesToTime(start + c.duration) }
          })

          // Only show window end when clubs actually stagger
          const lastClub = affectedWithTimes[affectedWithTimes.length - 1]
          const windowEnd = spread > 0 && lastClub
            ? lastClub.endTime
            : null

          // Hide per-club times when all clubs break identically (no spread, same duration)
          const allSameDuration = affected.every(c => c.duration === affected[0].duration)
          const showClubTimes = spread > 0 || !allSameDuration

          result.push({
            type: 'pause',
            label: pause.label || 'Paus',
            startTime: pause.startTime,
            endTime: affectedWithTimes[0]?.endTime || null,
            windowEnd,
            showClubTimes,
            clubs: affectedWithTimes,
          })
        }
        inserted.add(pause.id)
      }
    }

    result.push({ type: 'slot', slot })
  }
  return result
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
              Tid
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
          <template v-for="(row, ri) in rows" :key="ri">
            <!-- Pause separator row -->
            <tr v-if="row.type === 'pause'" class="bg-amber-400/5 border-y border-amber-400/20">
              <td :colspan="rinkColumns.length + 1" class="px-4 py-2.5">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span class="text-xs font-display tracking-widest uppercase text-amber-300/80">{{ row.label }}</span>
                  <span class="text-xs text-slate-600">
                    {{ row.startTime }}–{{ row.windowEnd || row.endTime }}
                  </span>
                  <template v-if="row.showClubTimes">
                    <span class="text-slate-700 text-xs">·</span>
                    <span
                      v-for="club in row.clubs"
                      :key="club.name"
                      class="text-xs text-slate-500"
                    >{{ club.name }} {{ club.startTime }}–{{ club.endTime }}</span>
                  </template>
                </div>
              </td>
            </tr>
            <!-- Regular slot row -->
            <tr
              v-else
              class="group transition-colors hover:bg-slate-900/40"
              :class="ri % 2 === 0 ? 'bg-slate-900/20' : 'bg-transparent'"
            >
              <td class="px-4 py-3 border-b border-slate-800/60 align-middle">
                <div class="font-display text-lg tracking-wider text-white">{{ row.slot.time }}</div>
                <div class="text-xs text-slate-600">{{ row.slot.endTime }}</div>
              </td>
              <td
                v-for="rink in rinkColumns"
                :key="rink"
                class="px-3 py-3 border-b border-slate-800/60 border-l border-slate-800/60 align-middle"
              >
                <template v-for="match in row.slot.matches.filter(m => m.rink === rink)" :key="match.rink">
                  <div v-if="match.home && match.away" class="flex flex-col items-center gap-1">
                    <div
                      class="w-full rounded-lg border px-3 py-1.5 text-center text-sm font-medium"
                      :class="[getTeamColor(match.home.clubName).bg, getTeamColor(match.home.clubName).text, getTeamColor(match.home.clubName).border]"
                    >
                      <span class="text-[10px] uppercase tracking-wider opacity-60">{{ match.home.clubName }}</span>
                      <span class="mx-1.5 opacity-30">|</span>
                      {{ match.home.name }}
                    </div>
                    <span class="text-[10px] text-slate-600 font-display tracking-widest">MOT</span>
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
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
