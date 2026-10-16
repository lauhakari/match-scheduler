<script setup>
import { computed } from 'vue'
import { rinkName } from '../lib/tournament.js'
import { clubColorByName } from '../lib/clubColors.js'

const props = defineProps({
  schedule: Object,
  clubs: Array,
  settings: { type: Object, default: () => ({}) },
  focusTeam: { type: String, default: '' },
  focusClub: { type: String, default: '' },
})

const teams = computed(() => {
  const games = new Map()
  for (const slot of props.schedule.slots) {
    for (const match of slot.matches) {
      if (!match.home || !match.away) continue
      for (const [team, opponent] of [[match.home, match.away], [match.away, match.home]]) {
        if (!games.has(team.id)) games.set(team.id, [])
        games.get(team.id).push({ time: slot.time, endTime: slot.endTime, opponent, rink: match.rink })
      }
    }
  }
  return props.schedule.teamStats
    .filter(team => (props.focusTeam ? team.id === props.focusTeam : !props.focusClub || team.clubName === props.focusClub))
    .map(team => ({ ...team, list: games.get(team.id) || [], ...clubColorByName(props.clubs, team.clubName) }))
})
</script>

<template>
  <div class="team-cards">
    <article v-for="team in teams" :key="team.id" class="team-card" :style="{ '--team-color': team.color, '--team-bg': team.bg }">
      <header class="team-card-head">
        <i aria-hidden="true"></i>
        <div><small>{{ team.clubName }}</small><strong>{{ team.name }}</strong></div>
        <span class="count">{{ team.games }} {{ team.games === 1 ? 'match' : 'matcher' }}</span>
      </header>
      <ol v-if="team.list.length">
        <li v-for="game in team.list" :key="game.time + game.rink">
          <strong>{{ game.time }}</strong>
          <span>mot {{ game.opponent.clubName }} {{ game.opponent.name }}</span>
          <small>{{ rinkName(settings, game.rink) }} · slut {{ game.endTime }}</small>
        </li>
      </ol>
      <p v-else class="none">Inga matcher kunde planeras in.</p>
    </article>
  </div>
</template>
