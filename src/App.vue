<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import SetupForm from './components/SetupForm.vue'
import ScheduleView from './components/ScheduleView.vue'
import { useScheduler } from './composables/useScheduler.js'
import { useShareUrl } from './composables/useShareUrl.js'
import { useSavedSchedule } from './composables/useSavedSchedule.js'
import { validatePayload, snapshotTournament, scheduleWarnings } from './lib/tournament.js'

const { schedule, warnings, generate } = useScheduler()
const { loadFromUrl } = useShareUrl()
const savedApi = useSavedSchedule()
const currentSettings = ref(null)
const currentClubs = ref(null)
const initialData = ref(null)
const setupForm = ref(null)
const isSharedView = ref(false)
const showPdfMenu = ref(false)
const loading = ref(true)
const saving = ref(false)
const notice = ref('')
const loadError = ref('')
const saved = ref(null)
const savedLinks = ref(null)
const unsaved = ref(false)
const resultVersion = ref(0)
const DRAFT_KEY = 'game-scheduler-result'
let loadSequence = 0

const statusText = computed(() => isSharedView.value ? 'Delat schema' : saved.value ? (unsaved.value ? 'Osparade ändringar' : 'Sparat online') : 'Utkast')
const statusClass = computed(() => isSharedView.value ? 'is-public' : saved.value && !unsaved.value ? '' : 'is-draft')

