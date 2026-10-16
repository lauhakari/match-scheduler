<script setup>
import { computed } from 'vue'
import { planChecks, dayStrip } from '../lib/planChecks.js'

const settings = defineModel('settings', { type: Object, required: true })
const props = defineProps({
  clubs: { type: Array, required: true },
  step: { type: Number, required: true },
  busy: Boolean,
})
const emit = defineEmits(['go'])

const teamCount = computed(() => props.clubs.reduce((sum, c) => sum + c.teams.length, 0))
const plan = computed(() => planChecks(settings.value, props.clubs))
const capacity = computed(() => plan.value.capacity)
const strip = computed(() => dayStrip(settings.value, capacity.value))
const usedCells = computed(() => strip.value.reduce((sum, row) => sum + row.cells.filter(c => c.kind === 'match').length, 0))
const rinkWord = computed(() => {
  const n = settings.value.numRinks
  const plural = { Rink: 'rinkar', Plan: 'planer', Bana: 'banor' }[settings.value.rinkLabel] || 'rinkar'
  return `${n} ${n === 1 ? (settings.value.rinkLabel || 'rink').toLowerCase() : plural}`
})
const dateText = computed(() => {
  if (!settings.value.date) return ''
  const date = new Date(`${settings.value.date}T12:00:00`)
  return Number.isNaN(date.getTime()) ? settings.value.date : date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'long' })
})
const pauseText = computed(() => {
  const meals = settings.value.foodBreaks.length, pauses = settings.value.pauses.length
  if (!meals && !pauses) return 'inga pauser'
  return [meals ? `${meals} ${meals === 1 ? 'matpaus' : 'matpauser'}` : '', pauses ? `${pauses} uppehåll` : ''].filter(Boolean).join(', ')
})
const canGenerate = computed(() => !props.busy && teamCount.value >= 2)

function applyFix(fix) {
  if (fix.go) { emit('go', fix.go); return }
  Object.assign(settings.value, fix.patch)
}
</script>

<template>
  <aside class="panel overview" :class="`is-${plan.status}`" aria-labelledby="overview-heading">
    <div class="check-head">
      <h2 id="overview-heading">
        <i aria-hidden="true">
          <svg v-if="plan.status === 'ok'" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>
          <svg v-else-if="plan.status === 'warn'" viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/></svg>
          <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </i>{{ plan.headline }}
      </h2>
      <p aria-live="polite">{{ plan.summary }}</p>
    </div>

    <div v-if="capacity.slots && teamCount >= 2" class="numbers">
      <div><b class="num">{{ capacity.gamesPerTeam }}</b><small>matcher per lag</small></div>
      <div><b class="num">{{ capacity.totalGames ?? 0 }}</b><small>matcher totalt</small></div>
      <div><b class="num">{{ capacity.endEstimate || '–' }}</b><small>beräknat slut</small></div>
    </div>

    <div v-if="strip.length" class="strip">
      <div class="strip-head"><b>Dagen i korthet</b><span>{{ usedCells }} av {{ capacity.slots }} matchtider används</span></div>
      <div class="strip-axis"><span></span><div><span class="num">{{ settings.startTime }}</span><span class="num">{{ capacity.timeline.endOfPlay }}</span></div></div>
      <div v-for="row in strip" :key="row.name" class="strip-row">
        <span class="strip-label">{{ row.name }}</span>
        <div class="cells" :style="{ '--cells': row.cells.length }"><i v-for="(cell, i) in row.cells" :key="i" :class="cell.kind" :title="cell.title"></i></div>
      </div>
      <div class="legend"><span class="m">Match</span><span class="p">Paus</span><span class="f">Ledig</span></div>
    </div>

    <div v-if="plan.checks.length" class="checks">
      <h3>Kontroller</h3>
      <div v-for="check in plan.checks" :key="check.id" class="check-item" :class="`is-${check.level}`">
        <svg v-if="check.level === 'ok'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/></svg>
        <svg v-else viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <div>
          {{ check.text }}
          <div v-if="check.fixes.length" class="fixes">
            <button v-for="fix in check.fixes" :key="fix.label" type="button" class="btn btn-fix" @click="applyFix(fix)">{{ fix.label }}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="ov-list">
      <button type="button" class="ov-item" @click="emit('go', 1)">
        <span class="ov-label">Turnering</span>
        <span class="ov-value" :class="{ 'is-empty': !settings.name }">{{ settings.name || 'Namn saknas' }}{{ dateText ? ` · ${dateText}` : '' }}</span>
        <span class="edit-hint" aria-hidden="true">Ändra</span>
      </button>
      <button type="button" class="ov-item" @click="emit('go', 2)">
        <span class="ov-label">Speldag</span>
        <span class="ov-value num">{{ settings.startTime }}–{{ settings.endTime }} · {{ settings.matchLength }} min · {{ pauseText }}</span>
        <span class="edit-hint" aria-hidden="true">Ändra</span>
      </button>
      <button type="button" class="ov-item" @click="emit('go', 3)">
        <span class="ov-label">Lag</span>
        <span class="ov-value" :class="{ 'is-empty': teamCount < 2 }">{{ teamCount }} lag i {{ clubs.length }} {{ clubs.length === 1 ? 'klubb' : 'klubbar' }} · {{ rinkWord }}</span>
        <span class="edit-hint" aria-hidden="true">Ändra</span>
      </button>
      <button type="button" class="ov-item" @click="emit('go', 4)">
        <span class="ov-label">Matcher</span>
        <span class="ov-value">{{ settings.minGames === settings.maxGames ? settings.minGames : `${settings.minGames}–${settings.maxGames}` }} per lag · {{ settings.minRest }} min vila</span>
        <span class="edit-hint" aria-hidden="true">Ändra</span>
      </button>
    </div>
    <div class="ov-action">
      <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="!canGenerate" :aria-disabled="!canGenerate">
        <svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>Skapa spelschema
      </button>
      <p class="help">Räknas om medan du skriver. Du kan ändra allt och skapa om schemat efteråt.</p>
    </div>
  </aside>
</template>
