<script setup>
import { ref, computed } from 'vue'
import { mealCapacityFloor } from '../lib/tournament.js'

const settings = defineModel('settings', { type: Object, required: true })
const clubs = defineModel('clubs', { type: Array, required: true })
const open = ref({})
const showClubList = ref({})

const totalTeams = computed(() => clubs.value.reduce((sum, c) => sum + c.teams.length, 0))

const rows = computed(() => [
  ...settings.value.foodBreaks.map((item, index) => ({ kind: 'meal', item, index })),
  ...settings.value.pauses.map((item, index) => ({ kind: 'pause', item, index })),
].sort((a, b) => sortKey(a).localeCompare(sortKey(b))))
const sortKey = row => row.kind === 'pause' && row.item.recurring && row.item.recurringMode === 'slots' ? '99:99' : row.item.startTime || '99:98'

function toMinutes(value) { const [h, m] = String(value || '0:0').split(':').map(Number); return h * 60 + m }
function toTime(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }

function mealGroups(meal) {
  const groups = []
  for (const club of clubs.value) {
    const group = groups.findIndex(count => count + club.teams.length <= meal.maxTeamsPerSlot)
    if (group < 0) groups.push(club.teams.length)
    else groups[group] += club.teams.length
  }
  return Math.max(1, groups.length)
}
function stopsPlay(row) {
  if (row.kind === 'meal') return totalTeams.value <= (row.item.maxTeamsPerSlot || 0)
  return row.item.recurring || !(row.item.windowDuration > 0)
}
function name(row) { return row.item.label || (row.kind === 'meal' ? 'Matpaus' : 'Uppehåll') }
function when(row) {
  if (row.kind === 'pause' && row.item.recurring && row.item.recurringMode === 'slots') return `Var ${row.item.intervalSlots || 1}:e omgång`
  if (row.kind === 'meal') {
    const end = toMinutes(row.item.startTime) + mealGroups(row.item) * (row.item.duration || 0)
    return mealGroups(row.item) > 1 ? `${row.item.startTime}–${toTime(end)}` : row.item.startTime
  }
  return row.item.startTime
}
function length(row) {
  if (row.kind === 'meal') return `${row.item.duration || 0} min per pass`
  const base = `${row.item.defaultDuration || 0} min`
  if (row.item.recurring && row.item.recurringMode === 'time') return `${base} · var ${row.item.intervalMinutes || 0}:e minut`
  return base
}
function explanation(row) {
  if (row.kind === 'meal') {
    const groups = mealGroups(row.item)
    if (stopsPlay(row)) return `Alla klubbar ryms i ett pass, så spelet står still ${row.item.startTime}–${toTime(toMinutes(row.item.startTime) + (row.item.duration || 0))}.`
    return `Klubbarna äter i ${groups} pass om ${row.item.duration || 0} minuter från ${row.item.startTime}, och en klubb hålls alltid ihop. Matcherna fortsätter för de som inte äter. Ordningen i steget Lag styr vilka som äter först.`
  }
  if (row.item.recurring) return 'Uppehållet återkommer under dagen och stoppar spelet på alla spelplaner.'
  if (stopsPlay(row)) return 'Alla klubbar pausar samtidigt och inga matcher spelas under tiden.'
  return `Klubbarna får olika starttider inom ${row.item.windowDuration} minuter från ${row.item.startTime}, och matcherna fortsätter för de som inte pausar.`
}
function setMode(pause, stops) {
  pause.windowDuration = stops ? 0 : Math.max(60, (pause.defaultDuration || 30) + 30)
}

function addFoodBreak() {
  const meal = { id: crypto.randomUUID(), startTime: '11:30', label: 'Lunch', duration: 45, maxTeamsPerSlot: mealCapacityFloor(clubs.value) }
  settings.value.foodBreaks.push(meal)
  open.value = { [meal.id]: true }
}
function removeFoodBreak(index) { settings.value.foodBreaks.splice(index, 1) }

function addPause() {
  const pause = { id: crypto.randomUUID(), startTime: '12:00', label: '', defaultDuration: 15, windowDuration: 0, recurring: false, recurringMode: 'slots', intervalSlots: 4, intervalMinutes: 120 }
  settings.value.pauses.push(pause)
  open.value = { [pause.id]: true }
}
function removePause(index) {
  const pause = settings.value.pauses[index]
  for (const club of clubs.value) if (club.pauseDurations) delete club.pauseDurations[pause.id]
  settings.value.pauses.splice(index, 1)
}
function toggle(id) { open.value[id] = !open.value[id] }

