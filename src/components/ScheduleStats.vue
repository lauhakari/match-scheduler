<script setup>
const props = defineProps({
  schedule: Object,
  warnings: Array,
  clubs: Array,
})

const CLUB_DOT_COLORS = ['#3159e8', '#227d72', '#b9792d', '#975273', '#745ea3', '#397e99']

function getDotColor(clubName) {
  const idx = props.clubs.findIndex(c => c.name === clubName)
  return CLUB_DOT_COLORS[idx % CLUB_DOT_COLORS.length]
}
</script>

<template>
  <div class="stats-section">
    <div v-if="warnings.length > 0" role="status" aria-live="polite" class="stats-warning">
      <strong>Varningar</strong>
      <ul><li v-for="(warning, i) in warnings" :key="i">{{ warning }}</li></ul>
    </div>
    <div class="stats-heading"><h3>Lagsammanfattning</h3><span>{{ schedule.teamStats.length }} lag</span></div>
    <div class="table-scroll">
      <table class="team-stats-table">
        <thead><tr><th>Klubb</th><th>Lag</th><th>Matcher</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="team in schedule.teamStats" :key="team.id">
            <td><div class="club-cell"><span class="w-2 h-2 rounded-full shrink-0" :style="{ background: getDotColor(team.clubName) }"></span>{{ team.clubName }}</div></td>
            <td class="team-name">{{ team.name }}</td>
            <td class="game-count">{{ team.games }}</td>
            <td>
              <span v-if="team.belowMin" class="stat-badge stat-warning">Under min</span>
              <span v-else-if="team.atMax" class="stat-badge stat-max">Vid max</span>
              <span v-else class="stat-badge stat-ok">OK</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
