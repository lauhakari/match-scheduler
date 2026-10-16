<script setup>
import { computed } from 'vue'
import { expandPauses } from '../composables/useScheduler.js'
import { rinkName } from '../lib/tournament.js'
import { clubColorByName } from '../lib/clubColors.js'

const props = defineProps({
  schedule: Object,
  clubs: Array,
  settings: { type: Object, default: () => ({}) },
  focusTeam: { type: String, default: '' },
  focusClub: { type: String, default: '' },
})

function timeToMinutes(value) { const [h, m] = value.split(':').map(Number); return h * 60 + m }
function minutesToTime(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
function effectiveDuration(club, pause) {
  const id = pause.originalId || pause.id
  return club.pauseDurations && id in club.pauseDurations ? club.pauseDurations[id] : (pause.defaultDuration || 0)
}

const rows = computed(() => {
  const result = []
  const inserted = new Set()
  const lastSlot = props.schedule.slots[props.schedule.slots.length - 1]
  const endMin = lastSlot ? timeToMinutes(lastSlot.endTime) : 0
  const allPauses = [...expandPauses(props.settings.pauses || [], endMin), ...(props.schedule.generatedPauses || []), ...(props.schedule.foodBreakPauses || [])]
  for (const slot of props.schedule.slots) {
    const slotStart = timeToMinutes(slot.time)
    for (const pause of allPauses) {
      if (inserted.has(pause.id)) continue
      const pauseStart = timeToMinutes(pause.startTime)
      if (slotStart < pauseStart) continue
      const affected = (props.clubs || [])
        .filter(club => !pause._isFoodBreak || (pause._clubNames || []).includes(club.name))
        .map(club => { const duration = pause._isFoodBreak ? pause.defaultDuration : effectiveDuration(club, pause); return duration > 0 ? { name: club.name, duration } : null })
        .filter(Boolean)
      if (affected.length) {
        const windowDuration = pause.windowDuration || 0
        const maxDuration = Math.max(...affected.map(c => c.duration))
        const spread = windowDuration > 0 && affected.length > 1 ? Math.max(0, Math.floor((windowDuration - maxDuration) / (affected.length - 1) / 10) * 10) : 0
        const timed = affected.map((c, i) => ({ ...c, startTime: minutesToTime(pauseStart + i * spread), endTime: minutesToTime(pauseStart + i * spread + c.duration) }))
        const sameDuration = affected.every(c => c.duration === affected[0].duration)
        result.push({
          type: 'pause',
          id: pause.id,
          label: pause.label || (pause._isFoodBreak ? 'Matpaus' : 'Uppehåll'),
          startTime: pause.startTime,
          endTime: spread > 0 ? timed[timed.length - 1].endTime : timed[0].endTime,
          showClubTimes: spread > 0 || !sameDuration || (pause._isFoodBreak && affected.length < (props.clubs || []).length),
          clubs: timed,
        })
      }
      inserted.add(pause.id)
    }
    const empty = slot.matches.every(m => !m.home)
    const previous = result[result.length - 1]
    if (empty && previous?.type === 'gap') { previous.endTime = slot.endTime; previous.count++ }
    else if (empty) result.push({ type: 'gap', id: `gap-${slot.time}`, startTime: slot.time, endTime: slot.endTime, count: 1 })
    else result.push({ type: 'slot', slot })
  }
  return result
})

const rinks = computed(() => Array.from({ length: props.schedule.numRinks }, (_, i) => i + 1))
const color = name => clubColorByName(props.clubs, name)
function involved(match) {
  if (props.focusTeam) return match.home.id === props.focusTeam || match.away.id === props.focusTeam
  if (props.focusClub) return match.home.clubName === props.focusClub || match.away.clubName === props.focusClub
  return true
}
const isFocus = team => props.focusTeam ? team.id === props.focusTeam : props.focusClub ? team.clubName === props.focusClub : false
</script>

<template>
  <div class="table-scroll">
    <table class="schedule-table">
      <thead>
        <tr>
          <th scope="col">Tid</th>
          <th v-for="rink in rinks" :key="rink" scope="col">{{ rinkName(settings, rink) }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="row.type === 'slot' ? row.slot.time : row.id">
          <tr v-if="row.type === 'pause'" class="pause-row">
            <td :colspan="rinks.length + 1">
              <div class="pause-content">
                <strong><svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M3 8h15v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM6 2v2m4-2v2m4-2v2"/></svg>{{ row.label }}</strong>
                <span class="num">{{ row.startTime }}–{{ row.endTime }}</span>
                <template v-if="row.showClubTimes">
                  <span v-for="club in row.clubs" :key="club.name" class="pause-club num">{{ club.name }} {{ club.startTime }}–{{ club.endTime }}</span>
                </template>
              </div>
            </td>
          </tr>
          <tr v-else-if="row.type === 'gap'" class="gap-row">
            <td class="slot-time"><strong>{{ row.startTime }}</strong><small>till {{ row.endTime }}</small></td>
            <td :colspan="rinks.length" class="gap-cell">Inga matcher · {{ row.count }} {{ row.count === 1 ? 'ledig matchtid' : 'lediga matchtider' }}</td>
          </tr>
          <tr v-else>
            <td class="slot-time"><strong>{{ row.slot.time }}</strong><small>till {{ row.slot.endTime }}</small></td>
            <td v-for="rink in rinks" :key="rink" class="rink-cell">
              <template v-for="match in row.slot.matches.filter(m => m.rink === rink)" :key="match.rink">
                <div v-if="match.home && match.away" class="match" :class="{ 'is-dim': !involved(match) }">
                  <div class="team-tag" :class="{ 'is-focus': isFocus(match.home) }" :style="{ '--team-color': color(match.home.clubName).color, '--team-bg': color(match.home.clubName).bg }">
                    <i aria-hidden="true"></i><div><small>{{ match.home.clubName }}</small><strong>{{ match.home.name }}</strong></div>
                  </div>
                  <span class="versus" aria-label="mot">mot</span>
                  <div class="team-tag" :class="{ 'is-focus': isFocus(match.away) }" :style="{ '--team-color': color(match.away.clubName).color, '--team-bg': color(match.away.clubName).bg }">
                    <i aria-hidden="true"></i><div><small>{{ match.away.clubName }}</small><strong>{{ match.away.name }}</strong></div>
                  </div>
                </div>
                <div v-else class="empty-rink">Ledig</div>
              </template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
