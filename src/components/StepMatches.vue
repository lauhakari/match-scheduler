<script setup>
import { computed } from 'vue'
import { estimateCapacity } from '../lib/tournament.js'

const settings = defineModel('settings', { type: Object, required: true })
const props = defineProps({ clubs: { type: Array, default: () => [] } })

const capacity = computed(() => estimateCapacity(settings.value, props.clubs))
</script>

<template>
  <div class="step-panel">
    <div class="step-head">
      <h2 class="display">Hur många matcher ska lagen spela?</h2>
      <p class="lead">Schemat försöker ge alla lag minst det lägre antalet och aldrig fler än det högre. Två lag möts högst en gång.</p>
    </div>

    <div class="field-grid cols-3">
      <div class="field">
        <label for="min-games">Minst</label>
        <div class="field-unit"><input id="min-games" name="min-games" v-model.number="settings.minGames" type="number" min="1" max="20" inputmode="numeric" /><span>matcher</span></div>
      </div>
      <div class="field">
        <label for="max-games">Högst</label>
        <div class="field-unit"><input id="max-games" name="max-games" v-model.number="settings.maxGames" type="number" min="1" max="20" inputmode="numeric" /><span>matcher</span></div>
      </div>
      <div class="field">
        <label for="min-rest">Minsta vila mellan två matcher</label>
        <div class="field-unit"><input id="min-rest" name="min-rest" v-model.number="settings.minRest" type="number" min="0" max="120" inputmode="numeric" /><span>min</span></div>
      </div>
    </div>
    <label class="check">
      <input id="allow-inter-club" name="allow-inter-club" v-model="settings.allowInterClub" type="checkbox" />
      <div><strong>Tillåt matcher inom samma klubb</strong><span>Annars möter lagen bara lag från andra klubbar.</span></div>
    </label>

    <div class="notice" :class="capacity.enough ? 'notice-good' : 'notice-warn'" aria-live="polite">
      <strong v-if="!capacity.slots">Fyll i giltiga tider i steget Speldag för att se hur mycket som ryms.</strong>
      <template v-else>
        <strong>Dagen rymmer {{ capacity.rounds }} omgångar, alltså {{ capacity.slots }} matchtider{{ capacity.pausedMinutes ? ' när pauserna är avdragna' : '' }}.</strong>
        <span v-if="capacity.teams < 2">Lägg till minst två lag för att se hur många matcher var och en kan få.</span>
        <span v-else-if="capacity.enough">Det räcker till ungefär {{ capacity.gamesPerTeam }} matcher per lag för {{ capacity.teams }} lag. Uppskattning – schemat kan ge något färre.</span>
        <span v-else>Det räcker bara till ungefär {{ capacity.gamesPerTeam }} {{ capacity.gamesPerTeam === 1 ? 'match' : 'matcher' }} per lag för {{ capacity.teams }} lag, men du vill ge minst {{ settings.minGames }}. Prova en längre dag, kortare matcher, fler spelplaner eller färre matcher per lag.</span>
      </template>
    </div>
  </div>
</template>
