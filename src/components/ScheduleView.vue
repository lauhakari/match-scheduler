<script setup>
import { ref, computed, watch } from 'vue'
import ScheduleGrid from './ScheduleGrid.vue'
import TeamScheduleList from './TeamScheduleList.vue'
import ScheduleStats from './ScheduleStats.vue'
import { clubColor } from '../lib/clubColors.js'

const props = defineProps({
  schedule: { type: Object, required: true },
  settings: { type: Object, required: true },
  clubs: { type: Array, required: true },
  warnings: { type: Array, default: () => [] },
  shared: Boolean,
  saved: Object,
  savedLinks: Object,
  unsaved: Boolean,
  saving: Boolean,
  menuOpen: Boolean,
})
const emit = defineEmits(['regenerate', 'export-pdf', 'export-club-pdf', 'export-all-club-pdfs', 'share', 'delete', 'copy', 'toggle-menu', 'create-new', 'edit'])

const view = ref(props.shared && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches ? 'teams' : 'grid')
const focusClub = ref('')
const focusTeam = ref('')
const includeSummary = ref(true)

const matchCount = computed(() => props.schedule.slots.reduce((count, slot) => count + slot.matches.filter(m => m.home).length, 0))
const teamCount = computed(() => props.schedule.teamStats.length)
const dateText = computed(() => {
  if (!props.settings.date) return ''
  const date = new Date(`${props.settings.date}T12:00:00`)
  return Number.isNaN(date.getTime()) ? props.settings.date : date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
})
const rinkWord = computed(() => {
  const n = props.schedule.numRinks
  const plural = { Rink: 'rinkar', Plan: 'planer', Bana: 'banor' }[props.settings.rinkLabel] || 'rinkar'
  return `${n} ${n === 1 ? (props.settings.rinkLabel || 'rink').toLowerCase() : plural}`
})
const teamOptions = computed(() => props.schedule.teamStats.filter(t => !focusClub.value || t.clubName === focusClub.value))
watch(focusClub, () => { if (focusTeam.value && !teamOptions.value.some(t => t.id === focusTeam.value)) focusTeam.value = '' })
function pickClub(name) { focusClub.value = focusClub.value === name ? '' : name }
</script>

