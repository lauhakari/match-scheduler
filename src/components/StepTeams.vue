<script setup>
import { ref, computed } from 'vue'
import { normalizeClubs, parseTeamList } from '../lib/tournament.js'
import { clubColor } from '../lib/clubColors.js'

const clubs = defineModel('clubs', { type: Array, required: true })
const showImport = ref(false)
const importText = ref('')
const importError = ref('')
const dragIndex = ref(null)

const totalTeams = computed(() => clubs.value.reduce((sum, c) => sum + c.teams.length, 0))
const importPreview = computed(() => parseTeamList(importText.value))

function addClub() {
  let n = 0
  while (clubs.value.some(c => c.name === `Klubb ${String.fromCharCode(65 + n)}`)) n++
  clubs.value.push(...normalizeClubs([{ name: `Klubb ${String.fromCharCode(65 + n)}`, teams: [{ name: 'Lag 1' }] }]))
}
function removeClub(index) { clubs.value.splice(index, 1) }
function moveClub(index, direction) {
  const target = index + direction
  if (target < 0 || target >= clubs.value.length) return
  const [club] = clubs.value.splice(index, 1)
  clubs.value.splice(target, 0, club)
}
function addTeam(club) {
  let n = 1
  while (club.teams.some(t => t.name === `Lag ${n}`)) n++
  club.teams.push({ id: crypto.randomUUID(), name: `Lag ${n}` })
}
function removeTeam(club, index) { club.teams.splice(index, 1) }

function onDragStart(index) { dragIndex.value = index }
function onDragOver(event, index) {
  event.preventDefault()
  if (dragIndex.value === null || dragIndex.value === index) return
  const [club] = clubs.value.splice(dragIndex.value, 1)
  clubs.value.splice(index, 0, club)
  dragIndex.value = index
}
function onDragEnd() { dragIndex.value = null }

function applyImport(mode) {
  importError.value = ''
  const parsed = importPreview.value
  if (!parsed.length) { importError.value = 'Skriv minst en rad med ett klubbnamn.'; return }
  try {
    const incoming = normalizeClubs(parsed)
    if (mode === 'replace') clubs.value.splice(0, clubs.value.length, ...incoming)
    else {
      for (const club of incoming) {
        const existing = clubs.value.find(c => c.name.trim().toLocaleLowerCase('sv') === club.name.trim().toLocaleLowerCase('sv'))
        if (!existing) { clubs.value.push(club); continue }
        for (const team of club.teams) if (!existing.teams.some(t => t.name.trim().toLocaleLowerCase('sv') === team.name.trim().toLocaleLowerCase('sv'))) existing.teams.push(team)
      }
    }
    importText.value = ''
    showImport.value = false
  } catch (error) { importError.value = error.message }
}
</script>

