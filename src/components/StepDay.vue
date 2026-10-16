<script setup>
import { computed } from 'vue'
import StepBreaks from './StepBreaks.vue'

const settings = defineModel('settings', { type: Object, required: true })
const clubs = defineModel('clubs', { type: Array, required: true })

const slotLength = computed(() => (settings.value.matchLength || 0) + (settings.value.breakLength || 0))
</script>

<template>
  <div class="step-panel">
    <div class="step-head">
      <h2 class="display">Hur ser speldagen ut?</h2>
      <p class="lead">När börjar och slutar dagen, hur lång är en match, och när är det lunch eller spolning? Lagen lägger du in i nästa steg.</p>
    </div>

    <div class="field-grid">
      <div class="field">
        <label for="start-time">Första matchen börjar</label>
        <input id="start-time" name="start-time" v-model="settings.startTime" type="time" required />
      </div>
      <div class="field">
        <label for="end-time">Sista matchen är slut senast</label>
        <input id="end-time" name="end-time" v-model="settings.endTime" type="time" required />
      </div>
      <div class="field">
        <label for="match-length">Matchlängd</label>
        <div class="field-unit"><input id="match-length" name="match-length" v-model.number="settings.matchLength" type="number" min="5" max="120" inputmode="numeric" /><span>min</span></div>
        <p class="help">Hela matchen inklusive periodpauser.</p>
      </div>
      <div class="field">
        <label for="break-length">Tid mellan matcherna</label>
        <div class="field-unit"><input id="break-length" name="break-length" v-model.number="settings.breakLength" type="number" min="0" max="60" inputmode="numeric" /><span>min</span></div>
        <p class="help">Byte av lag och uppvärmning. Varje matchtid blir {{ slotLength }} minuter.</p>
      </div>
    </div>

    <div class="step-section">
      <h3>Pauser under dagen</h3>
      <p class="help">Valfritt. Inga matcher planeras in medan en paus stoppar spelet. En matpaus låter klubbarna äta i omgångar medan de andra spelar vidare.</p>
      <StepBreaks v-model:settings="settings" v-model:clubs="clubs" />
    </div>
  </div>
</template>
