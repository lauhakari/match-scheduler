<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import SetupForm from './components/SetupForm.vue'
import ScheduleGrid from './components/ScheduleGrid.vue'
import ScheduleStats from './components/ScheduleStats.vue'
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
const scheduleSection = ref(null)
const includeSummaryInPdf = ref(true)
const isSharedView = ref(false)
const showClubPdfMenu = ref(false)
const loading = ref(true)
const saving = ref(false)
const notice = ref('')
const loadError = ref('')
const saved = ref(null)
const savedLinks = ref(null)
const unsaved = ref(false)
const DRAFT_KEY = 'game-scheduler-result'
let loadSequence = 0

const matchCount = computed(() => schedule.value?.slots.reduce((count, slot) => count + slot.matches.filter(match => match.home).length, 0) || 0)
const teamCount = computed(() => schedule.value?.teamStats.length || 0)

function closeMenus(event) {
  if (event.type === 'click' || event.key === 'Escape') showClubPdfMenu.value = false
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
  catch { notice.value = 'Schemat kunde inte sparas i webbläsaren. Exportera en PDF för att behålla det.' }
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
  if (sequence === loadSequence && isSharedView.value) scheduleSection.value?.scrollIntoView({ block: 'start' })
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
  try { await navigator.clipboard.writeText(value); notice.value = 'Länk kopierad!' }
  catch { notice.value = 'Kunde inte kopiera. Markera och kopiera länken nedan.' }
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
    notice.value = 'Schemat är sparat. Dela visningslänken och behåll redigeringslänken privat.'
  } catch (error) { if (sequence === loadSequence) notice.value = error.message }
  finally { if (sequence === loadSequence) saving.value = false }
}

async function handleDelete() {
  if (!saved.value || saving.value || !window.confirm('Ta bort det sparade schemat? Visningslänken slutar fungera. Schemat behålls som ett lokalt utkast.')) return
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
    notice.value = 'Det sparade schemat har tagits bort. Det lokala utkastet finns kvar.'
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
    setTimeout(() => scheduleSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }
}
function handleRegenerate() {
  if (currentSettings.value && currentClubs.value) handleGenerate({ settings: currentSettings.value, clubs: currentClubs.value })
}

async function handleExportPdf() {
  try {
    const { usePdfExport } = await import('./composables/usePdfExport.js')
    usePdfExport().exportPdf(schedule.value, currentSettings.value, currentClubs.value, { includeSummary: includeSummaryInPdf.value })
  } catch { notice.value = 'PDF-filen kunde inte skapas. Försök igen.' }
}
async function handleExportClubPdf(club) {
  showClubPdfMenu.value = false
  try {
    const { usePdfExport } = await import('./composables/usePdfExport.js')
    usePdfExport().exportClubPdf(schedule.value, currentSettings.value, currentClubs.value, club)
  } catch { notice.value = 'Klubb-PDF kunde inte skapas. Försök igen.' }
}
async function handleExportAllClubPdfs() {
  showClubPdfMenu.value = false
  try {
    const { usePdfExport } = await import('./composables/usePdfExport.js')
    for (const club of currentClubs.value) usePdfExport().exportClubPdf(schedule.value, currentSettings.value, currentClubs.value, club)
    notice.value = 'PDF-filerna har skapats. Webbläsaren kan be om tillåtelse att hämta flera filer.'
  } catch { notice.value = 'Klubb-PDF kunde inte skapas. Försök igen.' }
}
</script>