function closeMenus(event) {
  if (event.type === 'click' || event.key === 'Escape') showPdfMenu.value = false
}
function applyData(data) {
  currentClubs.value = data.c
  currentSettings.value = data.s
  schedule.value = data.g
  warnings.value = scheduleWarnings(data)
}
function persistResult() {
  if (!schedule.value) return
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ c: currentClubs.value, s: currentSettings.value, g: schedule.value, w: warnings.value })) }
  catch { notice.value = 'Schemat kunde inte sparas i webbläsaren. Ladda ner en PDF för att behålla det.' }
}
const editTokenKey = id => `game-scheduler-edit:${id}`
function readEditToken(id) {
  try { return localStorage.getItem(editTokenKey(id))?.match(/^[a-f0-9]{64}$/)?.[0] ?? null } catch { return null }
}
function storeEditToken(id, token) {
  try { localStorage.setItem(editTokenKey(id), token) } catch {}
}
function forgetEditToken(id) {
  try { localStorage.removeItem(editTokenKey(id)) } catch {}
}
async function loadSchedule() {
  const sequence = ++loadSequence
  const pathname = window.location.pathname
  const fragment = window.location.hash
  loading.value = true
  saving.value = false
  loadError.value = ''
  notice.value = ''
  schedule.value = null
  currentClubs.value = null
  currentSettings.value = null
  warnings.value = []
  saved.value = null
  savedLinks.value = null
  initialData.value = null
  isSharedView.value = false
  try {
    const match = pathname.match(/^\/s\/([a-f0-9]{32})\/?$/)
    if (match) {
      const result = await savedApi.load(match[1])
      if (sequence !== loadSequence) return
      const linkToken = fragment.match(/^#edit=([a-f0-9]{64})$/)?.[1]
      if (linkToken) {
        storeEditToken(result.id, linkToken)
        history.replaceState(null, '', `/s/${result.id}`)
      }
      const token = linkToken || readEditToken(result.id)
      applyData(result.data)
      isSharedView.value = !token
      if (token) {
        saved.value = { id: result.id, version: result.version, editToken: token }
        savedLinks.value = savedApi.links(saved.value)
        initialData.value = result.data
      }
    } else if (pathname !== '/') {
      loadError.value = 'Schemalänken är ogiltig.'
    } else if (fragment.startsWith('#s=')) {
      const data = loadFromUrl()
      if (!data) throw new Error('Schemalänken är ogiltig eller för stor.')
      applyData(data)
      isSharedView.value = true
    } else {
      let draft
      try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch {}
      if (draft && validatePayload(draft)) applyData(draft)
    }
  } catch (error) { if (sequence === loadSequence) loadError.value = error.message }
  finally { if (sequence === loadSequence) loading.value = false }
  await nextTick()
  if (sequence === loadSequence && schedule.value && !isSharedView.value) resultVersion.value++
}
onMounted(() => {
  document.addEventListener('click', closeMenus)
  document.addEventListener('keydown', closeMenus)
  window.addEventListener('hashchange', loadSchedule)
  loadSchedule()
})
onUnmounted(() => {
  loadSequence++
  document.removeEventListener('click', closeMenus)
  document.removeEventListener('keydown', closeMenus)
  window.removeEventListener('hashchange', loadSchedule)
})

function handleCreateNew() { window.location.assign('/') }

async function copyLink(value) {
  try { await navigator.clipboard.writeText(value); notice.value = 'Länken är kopierad.' }
  catch { notice.value = 'Kunde inte kopiera automatiskt. Markera länken och kopiera den själv.' }
}

async function handleShare() {
  if (!schedule.value || saving.value) return
  saving.value = true
  const sequence = loadSequence
  notice.value = ''
  try {
    const result = await savedApi.save({ c: currentClubs.value, s: currentSettings.value, g: schedule.value, w: warnings.value }, saved.value)
    if (sequence !== loadSequence) return
    saved.value = { ...saved.value, ...result }
    savedLinks.value = savedApi.links(saved.value)
    unsaved.value = false
    storeEditToken(saved.value.id, saved.value.editToken)
    history.replaceState(null, '', `/s/${saved.value.id}`)
    notice.value = 'Schemat är sparat online. Skicka visningslänken till lagen och behåll redigeringslänken själv.'
  } catch (error) { if (sequence === loadSequence) notice.value = error.message }
  finally { if (sequence === loadSequence) saving.value = false }
}

async function handleDelete() {
  if (!saved.value || saving.value || !window.confirm('Ta bort det sparade schemat? Visningslänken slutar fungera. Schemat finns kvar här i webbläsaren.')) return
  saving.value = true
  const sequence = loadSequence
  try {
    await savedApi.remove(saved.value)
    if (sequence !== loadSequence) return
    forgetEditToken(saved.value.id)
    saved.value = null
    savedLinks.value = null
    unsaved.value = true
    history.replaceState(null, '', '/')
    persistResult()
    notice.value = 'Det sparade schemat är borttaget. Utkastet finns kvar i webbläsaren.'
  } catch (error) { if (sequence === loadSequence) notice.value = error.message }
  finally { if (sequence === loadSequence) saving.value = false }
}

function handleGenerate({ settings, clubs }) {
  if (saving.value || loading.value || isSharedView.value || loadError.value) return
  const snapshot = snapshotTournament(settings, clubs)
  currentSettings.value = snapshot.settings
  currentClubs.value = snapshot.clubs
  generate(snapshot.settings, snapshot.clubs)
  if (schedule.value) {
    unsaved.value = true
    if (!saved.value) history.replaceState(null, '', '/')
    persistResult()
    resultVersion.value++
    nextTick(() => document.getElementById('schedule-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}
function handleRegenerate() {
  if (currentSettings.value && currentClubs.value) handleGenerate({ settings: currentSettings.value, clubs: currentClubs.value })
}

async function handleExportPdf({ includeSummary = true } = {}) {
  showPdfMenu.value = false
  try {
    const { usePdfExport } = await import('./composables/usePdfExport.js')
    usePdfExport().exportPdf(schedule.value, currentSettings.value, currentClubs.value, { includeSummary })
  } catch { notice.value = 'PDF-filen kunde inte skapas. Försök igen.' }
}
async function handleExportClubPdf(club) {
  showPdfMenu.value = false
  try {
    const { usePdfExport } = await import('./composables/usePdfExport.js')
    usePdfExport().exportClubPdf(schedule.value, currentSettings.value, currentClubs.value, club)
  } catch { notice.value = 'Klubbens PDF kunde inte skapas. Försök igen.' }
}
async function handleExportAllClubPdfs() {
  showPdfMenu.value = false
  try {
    const { usePdfExport } = await import('./composables/usePdfExport.js')
    for (const club of currentClubs.value) usePdfExport().exportClubPdf(schedule.value, currentSettings.value, currentClubs.value, club)
    notice.value = 'PDF-filerna skapas nu. Webbläsaren kan fråga om den får ladda ner flera filer.'
  } catch { notice.value = 'Klubbens PDF kunde inte skapas. Försök igen.' }
}
</script>

<template>
  <div class="app">
    <a href="#main-content" class="skip-link">Hoppa till innehållet</a>
    <header class="topbar">
      <div class="topbar-inner">
        <a href="/" class="wordmark" aria-label="Matchplan – startsida">
          <span class="wordmark-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M3 12h18M12 4v16"/><circle cx="12" cy="12" r="2.5"/></svg></span>
          Matchplan
        </a>
        <div v-if="currentSettings?.name" class="topbar-title"><strong>{{ currentSettings.name }}</strong></div>
        <div class="topbar-actions">
          <span class="status-pill" :class="statusClass">{{ statusText }}</span>
          <button v-if="isSharedView || saved" type="button" class="btn btn-secondary btn-sm" @click="handleCreateNew">Skapa nytt schema</button>
        </div>
      </div>
    </header>

    <main id="main-content" class="main">
      <p v-if="loading" role="status" class="notice notice-info">Hämtar schemat…</p>
      <div v-if="loadError" role="alert" class="notice notice-error">
        <strong>{{ loadError }}</strong>
        <span>Länken kan vara felskriven, eller så har schemat tagits bort.</span>
        <div><button type="button" class="btn btn-secondary btn-sm" @click="handleCreateNew">Skapa ett nytt schema</button></div>
      </div>
      <p v-if="notice" role="status" aria-live="polite" class="notice notice-info" style="margin-bottom:16px">{{ notice }}</p>

      <SetupForm v-if="!loading && !loadError && !isSharedView" ref="setupForm" :initial-data="initialData" :busy="saving" :has-schedule="!!schedule" :result-version="resultVersion" @generate="handleGenerate">
        <template #schedule="{ goTo }">
          <ScheduleView
            v-if="schedule"
            :schedule="schedule" :settings="currentSettings" :clubs="currentClubs" :warnings="warnings"
            :saved="saved" :saved-links="savedLinks" :unsaved="unsaved" :saving="saving" :menu-open="showPdfMenu"
            @regenerate="handleRegenerate" @export-pdf="handleExportPdf" @export-club-pdf="handleExportClubPdf" @export-all-club-pdfs="handleExportAllClubPdfs"
            @share="handleShare" @delete="handleDelete" @copy="copyLink" @toggle-menu="showPdfMenu = !showPdfMenu" @edit="goTo(1)"
          />
        </template>
      </SetupForm>
      <ul v-if="!schedule && warnings.length && !isSharedView" role="alert" class="notice notice-warn" style="margin-top:16px"><li v-for="warning in warnings" :key="warning">{{ warning }}</li></ul>

      <ScheduleView
        v-if="isSharedView && schedule && !loading && !loadError"
        :schedule="schedule" :settings="currentSettings" :clubs="currentClubs" :warnings="warnings" shared :menu-open="showPdfMenu"
        @export-pdf="handleExportPdf" @export-club-pdf="handleExportClubPdf" @export-all-club-pdfs="handleExportAllClubPdfs" @toggle-menu="showPdfMenu = !showPdfMenu" @create-new="handleCreateNew"
      />
    </main>
    <footer class="page-footer">
      <div class="page-footer-inner">
        <span>Matchplan – spelschema för turneringsdagen.</span>
        <span>Schemat skapas i din webbläsare. Inget sparas online förrän du väljer Spara &amp; dela.</span>
      </div>
    </footer>
  </div>
</template>