<template>
  <section class="schedule" aria-labelledby="schedule-title">
    <div class="schedule-head settle">
      <div>
        <h1 id="schedule-title" class="display">{{ settings.name || 'Spelschema' }}</h1>
        <div class="schedule-meta">
          <span v-if="dateText"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/></svg>{{ dateText }}</span>
          <span v-if="settings.venue"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>{{ settings.venue }}</span>
          <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="num">{{ settings.startTime }}–{{ settings.endTime }}</span></span>
          <span>{{ matchCount }} matcher · {{ teamCount }} lag · {{ rinkWord }}</span>
        </div>
      </div>
      <div class="schedule-actions">
        <button v-if="!shared" type="button" class="btn btn-secondary" :disabled="saving" @click="emit('regenerate')"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>Generera om</button>
        <div class="menu-anchor">
          <button type="button" class="btn btn-secondary" :aria-expanded="menuOpen" aria-controls="pdf-menu" @click.stop="emit('toggle-menu')"><svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></svg>Ladda ner PDF<svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="m6 9 6 6 6-6"/></svg></button>
          <div v-if="menuOpen" id="pdf-menu" class="menu" @click.stop>
            <button type="button" @click="emit('export-pdf', { includeSummary })">Hela schemat</button>
            <label><input type="checkbox" v-model="includeSummary" /> Ta med matcher per lag</label>
            <div class="menu-sep"></div>
            <div class="menu-title">Schema för en klubb</div>
            <button v-for="club in clubs" :key="club.id || club.name" type="button" @click="emit('export-club-pdf', club)">{{ club.name }}</button>
            <div class="menu-sep"></div>
            <button type="button" @click="emit('export-all-club-pdfs')">Alla klubbar, en fil per klubb</button>
          </div>
        </div>
        <button v-if="!shared" type="button" class="btn btn-primary" :disabled="saving" @click="emit('share')">
          <svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/></svg>
          <template v-if="saving">Sparar…</template><template v-else-if="saved">Spara ändringar</template><template v-else>Spara &amp; dela</template>
        </button>
      </div>
    </div>

    <div v-if="savedLinks && !shared" class="share-card">
      <div class="share-card-head">
        <h2>Schemat är online</h2>
        <span class="status-pill" :class="unsaved ? 'is-draft' : ''">{{ unsaved ? 'Osparade ändringar' : 'Sparat' }}</span>
      </div>
      <p>{{ unsaved ? 'Du har ändringar som inte syns för de som har länken ännu. Spara för att uppdatera deras vy.' : 'Alla som har visningslänken ser det senast sparade schemat. Den här webbläsaren kommer ihåg redigeringslänken åt dig.' }}</p>
      <div class="share-grid">
        <div>
          <label for="public-link">Visningslänk – skicka till lagen</label>
          <div class="link-field"><input id="public-link" :value="savedLinks.publicUrl" readonly /><button type="button" class="btn btn-secondary btn-sm" @click="emit('copy', savedLinks.publicUrl)">Kopiera</button></div>
        </div>
        <div>
          <label for="edit-link">Redigeringslänk – behåll för dig själv</label>
          <div class="link-field"><input id="edit-link" :value="savedLinks.editUrl" readonly /><button type="button" class="btn btn-secondary btn-sm" @click="emit('copy', savedLinks.editUrl)">Kopiera</button></div>
        </div>
      </div>
      <p>Sparade scheman tas bort 180 dagar efter senaste ändring. Redigeringslänken är som ett lösenord: den som har den kan ändra schemat.</p>
      <button type="button" class="btn btn-ghost btn-danger btn-sm" :disabled="saving" @click="emit('delete')">Ta bort sparat schema</button>
    </div>

    <div class="toolbar">
      <div class="chip-row" role="group" aria-label="Visa matcher för">
        <button type="button" class="chip" :aria-pressed="!focusClub && !focusTeam" @click="focusClub = ''; focusTeam = ''">Alla</button>
        <button v-for="(club, i) in clubs" :key="club.id || club.name" type="button" class="chip" :style="{ '--club-color': clubColor(i).color }" :aria-pressed="focusClub === club.name" @click="pickClub(club.name)"><i aria-hidden="true"></i>{{ club.name }}</button>
        <label class="sr-only" for="team-filter">Visa ett lag</label>
        <select id="team-filter" v-model="focusTeam" class="team-select">
          <option value="">Alla lag{{ focusClub ? ` i ${focusClub}` : '' }}</option>
          <option v-for="team in teamOptions" :key="team.id" :value="team.id">{{ team.clubName }} {{ team.name }}</option>
        </select>
      </div>
      <div class="segmented" role="group" aria-label="Visning">
        <label><input type="radio" name="schedule-view" value="grid" v-model="view" /><span>Tidslinje</span></label>
        <label><input type="radio" name="schedule-view" value="teams" v-model="view" /><span>Per lag</span></label>
      </div>
    </div>

    <ScheduleGrid v-show="view === 'grid'" :schedule="schedule" :clubs="clubs" :settings="settings" :focus-team="focusTeam" :focus-club="focusClub" />
    <TeamScheduleList v-if="view === 'teams'" :schedule="schedule" :clubs="clubs" :settings="settings" :focus-team="focusTeam" :focus-club="focusClub" />
    <ScheduleStats :schedule="schedule" :warnings="warnings" :clubs="clubs" :editable="!shared" />

    <div v-if="shared" class="public-cta">
      <p>Planerar du en egen turnering? Matchplan är gratis och schemat skapas direkt i webbläsaren.</p>
      <button type="button" class="btn btn-secondary" @click="emit('create-new')">Skapa eget spelschema</button>
    </div>
    <div v-else class="public-cta">
      <p>Blev det inte som du tänkt? Ändra lagen, tiderna eller pauserna och skapa schemat igen.</p>
      <button type="button" class="btn btn-secondary" @click="emit('edit')">Ändra inställningar</button>
    </div>
  </section>
</template>
