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
  { color: '#3159e8', bg: '#edf1ff' },
  { color: '#227d72', bg: '#eaf4ef' },
  { color: '#b9792d', bg: '#fff7e9' },
  { color: '#975273', bg: '#fff0f3' },
  { color: '#745ea3', bg: '#f3effa' },
  { color: '#397e99', bg: '#edf7fb' },
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
  <div class="table-scroll">
    <table class="schedule-table">
      <thead>
        <tr>
          <th>Tid</th>
          <th v-for="rink in rinkColumns" :key="rink">Rink {{ rink }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, ri) in rows" :key="ri">
          <tr v-if="row.type === 'pause'" class="pause-row">
            <td :colspan="rinkColumns.length + 1">
              <div class="pause-content">
                <span class="pause-label">{{ row.label }}</span>
                <span>{{ row.startTime }}–{{ row.windowEnd || row.endTime }}</span>
                <template v-if="row.showClubTimes">
                  <span v-for="club in row.clubs" :key="club.name" class="pause-club">
                    {{ club.name }} {{ club.startTime }}–{{ club.endTime }}
                  </span>
                </template>
              </div>
            </td>
          </tr>
          <tr v-else>
            <td class="slot-time">
              <strong>{{ row.slot.time }}</strong>
              <small>{{ row.slot.endTime }}</small>
            </td>
            <td v-for="rink in rinkColumns" :key="rink" class="rink-cell">
              <template v-for="match in row.slot.matches.filter(m => m.rink === rink)" :key="match.rink">
                <div v-if="match.home && match.away" class="match-card">
                  <div class="team-tag" :style="{ '--team-color': getTeamColor(match.home.clubName).color, '--team-bg': getTeamColor(match.home.clubName).bg }">
                    <span class="team-dot"></span>
                    <div><small>{{ match.home.clubName }}</small><strong>{{ match.home.name }}</strong></div>
                  </div>
                  <span class="match-versus">mot</span>
                  <div class="team-tag" :style="{ '--team-color': getTeamColor(match.away.clubName).color, '--team-bg': getTeamColor(match.away.clubName).bg }">
                    <span class="team-dot"></span>
                    <div><small>{{ match.away.clubName }}</small><strong>{{ match.away.name }}</strong></div>
                  </div>
                </div>
                <div v-else class="empty-slot">—</div>
              </template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
