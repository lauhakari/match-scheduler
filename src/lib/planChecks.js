import { estimateCapacity, rinkName } from './tournament.js'

const toMinutes = value => { const [h, m] = String(value || '').split(':').map(Number); return h * 60 + m }
const toTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const rinkWord = settings => {
  const n = settings.numRinks
  const plural = { Rink: 'rinkar', Plan: 'planer', Bana: 'banor' }[settings.rinkLabel] || 'rinkar'
  return `${n} ${n === 1 ? (settings.rinkLabel || 'rink').toLowerCase() : plural}`
}

// End time needed for every team to reach `games` matches, rounded up to five minutes; null when it would pass midnight.
export function endTimeFor(games, settings, capacity) {
  const slotLength = (settings.matchLength || 0) + (settings.breakLength || 0)
  if (!slotLength || capacity.teams < 2 || !capacity.rounds) return null
  const byCount = Math.ceil(Math.ceil(capacity.teams * games / 2) / settings.numRinks)
  const byRest = (games - 1) * ((capacity.restRounds || 0) + 1) + 1
  const rounds = Math.max(byCount, byRest)
  const minutes = rounds * slotLength - (settings.breakLength || 0) + (capacity.pausedMinutes || 0)
  const end = Math.ceil((toMinutes(settings.startTime) + minutes) / 5) * 5
  return end <= 24 * 60 && end > toMinutes(settings.endTime) ? toTime(end) : null
}

function mealGroups(meal, clubs) {
  const groups = []
  for (const club of clubs) {
    const group = groups.findIndex(count => count + club.teams.length <= meal.maxTeamsPerSlot)
    if (group < 0) groups.push(club.teams.length)
    else groups[group] += club.teams.length
  }
  return groups.length
}