<template>
  <div class="step-panel">
    <div class="step-head">
      <h2 class="display">Vilka lag är med?</h2>
      <p class="lead">Lägg upp klubbarna och lagen i dem. Lag från samma klubb möter inte varandra om du inte tillåter det i nästa steg. Ordningen styr vilka klubbar som får första matpasset.</p>
    </div>

    <div class="club-list">
      <div
        v-for="(club, ci) in clubs"
        :key="club.id"
        class="club"
        :class="{ 'is-dragging': dragIndex === ci }"
        :style="{ '--club-color': clubColor(ci).color }"
        draggable="true"
        @dragstart="onDragStart(ci)"
        @dragover="onDragOver($event, ci)"
        @dragend="onDragEnd"
      >
        <div class="club-head">
          <span class="club-swatch" aria-hidden="true"></span>
          <label :for="`club-name-${ci}`" class="sr-only">Klubbnamn {{ ci + 1 }}</label>
          <input :id="`club-name-${ci}`" :name="`club-name-${ci}`" v-model="club.name" type="text" placeholder="Klubbnamn" autocomplete="organization" maxlength="100" />
          <div class="club-tools">
            <button type="button" class="icon-btn" :disabled="ci === 0" @click="moveClub(ci, -1)" :aria-label="`Flytta ${club.name || 'klubben'} upp`" title="Flytta upp"><svg viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>
            <button type="button" class="icon-btn" :disabled="ci === clubs.length - 1" @click="moveClub(ci, 1)" :aria-label="`Flytta ${club.name || 'klubben'} ned`" title="Flytta ned"><svg viewBox="0 0 24 24"><path d="M12 5v14m6-6-6 6-6-6"/></svg></button>
            <button v-if="clubs.length > 1" type="button" class="icon-btn is-danger" @click="removeClub(ci)" :aria-label="`Ta bort ${club.name || 'klubben'}`" title="Ta bort klubben"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
          </div>
        </div>
        <div class="club-body">
          <fieldset style="display:contents">
            <legend class="sr-only">Lag i {{ club.name || `klubb ${ci + 1}` }}</legend>
            <div v-for="(team, ti) in club.teams" :key="team.id" class="team-row">
              <span aria-hidden="true">{{ ti + 1 }}</span>
              <label :for="`team-name-${ci}-${ti}`" class="sr-only">Lagnamn {{ ti + 1 }}</label>
              <input :id="`team-name-${ci}-${ti}`" :name="`team-name-${ci}-${ti}`" v-model="team.name" type="text" placeholder="Lagnamn" maxlength="100" />
              <button v-if="club.teams.length > 1" type="button" class="icon-btn is-danger" @click="removeTeam(club, ti)" :aria-label="`Ta bort ${team.name || `lag ${ti + 1}`}`"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
              <span v-else aria-hidden="true"></span>
            </div>
          </fieldset>
          <div class="club-foot">
            <button type="button" class="btn btn-ghost btn-sm" @click="addTeam(club)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Lägg till lag</button>
            <label class="check" :title="`Samla ${club.name || 'klubbens'} matcher tätare i tid, för lag som reser långt`">
              <input type="checkbox" v-model="club.cluster" :name="`club-cluster-${ci}`" />
              <strong>Reser långt – samla matcherna</strong>
            </label>
          </div>
        </div>
      </div>
    </div>

    <button type="button" class="add-club" @click="addClub" :disabled="clubs.length >= 20"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Lägg till klubb</button>

    <div class="step-section">
      <button type="button" class="disclosure" :aria-expanded="showImport" aria-controls="import-panel" @click="showImport = !showImport"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>Klistra in en lista med lag i stället</button>
      <div v-if="showImport" id="import-panel" class="import-box">
        <p class="help">En klubb per rad. Skriv kolon och lagen efter, åtskilda med kommatecken. En rad utan lag blir en klubb med ett lag.</p>
        <pre>Hammarby: Vit, Grön
AIK: Lag 1, Lag 2, Lag 3
Djurgården</pre>
        <div class="field">
          <label for="import-text">Lista</label>
          <textarea id="import-text" name="import-text" v-model="importText" rows="5" spellcheck="false"></textarea>
        </div>
        <p v-if="importPreview.length" class="help">Blir {{ importPreview.length }} {{ importPreview.length === 1 ? 'klubb' : 'klubbar' }} med {{ importPreview.reduce((s, c) => s + c.teams.length, 0) }} lag.</p>
        <p v-if="importError" class="notice notice-error" role="alert">{{ importError }}</p>
        <div class="import-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="applyImport('append')">Lägg till i listan</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="applyImport('replace')">Ersätt alla klubbar</button>
        </div>
      </div>
    </div>

    <p class="help">{{ totalTeams }} lag i {{ clubs.length }} {{ clubs.length === 1 ? 'klubb' : 'klubbar' }}. Plats för upp till 20 klubbar och 80 lag. Dra klubbarna eller använd pilarna för att ändra ordning.</p>
  </div>
</template>
