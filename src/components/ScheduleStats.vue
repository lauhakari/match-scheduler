<script setup>
import { computed } from 'vue'
import { clubColorByName } from '../lib/clubColors.js'

const props = defineProps({ schedule: Object, warnings: Array, clubs: Array, editable: Boolean })

const belowMin = computed(() => props.schedule.teamStats.filter(t => t.belowMin).length)
const dot = name => clubColorByName(props.clubs, name).color
</script>

<template>
  <section class="stats" aria-labelledby="stats-heading">
    <div v-if="warnings.length" role="status" aria-live="polite" class="notice notice-warn">
      <strong>{{ belowMin ? `${belowMin} ${belowMin === 1 ? 'lag fick' : 'lag fick'} färre matcher än du ville` : 'Att tänka på' }}</strong>
      <ul><li v-for="(warning, i) in warnings" :key="i">{{ warning }}</li></ul>
      <span v-if="editable">Prova att skapa schemat igen, det blir olika varje gång. Hjälper inte det: förläng dagen, korta matcherna, lägg till en spelplan, sänk antalet matcher per lag eller tillåt matcher inom samma klubb.</span>
    </div>
    <div class="stats-head"><h2 id="stats-heading">Matcher per lag</h2><span>{{ schedule.teamStats.length }} lag</span></div>
    <div class="table-scroll">
      <table class="stats-table">
        <thead><tr><th scope="col">Klubb</th><th scope="col">Lag</th><th scope="col">Matcher</th><th scope="col">Status</th></tr></thead>
        <tbody>
          <tr v-for="team in schedule.teamStats" :key="team.id">
            <td><div class="club-cell"><i :style="{ background: dot(team.clubName) }" aria-hidden="true"></i>{{ team.clubName }}</div></td>
            <td><strong>{{ team.name }}</strong></td>
            <td class="games">{{ team.games }}</td>
            <td>
              <span v-if="team.belowMin" class="badge badge-warn">Färre än önskat</span>
              <span v-else-if="team.atMax" class="badge badge-max">Max antal</span>
              <span v-else class="badge badge-ok">Klart</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
