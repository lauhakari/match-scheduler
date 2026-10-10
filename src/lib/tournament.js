export const MAX_PAYLOAD_BYTES = 512 * 1024
export const MAX_TEAMS = 80
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)
export const timeToMinutes = value => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}
export const getTeamId = (club, team) => team.id || `${club.name}::${team.name}`

export function snapshotTournament(settings, clubs) {
  return JSON.parse(JSON.stringify({ settings, clubs }))
}

export function normalizeClubs(clubs) {
  if (!Array.isArray(clubs) || clubs.length > 20 || clubs.some(c => !record(c) || !Array.isArray(c.teams) || c.teams.length > MAX_TEAMS || c.teams.some(t => !record(t)))) {
    throw new Error('Ogiltiga klubbar eller lag.')
  }
  const copy = JSON.parse(JSON.stringify(clubs))
  for (const club of copy) {
    club.id ||= crypto.randomUUID()
    for (const team of club.teams) team.id ||= crypto.randomUUID()
  }
  return copy
}

export function validateTournament(settings, clubs) {
  const errors = []
  if (!record(settings)) return ['Ogiltiga turneringsinställningar.']
  if (!time(settings.startTime) || !time(settings.endTime) || settings.startTime >= settings.endTime) errors.push('Ange giltiga tider med sluttid efter starttid samma dag.')
  for (const [key, label, min, max] of [
    ['matchLength', 'Matchlängd', 5, 120], ['breakLength', 'Paus per match', 0, 60],
    ['numRinks', 'Antal rinkar', 1, 10], ['minGames', 'Min matcher', 1, 20],
    ['maxGames', 'Max matcher', 1, 20], ['minRest', 'Vila per lag', 0, 120],
  ]) if (!integer(settings[key], min, max)) errors.push(`${label} måste vara ett heltal mellan ${min} och ${max}.`)
  if (settings.minGames > settings.maxGames) errors.push('Min matcher får inte vara större än max matcher.')
  if (typeof settings.allowInterClub !== 'boolean') errors.push('Ogiltig inställning för internmatcher.')
  if (!Array.isArray(clubs) || clubs.length < 1 || clubs.length > 20) return [...errors, 'Ange mellan 1 och 20 klubbar.']
  const clubNames = new Set(), ids = new Set()
  let total = 0
  for (const club of clubs) {
    if (!record(club) || !name(club.name) || !Array.isArray(club.teams) || club.teams.length < 1 || club.teams.length > MAX_TEAMS) {
      errors.push('Varje klubb behöver ett namn och minst ett lag.'); continue
    }
    const clubName = club.name.trim().toLocaleLowerCase('sv')
    if (clubNames.has(clubName) || club.name.includes('::')) errors.push('Klubbnamn måste vara unika och får inte innehålla ::.')
    clubNames.add(clubName)
    if (club.id !== undefined) {
      if (!id(club.id) || ids.has(club.id)) errors.push('Klubbarnas ID måste vara giltiga och unika.')
      ids.add(club.id)
    }
    if (club.cluster !== undefined && typeof club.cluster !== 'boolean') errors.push('Ogiltig inställning för samlade matcher.')
    const teamNames = new Set()
    total += club.teams.length
    for (const team of club.teams) {
      if (!record(team) || !name(team.name)) { errors.push('Alla lag behöver ett namn på högst 100 tecken.'); continue }
      const teamName = team.name.trim().toLocaleLowerCase('sv')
      if (teamNames.has(teamName) || team.name.includes('::')) errors.push(`Lagnamn i ${club.name} måste vara unika och får inte innehålla ::.`)
      teamNames.add(teamName)
      if (team.id !== undefined) {
        if (!id(team.id) || ids.has(team.id)) errors.push('Lagens ID måste vara giltiga och unika.')
        ids.add(team.id)
      }
    }
    if (club.pauseDurations !== undefined && (!record(club.pauseDurations) || Object.values(club.pauseDurations).some(d => !integer(d, 0, 240)))) errors.push('Klubbarnas pauslängder måste vara heltal mellan 0 och 240 minuter.')
  }
  if (total < 2 || total > MAX_TEAMS) errors.push(`Ange mellan 2 och ${MAX_TEAMS} lag totalt.`)
  const pauseIds = new Set()
  for (const [key, max] of [['pauses', 20], ['foodBreaks', 10]]) {
    const entries = settings[key] === undefined ? [] : settings[key]
    if (!Array.isArray(entries) || entries.length > max) { errors.push(`För många eller ogiltiga ${key === 'pauses' ? 'pauser' : 'matpauser'}.`); continue }
    for (const pause of entries) {
      if (!record(pause) || !id(pause.id) || pauseIds.has(pause.id) || !time(pause.startTime) || (pause.label !== undefined && (typeof pause.label !== 'string' || pause.label.length > 100))) {
        errors.push('Alla pauser behöver giltiga tider och unika ID.'); continue
      }
      pauseIds.add(pause.id)
      if (key === 'foodBreaks') {
        if (!integer(pause.duration, 1, 240) || !integer(pause.maxTeamsPerSlot, 1, MAX_TEAMS)) errors.push('Ange giltig längd och lagkapacitet för matpausen.')
        if (clubs.some(c => Array.isArray(c?.teams) && c.teams.length > pause.maxTeamsPerSlot)) errors.push('En klubb har fler lag än matpausens kapacitet. Öka kapaciteten för att hålla ihop klubben.')
        if (integer(pause.duration, 1, 240) && integer(pause.maxTeamsPerSlot, 1, MAX_TEAMS) && time(settings.endTime)) {
          const groups = []
          for (const club of clubs) {
            if (!Array.isArray(club?.teams)) continue
            const group = groups.findIndex(count => count + club.teams.length <= pause.maxTeamsPerSlot)
            if (group < 0) groups.push(club.teams.length)
            else groups[group] += club.teams.length
          }
          if (timeToMinutes(pause.startTime) + groups.length * pause.duration > timeToMinutes(settings.endTime)) errors.push('Alla matpass måste rymmas före turneringens sluttid.')
        }
      } else {
        if (!integer(pause.defaultDuration, 0, 240) || !integer(pause.windowDuration ?? 0, 0, 240)) errors.push('Pauslängd och fönster måste vara heltal mellan 0 och 240 minuter.')
        if (pause.recurring !== undefined && typeof pause.recurring !== 'boolean') errors.push('Ogiltig återkommande paus.')
        if (pause.recurring && !((pause.recurringMode === 'time' && integer(pause.intervalMinutes, 5, 1440)) || (pause.recurringMode === 'slots' && integer(pause.intervalSlots, 1, 288)))) errors.push('Ange ett giltigt intervall för återkommande pauser.')
      }
    }
  }
  if (!errors.length) {
    const slots = Math.floor((timeToMinutes(settings.endTime) - timeToMinutes(settings.startTime)) / (settings.matchLength + settings.breakLength)) + 1
    if (slots * settings.numRinks * total * (total - 1) / 2 > 3_000_000) errors.push('Turneringen är för stor för dessa inställningar. Minska antal lag, rinkar eller tidsperioder.')
  }
  return [...new Set(errors)]
}

