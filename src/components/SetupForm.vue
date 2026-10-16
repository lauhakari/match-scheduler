<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { DEFAULT_SETTINGS, normalizeClubs, snapshotTournament, validateTournament } from '../lib/tournament.js'
import { planChecks } from '../lib/planChecks.js'
import StepTournament from './StepTournament.vue'
import StepTeams from './StepTeams.vue'
import StepDay from './StepDay.vue'
import StepMatches from './StepMatches.vue'
import PlanOverview from './PlanOverview.vue'

const emit = defineEmits(['generate'])
const props = defineProps({ initialData: { type: Object, default: null }, busy: Boolean, hasSchedule: Boolean, resultVersion: { type: Number, default: 0 } })

const STORAGE_KEY = 'game-scheduler-state'
const STEPS = [
  { id: 1, label: 'Turnering', hint: 'Namn och spelplaner' },
  { id: 2, label: 'Speldag', hint: 'Tider och pauser' },
  { id: 3, label: 'Lag', hint: 'Klubbar och lag' },
  { id: 4, label: 'Matcher', hint: 'Antal och vila' },
  { id: 5, label: 'Spelschema', hint: 'Granska och dela' },
]

const defaultClubs = () => normalizeClubs([
  { name: 'Klubb A', teams: [{ name: 'Lag 1' }, { name: 'Lag 2' }] },
  { name: 'Klubb B', teams: [{ name: 'Lag 1' }, { name: 'Lag 2' }] },
])
const defaultSettings = () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS))

const clubs = ref(defaultClubs())
const settings = ref(defaultSettings())
const step = ref(1)
const visited = ref(new Set([1]))
const submitted = ref(false)
const storageNotice = ref('')
const stepHeading = ref(null)

function applyInitialData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Ogiltigt utkast')
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('Ogiltiga inställningar')
  const candidateClubs = normalizeClubs(data.clubs)
  const candidateSettings = { ...defaultSettings(), ...data.settings }
  const errors = validateTournament(candidateSettings, candidateClubs)
  if (errors.length) throw new Error(errors.join(' '))
  const snapshot = snapshotTournament(candidateSettings, candidateClubs)
  clubs.value = snapshot.clubs
  settings.value = snapshot.settings
}

try {
  if (props.initialData) applyInitialData({ clubs: props.initialData.c, settings: props.initialData.s })
  else {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) applyInitialData(JSON.parse(saved))
  }
} catch {
  storageNotice.value = 'Det sparade utkastet kunde inte läsas. Standardinställningarna används.'
}

watch([clubs, settings], () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ clubs: clubs.value, settings: settings.value })) }
  catch { storageNotice.value = 'Utkastet kunde inte sparas i webbläsaren.' }
}, { deep: true })
watch(() => clubs.value.map(c => c.teams.length), sizes => {
  const biggest = Math.max(0, ...sizes)
  for (const meal of settings.value.foodBreaks) if (meal.maxTeamsPerSlot < biggest) meal.maxTeamsPerSlot = biggest
})

const errors = computed(() => validateTournament(settings.value, clubs.value))
function stepFor(message) {
  const text = message.toLocaleLowerCase('sv')
  if (/matpaus|matpass|paus|uppehåll|tider|matchlängd|återkommande|intervall/.test(text)) return 2
  if (/för stor|min matcher|max matcher|vila per lag|internmatch/.test(text)) return 4
  if (/turnering|datum|spelplan|antal rinkar|benämning/.test(text)) return 1
  if (/klubb|lag|samlade/.test(text)) return 3
  return 2
}
const errorsByStep = computed(() => {
  const map = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  for (const message of errors.value) map[stepFor(message)].push(message)
  return map
})
const totalTeams = computed(() => clubs.value.reduce((sum, c) => sum + c.teams.length, 0))
const plan = computed(() => planChecks(settings.value, clubs.value))

function stepState(id) {
  if (id === 5) return props.hasSchedule ? 'done' : 'locked'
  if (errorsByStep.value[id].length && (submitted.value || visited.value.has(id))) return 'error'
  if (visited.value.has(id) && id !== step.value) return 'done'
  return 'todo'
}
function goTo(id) {
  if (id === 5 && !props.hasSchedule) return
  if (id === step.value) return
  visited.value = new Set([...visited.value, step.value, id])
  step.value = id
  nextTick(() => stepHeading.value?.focus?.())
}
function next() { goTo(Math.min(5, step.value + 1 === 5 && !props.hasSchedule ? 4 : step.value + 1)) }
function previous() { goTo(Math.max(1, step.value - 1)) }

