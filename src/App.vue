<script setup>
import { ref } from 'vue'
import SetupForm from './components/SetupForm.vue'
import ScheduleGrid from './components/ScheduleGrid.vue'
import ScheduleStats from './components/ScheduleStats.vue'
import { useScheduler } from './composables/useScheduler.js'
import { usePdfExport } from './composables/usePdfExport.js'

const { schedule, warnings, generate } = useScheduler()
const { exportPdf } = usePdfExport()

const currentSettings = ref(null)
const currentClubs = ref(null)
const scheduleSection = ref(null)

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
    exportPdf(schedule.value, currentSettings.value, currentClubs.value)
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
            <div class="text-xs font-medium uppercase tracking-[0.3em] text-slate-600 mb-1">Tournament Day</div>
            <h1 class="font-display text-5xl md:text-6xl tracking-wider text-white leading-none">
              GAME<span class="text-ice-400">SCHEDULER</span>
            </h1>
          </div>
          <div class="hidden sm:block h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent mb-3"></div>
          <div class="hidden sm:block text-right mb-1">
            <div class="text-xs text-slate-600 uppercase tracking-wider">Ringette & Hockey</div>
            <div class="text-xs text-slate-700">Schedule Generator</div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="max-w-6xl mx-auto px-6 py-10">
      <!-- Setup Form -->
      <SetupForm @generate="handleGenerate" />

      <!-- Schedule Output -->
      <div v-if="schedule" ref="scheduleSection" class="mt-14 pt-10 border-t border-slate-800/60">
        <div class="flex items-center justify-between mb-6">
          <h2 class="font-display text-3xl tracking-wider text-white uppercase">
            Schedule
          </h2>
          <div class="flex gap-3">
            <button
              @click="handleRegenerate"
              class="px-5 py-2.5 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 rounded-lg transition-all cursor-pointer"
            >
              <span class="mr-1.5">&#8635;</span> Regenerate
            </button>
            <button
              @click="handleExportPdf"
              class="px-5 py-2.5 text-sm font-medium bg-ice-500/15 hover:bg-ice-500/25 text-ice-300 border border-ice-500/25 hover:border-ice-500/40 rounded-lg transition-all cursor-pointer"
            >
              <span class="mr-1.5">&#8615;</span> Export PDF
            </button>
          </div>
        </div>

        <ScheduleGrid :schedule="schedule" :clubs="currentClubs" />

        <div class="mt-8">
          <ScheduleStats :schedule="schedule" :warnings="warnings" :clubs="currentClubs" />
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-slate-800/40 mt-16">
      <div class="max-w-6xl mx-auto px-6 py-6 text-center text-xs text-slate-700">
        Game Scheduler &mdash; All scheduling runs locally in your browser.
      </div>
    </footer>
  </div>
</template>