export function validatePayload(data) {
  if (!record(data) || validateTournament(data.s, data.c).length || !record(data.g)) return false
  const { slots, teamStats, numRinks } = data.g
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > 288 || numRinks !== data.s.numRinks || !Array.isArray(teamStats)) return false
  const teams = new Map(data.c.flatMap(c => c.teams.map(t => [getTeamId(c, t), { name: t.name, clubName: c.name }])))
  const matchTeam = t => record(t) && teams.has(t.id) && t.name === teams.get(t.id).name && t.clubName === teams.get(t.id).clubName
  const counts = new Map(), lastEnd = new Map(), pairs = new Set()
  let previousEnd = -1
  for (const slot of slots) {
    if (!record(slot) || !time(slot.time) || !time(slot.endTime) || !Array.isArray(slot.matches) || slot.matches.length !== numRinks) return false
    const start = timeToMinutes(slot.time), end = timeToMinutes(slot.endTime)
    if (start < previousEnd || start < timeToMinutes(data.s.startTime) || end > timeToMinutes(data.s.endTime) || end - start !== data.s.matchLength) return false
    previousEnd = end
    const busy = new Set()
    for (let i = 0; i < slot.matches.length; i++) {
      const m = slot.matches[i]
      if (!record(m) || m.rink !== i + 1) return false
      if (m.home === null && m.away === null) continue
      if (!matchTeam(m.home) || !matchTeam(m.away) || m.home.id === m.away.id || (!data.s.allowInterClub && m.home.clubName === m.away.clubName)) return false
      const pair = JSON.stringify([m.home.id, m.away.id].sort())
      if (pairs.has(pair)) return false
      pairs.add(pair)
      for (const t of [m.home, m.away]) {
        if (busy.has(t.id) || start - (lastEnd.get(t.id) ?? -Infinity) < data.s.minRest) return false
        busy.add(t.id); lastEnd.set(t.id, end)
        counts.set(t.id, (counts.get(t.id) || 0) + 1)
        if (counts.get(t.id) > data.s.maxGames) return false
      }
    }
  }
  if (teamStats.length !== teams.size || new Set(teamStats.map(t => t?.id)).size !== teams.size || teamStats.some(t => !matchTeam(t) || t.games !== (counts.get(t.id) || 0) || t.belowMin !== (t.games < data.s.minGames) || t.atMax !== (t.games >= data.s.maxGames))) return false
  for (const key of ['generatedPauses', 'foodBreakPauses']) {
    const pauses = data.g[key] === undefined ? [] : data.g[key]
    if (!Array.isArray(pauses) || pauses.length > 300 || pauses.some(p => !record(p) || typeof p.id !== 'string' || p.id.length > 160 || !time(p.startTime) || !integer(p.defaultDuration, 0, 240)
      || (p.windowDuration !== undefined && !integer(p.windowDuration, 0, 240))
      || (p.originalId !== undefined && !id(p.originalId))
      || (p.recurring !== undefined && typeof p.recurring !== 'boolean')
      || (p._isFoodBreak !== undefined && typeof p._isFoodBreak !== 'boolean')
      || (p.label !== undefined && (typeof p.label !== 'string' || p.label.length > 100))
      || (p._clubNames !== undefined && (!Array.isArray(p._clubNames) || p._clubNames.length > 20 || p._clubNames.some(n => !data.c.some(c => c.name === n)))))) return false
  }
  return data.w === undefined || (Array.isArray(data.w) && data.w.length <= 100 && data.w.every(w => typeof w === 'string' && w.length <= 300))
}

export function scheduleWarnings(data) {
  return data.w || data.g.teamStats.filter(t => t.belowMin).map(t => `${t.clubName} — ${t.name}: bara ${t.games} match(er) (min: ${data.s.minGames})`)
}