function applyTemplate(template) {
  Object.assign(settings.value, template.settings)
  settings.value.rinkNames = Array.from({ length: template.settings.numRinks }, (_, i) => settings.value.rinkNames?.[i] ?? '')
  const untouched = clubs.value.every(c => /^Klubb [A-Z]$/.test(c.name) && c.teams.every(t => /^Lag \d+$/.test(t.name)))
  if (untouched) {
    clubs.value = normalizeClubs(Array.from({ length: template.clubs }, (_, i) => ({
      name: `Klubb ${String.fromCharCode(65 + i)}`,
      teams: Array.from({ length: template.teamsPerClub }, (_, t) => ({ name: `Lag ${t + 1}` })),
    })))
  }
  goTo(2)
}

function handleSubmit() {
  if (props.busy) return
  submitted.value = true
  if (errors.value.length) {
    const first = Object.entries(errorsByStep.value).find(([, list]) => list.length)
    if (first) goTo(Number(first[0]))
    return
  }
  emit('generate', snapshotTournament(settings.value, clubs.value))
}

watch(() => props.resultVersion, version => { if (version > 0 && props.hasSchedule) goTo(5) })
watch(() => props.hasSchedule, has => { if (!has && step.value === 5) step.value = 4 })

defineExpose({ goTo })
</script>

<template>
  <form class="setup" @submit.prevent="handleSubmit" novalidate>
    <nav class="stepper" aria-label="Steg i planeringen">
      <button
        v-for="item in STEPS"
        :key="item.id"
        type="button"
        class="step-tab"
        :class="{ 'is-current': step === item.id, 'is-done': stepState(item.id) === 'done', 'has-error': stepState(item.id) === 'error' }"
        :aria-current="step === item.id ? 'step' : undefined"
        :aria-disabled="stepState(item.id) === 'locked'"
        :disabled="stepState(item.id) === 'locked'"
        @click="goTo(item.id)"
      >
        <span class="step-tab-index" aria-hidden="true">
          <svg v-if="stepState(item.id) === 'done'" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>
          <template v-else>{{ item.id }}</template>
        </span>
        <span class="step-tab-text"><span>{{ item.label }}</span><small>{{ item.hint }}</small></span>
        <span v-if="stepState(item.id) === 'error'" class="sr-only">, behöver rättas</span>
      </button>
    </nav>

    <p v-if="storageNotice" role="status" class="notice notice-warn" style="margin-bottom:16px">{{ storageNotice }}</p>

    <div v-show="step < 5" class="workspace">
      <div style="display:grid;gap:16px;min-width:0">
        <span ref="stepHeading" tabindex="-1" class="sr-only">Steg {{ step }} av 5: {{ STEPS[step - 1].label }}</span>
        <div v-if="(submitted || visited.has(step)) && errorsByStep[step].length" role="alert" class="notice notice-error">
          <strong>Rätta det här innan schemat kan skapas</strong>
          <ul><li v-for="message in errorsByStep[step]" :key="message">{{ message }}</li></ul>
        </div>
        <div v-show="step === 1" class="panel"><StepTournament v-model:settings="settings" @template="applyTemplate" /></div>
        <div v-show="step === 2" class="panel"><StepDay v-model:settings="settings" v-model:clubs="clubs" /></div>
        <div v-show="step === 3" class="panel"><StepTeams v-model:clubs="clubs" /></div>
        <div v-show="step === 4" class="panel"><StepMatches v-model:settings="settings" :clubs="clubs" /></div>
        <div v-if="submitted && errors.length" role="alert" class="notice notice-error">
          <strong>Något behöver rättas i ett annat steg</strong>
          <ul><li v-for="message in errors" :key="message"><button type="button" class="link-btn" @click="goTo(stepFor(message))">{{ message }}</button></li></ul>
        </div>
        <div class="step-nav">
          <button v-if="step > 1" type="button" class="btn btn-secondary" @click="previous"><svg viewBox="0 0 24 24"><path d="M19 12H5m6 6-6-6 6-6"/></svg>Tillbaka</button>
          <button v-if="step < 4" type="button" class="btn btn-primary" @click="next">Nästa: {{ STEPS[step].label }}<svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
          <button v-else type="submit" class="btn btn-primary" :disabled="busy || totalTeams < 2">Skapa spelschema<svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
        </div>
      </div>
      <PlanOverview v-model:settings="settings" :clubs="clubs" :step="step" :busy="busy" @go="goTo" />
    </div>

    <div v-show="step < 5" class="mobile-bar">
      <div class="capacity-note"><strong :class="{ 'is-good': plan.status === 'ok' }">{{ plan.headline }}</strong>Steg {{ step }} av 5 · {{ totalTeams }} lag · {{ plan.capacity.slots }} matchtider</div>
      <button v-if="step < 4" type="button" class="btn btn-primary" @click="next">Nästa</button>
      <button v-else type="submit" class="btn btn-primary" :disabled="busy || totalTeams < 2">Skapa spelschema</button>
    </div>

    <slot v-if="step === 5" name="schedule" :go-to="goTo"></slot>
  </form>
</template>
