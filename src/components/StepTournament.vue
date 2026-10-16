<script setup>
import { computed } from 'vue'
import { RINK_LABELS } from '../lib/tournament.js'

const settings = defineModel('settings', { type: Object, required: true })
const emit = defineEmits(['template'])

const TEMPLATES = [
  { name: 'Liten cup', detail: '4 lag · 1 rink · 09–13', settings: { startTime: '09:00', endTime: '13:00', matchLength: 15, breakLength: 5, numRinks: 1, minGames: 3, maxGames: 3, minRest: 20 }, clubs: 4, teamsPerClub: 1 },
  { name: 'Poolspel', detail: '8 lag · 2 rinkar · 09–16', settings: { startTime: '09:00', endTime: '16:00', matchLength: 20, breakLength: 5, numRinks: 2, minGames: 4, maxGames: 5, minRest: 30 }, clubs: 4, teamsPerClub: 2 },
  { name: 'Stor turnering', detail: '16 lag · 3 rinkar · 08–18', settings: { startTime: '08:00', endTime: '18:00', matchLength: 20, breakLength: 5, numRinks: 3, minGames: 4, maxGames: 6, minRest: 30 }, clubs: 8, teamsPerClub: 2 },
]

const rinkLabelPlural = computed(() => ({ Rink: 'rinkar', Plan: 'planer', Bana: 'banor' })[settings.value.rinkLabel] || 'rinkar')

function setRinks(value) {
  const count = Math.min(10, Math.max(1, Number(value) || 1))
  settings.value.numRinks = count
  settings.value.rinkNames = Array.from({ length: count }, (_, i) => settings.value.rinkNames?.[i] ?? '')
}
function setRinkName(index, value) {
  const names = Array.from({ length: settings.value.numRinks }, (_, i) => settings.value.rinkNames?.[i] ?? '')
  names[index] = value
  settings.value.rinkNames = names
}
</script>

<template>
  <div class="step-panel">
    <div class="step-head">
      <h2 class="display">Vilken turnering planerar vi?</h2>
      <p class="lead">Namn, datum och plats visas överst på schemat och i PDF:en som delas med lagen. Allt här går att fylla i senare.</p>
    </div>

    <div class="field-grid">
      <div class="field span-2">
        <label for="tournament-name">Turneringens namn</label>
        <input id="tournament-name" name="tournament-name" v-model="settings.name" type="text" maxlength="80" placeholder="t.ex. Höstcupen U11" autocomplete="off" />
      </div>
      <div class="field">
        <label for="tournament-date">Datum</label>
        <input id="tournament-date" name="tournament-date" v-model="settings.date" type="date" />
      </div>
      <div class="field">
        <label for="tournament-venue">Plats</label>
        <input id="tournament-venue" name="tournament-venue" v-model="settings.venue" type="text" maxlength="100" placeholder="t.ex. Lillhallen" autocomplete="off" />
      </div>
    </div>

    <div class="step-section">
      <h3>Spelplaner</h3>
      <p class="help">Hur många matcher kan spelas samtidigt? Varje spelplan får en egen kolumn i schemat.</p>
      <div class="field-grid">
        <div class="field">
          <span class="field-label" id="rink-label-heading">Vad kallar ni dem?</span>
          <div class="segmented" role="radiogroup" aria-labelledby="rink-label-heading">
            <label v-for="label in RINK_LABELS" :key="label">
              <input type="radio" name="rink-label" :value="label" v-model="settings.rinkLabel" />
              <span>{{ label }}</span>
            </label>
          </div>
        </div>
        <div class="field">
          <label for="num-rinks">Antal {{ rinkLabelPlural }}</label>
          <div class="stepper-count">
            <button type="button" :disabled="settings.numRinks <= 1" @click="setRinks(settings.numRinks - 1)" aria-label="Färre spelplaner">−</button>
            <input id="num-rinks" name="num-rinks" :value="settings.numRinks" @input="setRinks($event.target.value)" type="number" min="1" max="10" inputmode="numeric" />
            <button type="button" :disabled="settings.numRinks >= 10" @click="setRinks(settings.numRinks + 1)" aria-label="Fler spelplaner">+</button>
          </div>
        </div>
      </div>
      <div v-if="settings.numRinks > 1 || settings.rinkNames?.[0]" class="field-grid cols-3">
        <div v-for="index in settings.numRinks" :key="index" class="field">
          <label :for="`rink-name-${index}`">Namn på {{ settings.rinkLabel.toLowerCase() }} {{ index }} <span class="help" style="display:inline;font-weight:400">(valfritt)</span></label>
          <input :id="`rink-name-${index}`" :name="`rink-name-${index}`" :value="settings.rinkNames?.[index - 1] ?? ''" @input="setRinkName(index - 1, $event.target.value)" type="text" maxlength="40" :placeholder="`${settings.rinkLabel} ${index}`" />
        </div>
      </div>
    </div>

    <div class="step-section">
      <h3>Snabbstart</h3>
      <p class="help">Fyll i speldag och spelplaner efter en vanlig turneringsform. Du kan ändra allt efteråt.</p>
      <div class="template-row">
        <button v-for="template in TEMPLATES" :key="template.name" type="button" class="template-chip" @click="emit('template', template)">
          <strong>{{ template.name }}</strong><span>{{ template.detail }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
