<script setup>
import { ref, onMounted, nextTick } from 'vue'
import SetupForm from './components/SetupForm.vue'
import ScheduleGrid from './components/ScheduleGrid.vue'
import ScheduleStats from './components/ScheduleStats.vue'
import { useScheduler } from './composables/useScheduler.js'
import { usePdfExport } from './composables/usePdfExport.js'
import { useShareUrl } from './composables/useShareUrl.js'

const { schedule, warnings, generate } = useScheduler()
const { exportPdf } = usePdfExport()
const { loadFromUrl, shareSchedule } = useShareUrl()

const currentSettings = ref(null)
const currentClubs = ref(null)
const scheduleSection = ref(null)
const includeSummaryInPdf = ref(true)
const shareStatus = ref(null)
const isSharedView = ref(false)

onMounted(async () => {
  const data = loadFromUrl()
  if (data) {
    currentClubs.value = data.c
    currentSettings.value = data.s
    schedule.value = data.g
    isSharedView.value = true
    await nextTick()
    scheduleSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})

function handleCreateNew() {
  window.open(window.location.origin + window.location.pathname, '_blank')
}

async function handleShare() {
  if (!schedule.value || !currentSettings.value || !currentClubs.value) return
  try {
    await shareSchedule(currentClubs.value, currentSettings.value, schedule.value)
    shareStatus.value = 'copied'
    setTimeout(() => { shareStatus.value = null }, 2500)
  } catch {
    shareStatus.value = 'error'
    setTimeout(() => { shareStatus.value = null }, 2500)
  }
}

function handleGenerate({ settings, clubs }) {
  currentSettings.value = settings
  currentClubs.value = clubs
  generate(settings, clubs)

  if (schedule.value) {
    setTimeout(() => {
      scheduleSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
}

function handleRegenerate() {
  if (currentSettings.value && currentClubs.value) {
    generate(currentSettings.value, currentClubs.value)
  }
}

function handleExportPdf() {
  if (schedule.value && currentSettings.value && currentClubs.value) {
    exportPdf(schedule.value, currentSettings.value, currentClubs.value, { includeSummary: includeSummaryInPdf.value })
  }
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Header -->
    <header class="relative border-b border-slate-800/60 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-ice-600/5 via-transparent to-amber-400/5"></div>
      <div class="relative max-w-6xl mx-auto px-6 py-8">
        <div class="flex items-end gap-4">
          <div>
            <div class="text-xs font-medium uppercase tracking-[0.3em] text-slate-600 mb-1">Turneringsdag</div>
            <h1 class="font-display text-5xl md:text-6xl tracking-wider text-white leading-none">
              SPEL<span class="text-ice-400">SCHEMA</span>
            </h1>
          </div>
          <div class="hidden sm:block h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent mb-3"></div>
          <button
            v-if="isSharedView"
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
      <!-- Setup Form (hidden in shared view) -->
      <SetupForm v-if="!isSharedView" @generate="handleGenerate" />

      <!-- Schedule Output -->
      <div v-if="schedule" ref="scheduleSection" :class="isSharedView ? 'mt-4' : 'mt-14 pt-10 border-t border-slate-800/60'">
        <div class="flex items-center justify-between mb-6">
          <h2 class="font-display text-3xl tracking-wider text-white uppercase">
            Spelschema
          </h2>
          <div class="flex gap-3">
            <button
              v-if="!isSharedView"
              @click="handleRegenerate"
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
            <button
              v-if="!isSharedView"
              @click="handleShare"
              class="px-5 py-2.5 text-sm font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 hover:border-amber-500/40 rounded-lg transition-all cursor-pointer"
            >
              <span class="mr-1.5">&#128279;</span>
              <template v-if="shareStatus === 'copied'">Lank kopierad!</template>
              <template v-else-if="shareStatus === 'error'">Kunde inte kopiera</template>
              <template v-else>Dela schema</template>
            </button>
          </div>
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
        Spelschema &mdash; All schemaläggning sker lokalt i din webbläsare.
      </div>
    </footer>
  </div>
</template>