export function planChecks(settings, clubs, capacity = estimateCapacity(settings, clubs)) {
  const checks = []
  const teams = capacity.teams
  const pauseLabels = [...new Set((capacity.timeline?.pauses || []).map(p => (p.label || '').trim()).filter(Boolean))]
  const summaryStart = `${capacity.slots} matchtider på ${rinkWord(settings)}${pauseLabels.length ? ` efter ${pauseLabels.join(' och ').toLocaleLowerCase('sv')}` : ''}.`

  if (!capacity.slots) {
    return { status: 'empty', headline: 'Fyll i tiderna för speldagen', summary: 'Start, slut och matchlängd behövs för att räkna på dagen.', checks, capacity }
  }
  if (teams < 2) {
    checks.push({ id: 'teams', level: 'warn', text: 'Lägg till minst två lag för att se hur många matcher var och en kan få.', fixes: [{ label: 'Gå till Lag', go: 3 }] })
    return { status: 'empty', headline: 'Lagen saknas ännu', summary: summaryStart, checks, capacity }
  }

  const g = capacity.gamesPerTeam
  const opponents = settings.allowInterClub ? teams - 1 : Math.min(...clubs.map(c => teams - c.teams.length))
  const interClubFix = { label: 'Tillåt matcher inom klubben', patch: { allowInterClub: true } }
  if (g < settings.minGames) {
    const fixes = []
    if (!settings.allowInterClub && opponents < settings.minGames) fixes.push(interClubFix)
    if (g >= 1) fixes.push({ label: `Sätt minst ${g}`, patch: { minGames: g, maxGames: Math.max(g, settings.maxGames) } })
    const later = opponents >= settings.minGames ? endTimeFor(settings.minGames, settings, capacity) : null
    if (later) fixes.push({ label: `Förläng till ${later}`, patch: { endTime: later } })
    if (settings.numRinks < 10 && !later) fixes.push({ label: `Lägg till en ${(settings.rinkLabel || 'rink').toLowerCase()}`, patch: { numRinks: settings.numRinks + 1 } })
    checks.push({ id: 'min-games', level: 'error', text: `Minst ${settings.minGames} matcher per lag ryms inte. Dagen räcker till ${g}${!settings.allowInterClub && opponents < settings.minGames ? `, och lagen har bara ${opponents} möjliga motståndare utanför den egna klubben` : ''}.`, fixes })
  } else if (g < settings.maxGames) {
    const later = opponents >= settings.maxGames ? endTimeFor(settings.maxGames, settings, capacity) : null
    const fixes = [{ label: `Sätt högst ${g}`, patch: { maxGames: g } }]
    if (later) fixes.push({ label: `Förläng till ${later}`, patch: { endTime: later } })
    checks.push({ id: 'max-games', level: 'warn', text: `Högst ${settings.maxGames} matcher per lag går inte att nå. Dagen rymmer ${g}.`, fixes })
  } else {
    checks.push({ id: 'games', level: 'ok', text: `Alla lag kan få ${settings.minGames === settings.maxGames ? settings.minGames : `${settings.minGames}–${settings.maxGames}`} matcher.`, fixes: [] })
  }

  if (capacity.restRounds > 0) checks.push({ id: 'rest', level: 'ok', text: `Vilan på ${settings.minRest} minuter betyder att ett lag spelar högst var ${capacity.restRounds + 1}:e omgång.`, fixes: [] })
  else checks.push({ id: 'rest', level: 'ok', text: `Lagen får minst ${settings.minRest} minuters vila mellan sina matcher.`, fixes: [] })

  for (const meal of settings.foodBreaks || []) {
    const label = meal.label || 'Matpausen'
    const tooBig = clubs.find(c => c.teams.length > meal.maxTeamsPerSlot)
    if (tooBig) {
      checks.push({ id: `meal-${meal.id}`, level: 'error', text: `${label}: ${tooBig.name || 'en klubb'} har ${tooBig.teams.length} lag men passet rymmer ${meal.maxTeamsPerSlot}.`, fixes: [{ label: `Öka till ${tooBig.teams.length} lag per pass`, patch: { foodBreaks: settings.foodBreaks.map(m => m === meal ? { ...m, maxTeamsPerSlot: tooBig.teams.length } : m) } }] })
      continue
    }
    const groups = mealGroups(meal, clubs)
    const end = toMinutes(meal.startTime) + groups * meal.duration
    if (end > toMinutes(settings.endTime)) {
      checks.push({ id: `meal-${meal.id}`, level: 'error', text: `${label} slutar ${toTime(end)}, efter dagens slut ${settings.endTime}.`, fixes: [{ label: `Förläng till ${toTime(end)}`, patch: { endTime: toTime(end) } }] })
    } else {
      checks.push({ id: `meal-${meal.id}`, level: 'ok', text: groups > 1 ? `${label} ryms för alla klubbar i ${groups} pass, klart ${toTime(end)}.` : `${label} ryms för alla klubbar i ett pass.`, fixes: [] })
    }
  }

  const status = checks.some(c => c.level === 'error') ? 'warn' : 'ok'
  const summary = `${summaryStart}${capacity.endEstimate ? ` Beräknat slut ${capacity.endEstimate}.` : ''}`
  return { status, headline: status === 'ok' ? 'Dagen går ihop' : 'Dagen går inte ihop ännu', summary, checks, capacity }
}

// Per-rink cells for the day strip: one per round or play-stopping pause, in time order.
export function dayStrip(settings, capacity) {
  const timeline = capacity.timeline
  if (!timeline || !timeline.rounds.length) return []
  const events = [
    ...timeline.rounds.map((r, index) => ({ kind: 'round', startTime: r.startTime, index })),
    ...timeline.pauses.map(p => ({ kind: 'pause', startTime: p.startTime, label: p.label })),
  ].sort((a, b) => a.startTime.localeCompare(b.startTime) || (a.kind === 'pause' ? -1 : 1))
  return Array.from({ length: settings.numRinks }, (_, rink) => ({
    name: rinkName(settings, rink + 1),
    cells: events.map(e => e.kind === 'pause' ? { kind: 'pause', title: `${e.label || 'Paus'} ${e.startTime}` } : { kind: e.index * settings.numRinks + rink < capacity.totalGames ? 'match' : 'free', title: e.startTime }),
  }))
}