function exceptions(pauseId) {
  return clubs.value.filter(club => club.pauseDurations && pauseId in club.pauseDurations).map(club => ({ club, duration: club.pauseDurations[pauseId] }))
}
function clubDuration(club, pauseId) { return club.pauseDurations && pauseId in club.pauseDurations ? club.pauseDurations[pauseId] : '' }
function setClubDuration(club, pauseId, value) {
  if (!club.pauseDurations) club.pauseDurations = {}
  const text = String(value).trim()
  if (text === '') delete club.pauseDurations[pauseId]
  else club.pauseDurations[pauseId] = Number(text)
}
function clearClubDuration(club, pauseId) { if (club.pauseDurations) delete club.pauseDurations[pauseId] }
</script>

<template>
  <div class="pause-list">
    <div v-if="!rows.length" class="empty-hint">Inga pauser inlagda. Dagen rullar på utan avbrott.</div>
    <div v-for="row in rows" :key="row.item.id" class="pause" :class="{ 'is-open': open[row.item.id] }">
      <button type="button" class="pause-toggle" :aria-expanded="!!open[row.item.id]" :aria-controls="`pause-body-${row.item.id}`" @click="toggle(row.item.id)">
        <span class="pause-icon" aria-hidden="true">
          <svg v-if="row.kind === 'meal'" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1M3 8h15v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/></svg>
          <svg v-else-if="row.item.recurring" viewBox="0 0 24 24"><path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11"/></svg>
          <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 9v6m4-6v6"/></svg>
        </span>
        <span class="pause-name">{{ name(row) }}</span>
        <span class="pause-when num">{{ when(row) }}</span>
        <span class="pause-length">{{ length(row) }}</span>
        <span class="tag" :class="stopsPlay(row) ? 'tag-stop' : 'tag-between'">{{ stopsPlay(row) ? 'Stoppar spelet' : 'Mellan matcher' }}</span>
        <span class="pause-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
      </button>

      <div v-if="open[row.item.id]" :id="`pause-body-${row.item.id}`" class="pause-body">
        <template v-if="row.kind === 'meal'">
          <div class="field-grid">
            <div class="field">
              <label :for="`fb-label-${row.item.id}`">Namn</label>
              <input :id="`fb-label-${row.item.id}`" :name="`fb-label-${row.item.id}`" v-model="row.item.label" type="text" placeholder="Lunch" maxlength="100" />
            </div>
            <div class="field">
              <label :for="`fb-start-${row.item.id}`">Första passet börjar</label>
              <input :id="`fb-start-${row.item.id}`" :name="`fb-start-${row.item.id}`" v-model="row.item.startTime" type="time" />
            </div>
            <div class="field">
              <label :for="`fb-duration-${row.item.id}`">Längd per pass</label>
              <div class="field-unit"><input :id="`fb-duration-${row.item.id}`" :name="`fb-duration-${row.item.id}`" v-model.number="row.item.duration" type="number" min="1" max="240" inputmode="numeric" /><span>min</span></div>
            </div>
            <div class="field">
              <label :for="`fb-max-${row.item.id}`">Plats för</label>
              <div class="field-unit"><input :id="`fb-max-${row.item.id}`" :name="`fb-max-${row.item.id}`" v-model.number="row.item.maxTeamsPerSlot" type="number" min="1" max="80" inputmode="numeric" /><span>lag per pass</span></div>
            </div>
          </div>
          <p class="pause-note">{{ explanation(row) }}</p>
          <div class="pause-foot">
            <button type="button" class="btn btn-ghost btn-danger btn-sm" @click="removeFoodBreak(row.index)">Ta bort matpausen</button>
          </div>
        </template>

        <template v-else>
          <div v-if="!row.item.recurring" class="segmented" role="radiogroup" :aria-label="`Hur ${name(row)} påverkar spelet`">
            <label><input type="radio" :name="`pause-mode-${row.item.id}`" :checked="stopsPlay(row)" @change="setMode(row.item, true)" /><span>Stoppar spelet</span></label>
            <label><input type="radio" :name="`pause-mode-${row.item.id}`" :checked="!stopsPlay(row)" @change="setMode(row.item, false)" /><span>Mellan matcher</span></label>
          </div>
          <div class="field-grid cols-3">
            <div class="field">
              <label :for="`pause-label-${row.item.id}`">Namn</label>
              <input :id="`pause-label-${row.item.id}`" :name="`pause-label-${row.item.id}`" v-model="row.item.label" type="text" placeholder="t.ex. Spolning" maxlength="100" />
            </div>
            <div v-if="!(row.item.recurring && row.item.recurringMode === 'slots')" class="field">
              <label :for="`pause-start-${row.item.id}`">{{ row.item.recurring ? 'Första gången' : 'Börjar' }}</label>
              <input :id="`pause-start-${row.item.id}`" :name="`pause-start-${row.item.id}`" v-model="row.item.startTime" type="time" />
            </div>
            <div class="field">
              <label :for="`pause-default-${row.item.id}`">Längd</label>
              <div class="field-unit"><input :id="`pause-default-${row.item.id}`" :name="`pause-default-${row.item.id}`" v-model.number="row.item.defaultDuration" type="number" min="0" max="240" inputmode="numeric" /><span>min</span></div>
            </div>
            <div v-if="!row.item.recurring && !stopsPlay(row)" class="field">
              <label :for="`pause-window-${row.item.id}`">Sprid ut över</label>
              <div class="field-unit"><input :id="`pause-window-${row.item.id}`" :name="`pause-window-${row.item.id}`" v-model.number="row.item.windowDuration" type="number" min="1" max="240" inputmode="numeric" /><span>min</span></div>
            </div>
          </div>
          <p class="pause-note">{{ explanation(row) }}</p>

          <label class="check">
            <input type="checkbox" v-model="row.item.recurring" :name="`pause-recurring-${row.item.id}`" />
            <div><strong>Upprepa uppehållet under dagen</strong><span>Passar för spolning efter ett visst antal omgångar.</span></div>
          </label>
          <div v-if="row.item.recurring" class="field-grid">
            <div class="field">
              <label :for="`pause-repeat-${row.item.id}`">Upprepa</label>
              <select :id="`pause-repeat-${row.item.id}`" :name="`pause-repeat-${row.item.id}`" v-model="row.item.recurringMode">
                <option value="slots">efter ett antal omgångar</option>
                <option value="time">med jämna tidsintervall</option>
              </select>
            </div>
            <div v-if="row.item.recurringMode === 'slots'" class="field">
              <label :for="`pause-interval-slots-${row.item.id}`">Antal omgångar mellan uppehållen</label>
              <div class="field-unit"><input :id="`pause-interval-slots-${row.item.id}`" :name="`pause-interval-slots-${row.item.id}`" v-model.number="row.item.intervalSlots" type="number" min="1" max="288" inputmode="numeric" /><span>omgångar</span></div>
            </div>
            <div v-else class="field">
              <label :for="`pause-interval-${row.item.id}`">Tid mellan uppehållen</label>
              <div class="field-unit"><input :id="`pause-interval-${row.item.id}`" :name="`pause-interval-${row.item.id}`" v-model.number="row.item.intervalMinutes" type="number" min="5" max="1440" inputmode="numeric" /><span>min</span></div>
            </div>
          </div>

          <div v-if="!row.item.recurring" class="exception">
            <span>Undantag</span>
            <span v-for="{ club, duration } in exceptions(row.item.id)" :key="club.id" class="exception-chip">
              {{ club.name || 'Klubb' }} · {{ duration }} min
              <button type="button" class="icon-btn" :aria-label="`Ta bort undantaget för ${club.name || 'klubben'}`" @click="clearClubDuration(club, row.item.id)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </span>
            <button type="button" class="link-btn" :aria-expanded="!!showClubList[row.item.id]" @click="showClubList[row.item.id] = !showClubList[row.item.id]">+ Annan längd för en klubb</button>
          </div>
          <div v-if="!row.item.recurring && showClubList[row.item.id]" class="club-duration-list">
            <p class="help">Lämna tomt för {{ row.item.defaultDuration || 0 }} minuter. Skriv 0 om klubben inte ska pausa alls.</p>
            <div v-for="(club, ci) in clubs" :key="club.id" class="club-duration">
              <label :for="`pause-duration-${ci}-${row.item.id}`">{{ club.name || `Klubb ${ci + 1}` }}</label>
              <div class="field-unit"><input :id="`pause-duration-${ci}-${row.item.id}`" :name="`pause-duration-${ci}-${row.item.id}`" :value="clubDuration(club, row.item.id)" @input="setClubDuration(club, row.item.id, $event.target.value)" type="number" min="0" max="240" inputmode="numeric" :placeholder="String(row.item.defaultDuration ?? 0)" class="control" /><span>min</span></div>
            </div>
          </div>
          <div class="pause-foot">
            <button type="button" class="btn btn-ghost btn-danger btn-sm" @click="removePause(row.index)">Ta bort uppehållet</button>
          </div>
        </template>
      </div>
    </div>

    <div class="add-row">
      <button type="button" class="btn btn-secondary" @click="addFoodBreak" :disabled="settings.foodBreaks.length >= 10"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Lägg till matpaus</button>
      <button type="button" class="btn btn-secondary" @click="addPause" :disabled="settings.pauses.length >= 20"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Lägg till uppehåll</button>
    </div>
  </div>
</template>
