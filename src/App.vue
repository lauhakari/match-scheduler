<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
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
      const token = fragment.match(/^#edit=([a-f0-9]{64})$/)?.[1]
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
    history.replaceState(null, '', `/s/${saved.value.id}#edit=${saved.value.editToken}`)
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
  <div class="min-h-screen">
    <!-- Header -->
    <header class="relative border-b border-slate-800/60 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-ice-600/5 via-transparent to-amber-400/5"></div>
      <div class="relative max-w-6xl mx-auto px-6 py-8">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <div class="text-xs font-medium uppercase tracking-[0.3em] text-slate-600 mb-1">Turneringsdag</div>
            <h1 class="font-display text-5xl md:text-6xl tracking-wider text-white leading-none">
              SPEL<span class="text-ice-400">SCHEMA</span>
            </h1>
          </div>
          <div class="hidden sm:block h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent mb-3"></div>
          <button
            v-if="isSharedView || saved"
            @click="handleCreateNew"
            class="mb-2 px-5 py-2.5 text-sm font-medium bg-ice-500/15 hover:bg-ice-500/25 text-ice-300 border border-ice-500/25 hover:border-ice-500/40 rounded-lg transition-all cursor-pointer whitespace-nowrap"
          >
            + Skapa nytt schema
          </button>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="max-w-6xl mx-auto px-6 py-10">
      <p v-if="loading" role="status">Läser schemat…</p>
      <div v-if="loadError" role="alert" class="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4">
        <p>{{ loadError }}</p>
        <button @click="handleCreateNew" class="mt-3 text-ice-300 underline">Skapa ett nytt schema</button>
      </div>
      <!-- Setup Form (hidden in shared view) -->
      <SetupForm v-if="!loading && !loadError && !isSharedView" :initial-data="initialData" :busy="saving" @generate="handleGenerate" />
      <ul v-if="!schedule && warnings.length" role="alert" class="mt-6 rounded-xl bg-amber-400/10 p-4 text-amber-300">
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
      <p v-if="notice" role="status" aria-live="polite" class="my-4 text-sm text-ice-200">{{ notice }}</p>

      <!-- Schedule Output -->
      <div v-if="schedule && !loading && !loadError" ref="scheduleSection" :class="isSharedView ? 'mt-4' : 'mt-14 pt-10 border-t border-slate-800/60'">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 class="font-display text-3xl tracking-wider text-white uppercase">
            Spelschema
          </h2>
          <div class="flex flex-wrap items-center gap-3">
            <button
              v-if="!isSharedView"
              @click="handleRegenerate"
              :disabled="saving"
              class="px-5 py-2.5 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 rounded-lg transition-all cursor-pointer"
            >
              <span class="mr-1.5">&#8635;</span> Generera om
            </button>
            <label class="flex items-center gap-2 cursor-pointer group mr-1">
              <div class="relative">
                <input
                  v-model="includeSummaryInPdf"
                  type="checkbox"
                  class="sr-only peer"
                />
                <div class="w-8 h-4 bg-slate-700 rounded-full peer-checked:bg-ice-500/60 transition-colors"></div>
                <div class="absolute left-0.5 top-0.5 w-3 h-3 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
              </div>
              <span class="text-xs text-slate-500 group-hover:text-slate-400 transition-colors">Lagsammanfattning</span>
            </label>
            <button
              @click="handleExportPdf"
              class="px-5 py-2.5 text-sm font-medium bg-ice-500/15 hover:bg-ice-500/25 text-ice-300 border border-ice-500/25 hover:border-ice-500/40 rounded-lg transition-all cursor-pointer"
            >
              <span class="mr-1.5">&#8615;</span> Exportera PDF
            </button>
            <div class="relative">
              <button
                @click.stop="showClubPdfMenu = !showClubPdfMenu"
                :aria-expanded="showClubPdfMenu"
                aria-controls="club-pdf-menu"
                class="px-5 py-2.5 text-sm font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/25 hover:border-emerald-500/40 rounded-lg transition-all cursor-pointer"
              >
                <span class="mr-1.5">&#8615;</span> Klubb-PDF
              </button>
              <div
                v-if="showClubPdfMenu"
                id="club-pdf-menu"
                @click.stop
                class="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 min-w-[180px] py-1"
              >
                <button
                  @click="handleExportAllClubPdfs"
                  class="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer border-b border-slate-700"
                >
                  Alla klubbar
                </button>
                <button
                  v-for="club in currentClubs"
                  :key="club.name"
                  @click="handleExportClubPdf(club)"
                  class="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  {{ club.name }}
                </button>
              </div>
            </div>
            <button
              v-if="!isSharedView"
              @click="handleShare"
              :disabled="saving"
              class="px-5 py-2.5 text-sm font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 hover:border-amber-500/40 rounded-lg transition-all cursor-pointer"
            >
              <span class="mr-1.5">&#128279;</span>
              <template v-if="saving">Sparar…</template>
              <template v-else-if="saved">Spara ändringar</template>
              <template v-else>Spara &amp; dela</template>
            </button>
          </div>
        </div>

        <div v-if="savedLinks && !isSharedView" class="mb-6 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <p class="text-sm text-slate-300">{{ unsaved ? 'Schemat har ändringar som inte har sparats online.' : 'Visningslänken visar det senast sparade schemat.' }}</p>
          <label for="public-link" class="block text-sm text-slate-400">Visningslänk – dela med deltagarna</label>
          <div class="flex flex-wrap gap-2">
            <input id="public-link" :value="savedLinks.publicUrl" readonly class="min-w-0 flex-1 rounded bg-slate-800 p-2 text-sm" />
            <button @click="copyLink(savedLinks.publicUrl)" class="rounded bg-slate-700 px-3 py-2 text-sm">Kopiera</button>
          </div>
          <label for="edit-link" class="block text-sm text-slate-400">Redigeringslänk – behåll privat och spara för framtida ändringar</label>
          <div class="flex flex-wrap gap-2">
            <input id="edit-link" :value="savedLinks.editUrl" readonly class="min-w-0 flex-1 rounded bg-slate-800 p-2 text-sm" />
            <button @click="copyLink(savedLinks.editUrl)" class="rounded bg-slate-700 px-3 py-2 text-sm">Kopiera redigeringslänk</button>
          </div>
          <p class="text-xs text-slate-400">Alla med visningslänken kan läsa schemat. Redigeringslänken ger rätt att ändra det. Ändra inställningarna, generera schemat och spara för att uppdatera deltagarnas länk.</p>
          <button @click="handleDelete" :disabled="saving" class="text-sm text-rose-300 underline">Ta bort sparat schema</button>
        </div>

        <ScheduleGrid :schedule="schedule" :clubs="currentClubs" :pauses="currentSettings?.pauses || []" />

        <div class="mt-8">
          <ScheduleStats :schedule="schedule" :warnings="warnings" :clubs="currentClubs" />
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-slate-800/40 mt-16">
      <div class="max-w-6xl mx-auto px-6 py-6 text-center text-xs text-slate-700">
        Spelschema &mdash; Schemat genereras i din webbläsare. När du väljer Spara &amp; dela lagras det online.
      </div>
    </footer>
  </div>
</template>