<template>
  <div class="app-shell">
    <a href="#main-content" class="skip-link">Hoppa till innehållet</a>
    <aside class="sidebar">
      <a href="/" class="brand" aria-label="Spelschema – startsida">
        <span class="brand-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="5" y="4" width="22" height="24" rx="7"/><path d="M5 16h22M16 4v24"/><circle cx="16" cy="16" r="4"/></svg></span>
        <span>spelschema<span class="brand-period">.</span></span>
      </a>
      <div class="sidebar-caption">DIN TURNERING</div>
      <nav aria-label="Turneringsnavigation" class="sidebar-nav">
        <a v-if="!isSharedView" href="#clubs-heading" class="nav-item is-current">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>
          Planera turneringen <span class="nav-index">01</span>
        </a>
        <a v-if="schedule" href="#schedule" class="nav-item" :class="{'is-current': isSharedView}">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h2m3 0h2"/></svg>
          Spelschema <span class="nav-index">02</span>
        </a>
        <span v-else class="nav-item nav-disabled" aria-disabled="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/></svg>Spelschema <span class="nav-index">02</span></span>
        <a v-if="schedule" href="#schedule-actions" class="nav-item"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/></svg>Exportera &amp; dela</a>
      </nav>
      <div class="sidebar-note">
        <svg class="pitch-illustration" viewBox="0 0 160 110" fill="none" aria-hidden="true"><rect x="12" y="8" width="136" height="94" rx="20"/><path d="M80 8v94M12 35h20v40H12m136-40h-20v40h20"/><circle cx="80" cy="55" r="19"/><circle cx="80" cy="55" r="3" fill="currentColor"/></svg>
        <strong>En dag. Många matcher.</strong>
        <p>Lite enklare att få ihop allt.</p>
      </div>
      <span class="sidebar-footer">För klubbar, lag och eldsjälar.</span>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <a class="mobile-brand brand" href="/" aria-label="Spelschema – startsida"><span class="brand-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="5" y="4" width="22" height="24" rx="7"/><path d="M5 16h22"/><circle cx="16" cy="16" r="4"/></svg></span><span>spelschema<span class="brand-period">.</span></span></a>
        <div class="breadcrumb"><span>Turneringsplaneraren</span><span aria-hidden="true">/</span><strong>{{ isSharedView ? 'Delat schema' : 'Din arbetsyta' }}</strong></div>
        <div class="topbar-actions"><span class="status-pill"><span class="status-dot"></span>{{ isSharedView ? 'Visningsläge' : saved ? 'Redigeringsläge' : 'Utkast' }}</span><button v-if="isSharedView || saved" @click="handleCreateNew" class="button button-secondary button-small">+ Skapa nytt schema</button></div>
      </header>

      <main id="main-content" class="main-content">
        <section class="page-intro" aria-labelledby="page-title">
          <div>
            <span class="eyebrow intro-eyebrow"><span class="small-line"></span>{{ isSharedView ? 'DAGS FÖR MATCH' : 'ALLT PÅ SAMMA SPELPLAN' }}</span>
            <h1 id="page-title">{{ isSharedView ? 'Alla matcher.' : 'Mer spel.' }}<br/><span>{{ isSharedView ? 'En gemensam plan.' : 'Mindre pussel.' }}</span></h1>
            <p>{{ isSharedView ? 'Här hittar ni tider, motståndare och rinkar. Ladda ner schemat och ta med till turneringsdagen.' : 'Från första matchen till sista slutsignalen. Planera en turneringsdag med plats för både spel och vila.' }}</p>
          </div>
          <div v-if="isSharedView && schedule" class="intro-stats"><div><strong>{{ matchCount }}</strong><span>matcher</span></div><div><strong>{{ teamCount }}</strong><span>lag</span></div><div><strong>{{ schedule.numRinks }}</strong><span>{{ schedule.numRinks === 1 ? 'rink' : 'rinkar' }}</span></div></div>
          <ol v-else class="intro-steps" aria-label="Så skapar du ett schema"><li><span>01</span><div><strong>Samla lagen</strong><small>Klubbar och deltagande lag</small></div></li><li><span>02</span><div><strong>Planera dagen</strong><small>Matcher, vila och pauser</small></div></li><li><span>03</span><div><strong>Generera &amp; dela</strong><small>En plan att samlas kring</small></div></li></ol>
        </section>

        <p v-if="loading" role="status" class="notice">Läser schemat…</p>
        <div v-if="loadError" role="alert" class="notice notice-error"><p>{{ loadError }}</p><button @click="handleCreateNew" class="button button-secondary">Skapa ett nytt schema</button></div>
        <SetupForm v-if="!loading && !loadError && !isSharedView" :initial-data="initialData" :busy="saving" @generate="handleGenerate" />
        <ul v-if="!schedule && warnings.length" role="alert" class="notice notice-warning"><li v-for="warning in warnings" :key="warning">{{ warning }}</li></ul>
        <p v-if="notice" role="status" aria-live="polite" class="notice">{{ notice }}</p>

        <section v-if="schedule && !loading && !loadError" id="schedule" ref="scheduleSection" class="schedule-section" aria-labelledby="schedule-title">
          <div class="schedule-heading"><div><span class="eyebrow">SPELPLANEN ÄR KLAR</span><h2 id="schedule-title">Spelschema</h2><p>{{ matchCount }} matcher · {{ teamCount }} lag · {{ currentSettings.startTime }}–{{ currentSettings.endTime }}</p></div><span class="schedule-tag"><span class="status-dot"></span>{{ isSharedView ? 'Delat schema' : 'Genererat schema' }}</span></div>
          <div id="schedule-actions" class="schedule-actions">
            <div class="export-actions"><button v-if="!isSharedView" @click="handleRegenerate" :disabled="saving" class="button button-secondary"><span aria-hidden="true">↻</span> Generera om</button><button @click="handleExportPdf" class="button button-secondary"><span aria-hidden="true">↓</span> Exportera PDF</button><div class="menu-anchor"><button @click.stop="showClubPdfMenu = !showClubPdfMenu" :aria-expanded="showClubPdfMenu" aria-controls="club-pdf-menu" class="button button-secondary">Klubb-PDF <span aria-hidden="true">⌄</span></button><div v-if="showClubPdfMenu" id="club-pdf-menu" @click.stop class="export-menu"><button @click="handleExportAllClubPdfs">Alla klubbar</button><button v-for="club in currentClubs" :key="club.name" @click="handleExportClubPdf(club)">{{ club.name }}</button></div></div></div>
            <button v-if="!isSharedView" @click="handleShare" :disabled="saving" class="button button-primary"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 10a4 4 0 0 1 1-3l2-2a4 4 0 0 1 6 6l-2 2m-1-3a4 4 0 0 1-1 3l-2 2a4 4 0 0 1-6-6l2-2"/></svg><template v-if="saving">Sparar…</template><template v-else-if="saved">Spara ändringar</template><template v-else>Spara &amp; dela</template></button>
          </div>
          <label class="pdf-summary-toggle"><input v-model="includeSummaryInPdf" type="checkbox"/><span>Inkludera lagsammanfattning i PDF</span></label>

          <div v-if="savedLinks && !isSharedView" class="share-card">
            <div class="share-card-heading"><div><span class="eyebrow">EN LÄNK TILL HELA DAGEN</span><h3>Dela matcherna. Behåll kontrollen.</h3></div><span class="share-state">{{ unsaved ? 'Osparade ändringar' : 'Sparat' }}</span></div>
            <p>{{ unsaved ? 'Schemat har ändringar som inte har sparats online.' : 'Visningslänken visar det senast sparade schemat.' }}</p>
            <div class="share-links-grid"><div><label for="public-link">Visningslänk – dela med deltagarna</label><div class="link-field"><input id="public-link" :value="savedLinks.publicUrl" readonly/><button @click="copyLink(savedLinks.publicUrl)" class="button button-secondary button-small">Kopiera</button></div></div><div><label for="edit-link">Redigeringslänk – behåll privat</label><div class="link-field"><input id="edit-link" :value="savedLinks.editUrl" readonly/><button @click="copyLink(savedLinks.editUrl)" class="button button-secondary button-small">Kopiera redigeringslänk</button></div></div></div>
            <p class="share-explanation">Alla med visningslänken kan läsa schemat. Redigeringslänken ger rätt att ändra det; den här webbläsaren kommer ihåg den åt dig. Sparade scheman tas bort 180 dagar efter senaste ändring. Ändra inställningarna, generera schemat och spara för att uppdatera deltagarnas länk.</p>
            <button @click="handleDelete" :disabled="saving" class="button-danger-link">Ta bort sparat schema</button>
          </div>

          <ScheduleGrid :schedule="schedule" :clubs="currentClubs" :pauses="currentSettings?.pauses || []" />
          <ScheduleStats :schedule="schedule" :warnings="warnings" :clubs="currentClubs" />
        </section>
        <footer class="page-footer"><span class="footer-brand">spelschema.</span><p>Schemat genereras i din webbläsare. När du väljer Spara &amp; dela lagras det online.</p><span>Gjort för turneringsdagen.</span></footer>
      </main>
    </div>
  </div>
</template>
