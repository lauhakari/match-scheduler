import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeClubs, snapshotTournament, getTeamId, validateTournament, validatePayload, estimateCapacity, mealCapacityFloor, parseTeamList, rinkName, DEFAULT_SETTINGS } from '../src/lib/tournament.js'
import { dayTimeline } from '../src/lib/dayTimeline.js'
import { useScheduler } from '../src/composables/useScheduler.js'

const settings = () => ({ startTime: '09:00', endTime: '17:00', matchLength: 15, breakLength: 5,
  numRinks: 1, minGames: 2, maxGames: 5, minRest: 20, allowInterClub: false, pauses: [], foodBreaks: [] })
const clubs = () => ['A', 'B'].map(name => ({ name, teams: [{ name: '1' }, { name: '2' }], pauseDurations: { ice: 20 } }))
function payload() {
  const s = settings(), c = normalizeClubs(clubs()), scheduler = useScheduler()
  scheduler.generate(s, c)
  return JSON.parse(JSON.stringify({ s, c, g: scheduler.schedule.value, w: scheduler.warnings.value }))
}

test('normalization supplies persistent unique identities without mutating drafts', () => {
  const original = clubs(), normalized = normalizeClubs(original)
  assert.equal(original[0].id, undefined)
  const identities = normalized.flatMap(c => [c.id, ...c.teams.map(t => t.id)])
  assert.equal(new Set(identities).size, identities.length)
  assert.ok(identities.every(id => typeof id === 'string' && id.length > 0))
  assert.deepEqual(normalizeClubs(normalized), normalized)
  const teamId = getTeamId(normalized[0], normalized[0].teams[0])
  normalized[0].name = 'Renamed club'; normalized[0].teams[0].name = 'Renamed team'
  assert.equal(getTeamId(normalized[0], normalized[0].teams[0]), teamId)
  assert.equal(getTeamId(original[0], original[0].teams[0]), 'A::1')
})

test('generated snapshots keep team names and pause settings independent of draft edits', () => {
  const s = settings(), c = clubs()
  s.pauses.push({ id: 'ice', startTime: '12:00', defaultDuration: 20, windowDuration: 0 })
  const snapshot = snapshotTournament(s, c)
  c[0].name = 'Edited'; c[0].teams[0].name = 'Edited'; c[0].pauseDurations.ice = 99
  s.pauses[0].defaultDuration = 99; s.foodBreaks.push({ id: 'lunch' })
  assert.equal(snapshot.clubs[0].name, 'A')
  assert.equal(snapshot.clubs[0].teams[0].name, '1')
  assert.equal(snapshot.clubs[0].pauseDurations.ice, 20)
  assert.equal(snapshot.settings.pauses[0].defaultDuration, 20)
  assert.deepEqual(snapshot.settings.foodBreaks, [])
})

test('valid tournaments and generated schedules pass validation', () => {
  assert.deepEqual(validateTournament(settings(), clubs()), [])
  const data = payload()
  assert.ok(validatePayload(data))
  delete data.w
  assert.ok(validatePayload(data))
})

test('tournament validation rejects invalid names, ranges, types and recurring pauses', () => {
  for (const change of [s => { s.matchLength = 0 }, s => { s.matchLength = '15' },
    s => { s.startTime = '25:00' }, s => { s.endTime = '08:00' }, s => { s.minGames = 6 },
    s => { s.numRinks = 0 }, s => { s.allowInterClub = 'false' },
    s => { s.pauses = [{ id: 'ice', startTime: '10:00', defaultDuration: 10, recurring: true, recurringMode: 'time', intervalMinutes: 0 }] },
    s => { s.foodBreaks = [{ id: 'food', startTime: '12:00', duration: 30, maxTeamsPerSlot: 1 }] }]) {
    const s = settings(); change(s)
    assert.ok(validateTournament(s, clubs()).length > 0)
  }
  for (const change of [c => { c[1].name = ' a ' }, c => { c[0].teams[1].name = ' 1 ' },
    c => { c[0].name = '' }, c => { c[0].teams[0].name = 'Bad::name' },
    c => { c[0].teams[0].id = 'duplicate'; c[1].teams[0].id = 'duplicate' }]) {
    const c = clubs(); change(c)
    assert.ok(validateTournament(settings(), c).length > 0)
  }
})

test('malformed shared payloads fail validation without throwing', () => {
  for (const data of [null, [], {}, { c: [], s: {}, g: {} }, { c: null, s: settings(), g: {} }]) {
    assert.equal(validatePayload(data), false)
  }
  const mutations = [
    d => { d.g.slots = [] }, d => { d.g.numRinks = 2 }, d => { d.g.slots[0].time = 'bad' },
    d => { d.g.slots[0].endTime = '09:00' }, d => { d.g.slots[0].matches[0].rink = 2 },
    d => { d.g.slots[0].matches[0].home.id = 'unknown' },
    d => { d.g.slots[0].matches[0].away = d.g.slots[0].matches[0].home },
    d => { d.g.teamStats[0].games += 1 }, d => { d.g.teamStats.pop() },
    d => { d.g.teamStats[0].belowMin = !d.g.teamStats[0].belowMin },
    d => { d.w = [null] }, d => { d.g.generatedPauses = [{ id: 'bad', startTime: '24:00', defaultDuration: 10 }] },
    d => { d.s.pauses = null }, d => { d.s.foodBreaks = false },
    d => { d.g.generatedPauses = false },
    d => { d.g.generatedPauses = [{ id: 'p', startTime: '10:00', defaultDuration: 10, windowDuration: 'oops' }] },
  ]
  for (const mutate of mutations) {
    const data = payload(); mutate(data)
    assert.equal(validatePayload(data), false)
  }
})

test('shared payloads reject a repeated opponent and simultaneous or insufficient-rest games', () => {
  for (const mode of ['repeat', 'rest', 'busy']) {
    const data = payload()
    const first = data.g.slots[0].matches.find(m => m.home)
    const next = data.g.slots.find((slot, i) => i > 0 && slot.matches.some(m => m.home))
    assert.ok(first && next)
    if (mode === 'repeat') next.matches[0] = { ...JSON.parse(JSON.stringify(first)), rink: 1 }
    if (mode === 'rest') data.s.minRest = 120
    if (mode === 'busy') {
      data.s.numRinks = 2; data.g.numRinks = 2
      for (const slot of data.g.slots) slot.matches.push({ rink: 2, home: null, away: null })
      data.g.slots[0].matches[1] = { ...JSON.parse(JSON.stringify(first)), rink: 2 }
    }
    assert.equal(validatePayload(data), false)
  }
})

test('optional tournament details are bounded and old payloads without them stay valid', () => {
  const c = normalizeClubs(clubs())
  assert.deepEqual(validateTournament(settings(), c), [])
  const full = { ...settings(), name: 'Höstcupen', date: '2026-10-18', venue: 'Lillhallen', rinkLabel: 'Plan', rinkNames: ['Stora', ''] }
  assert.deepEqual(validateTournament(full, c), [])
  assert.equal(rinkName(full, 1), 'Stora')
  assert.equal(rinkName(full, 2), 'Plan 2')
  assert.equal(rinkName(settings(), 1), 'Rink 1')
  const bad = validateTournament({ ...settings(), name: 'x'.repeat(81), date: '2026-02-30', rinkLabel: 'Hall', rinkNames: ['y'.repeat(41)], venue: 'z'.repeat(101) }, c)
  assert.equal(bad.length, 3)
  assert.ok(validatePayload({ ...payload(), s: { ...settings(), name: 'Cup', date: '2026-10-18', rinkLabel: 'Bana', rinkNames: [] } }))
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS))
})

test('capacity estimates follow the day length, rinks, opponents and wanted games', () => {
  const c = normalizeClubs(clubs())
  const base = estimateCapacity(settings(), c)
  assert.equal(base.rounds, 24)
  assert.equal(base.slots, 24)
  assert.equal(base.gamesPerTeam, 2)
  assert.equal(base.enough, true)
  const short = estimateCapacity({ ...settings(), endTime: '09:20', minGames: 2 }, c)
  assert.equal(short.rounds, 1)
  assert.equal(short.gamesPerTeam, 0)
  assert.equal(short.enough, false)
  const inter = estimateCapacity({ ...settings(), allowInterClub: true, maxGames: 20 }, c)
  assert.equal(inter.gamesPerTeam, 3)
  assert.equal(estimateCapacity({ ...settings(), numRinks: 3 }, c).slots, 72)
  assert.equal(estimateCapacity({ ...settings(), matchLength: 0, breakLength: 0 }, c).slots, 0)
})

test('pasted team lists become clubs with unique teams and sensible defaults', () => {
  const parsed = parseTeamList('Hammarby: Vit, Grön\nAIK - Lag 1; Lag 2\nDjurgården\n\nhammarby: Blå, vit\n')
  assert.deepEqual(parsed.map(c => [c.name, c.teams.map(t => t.name)]), [
    ['Hammarby', ['Vit', 'Grön', 'Blå']], ['AIK', ['Lag 1', 'Lag 2']], ['Djurgården', ['Lag 1']],
  ])
  assert.deepEqual(parseTeamList(''), [])
  assert.equal(parseTeamList(Array.from({ length: 30 }, (_, i) => `Klubb ${i}`).join('\n')).length, 20)
  assert.deepEqual(validateTournament(settings(), normalizeClubs(parsed)), [])
})


test('day timelines mirror scheduler rounds for fixed, recurring, meal and staggered pauses', () => {
  const fixed = { id: 'shared', startTime: '12:00', defaultDuration: 30, windowDuration: 0, label: 'Paus' }
  const fixtures = [
    [settings(), clubs()],
    [{ ...settings(), pauses: [fixed] }, clubs()],
    [{ ...settings(), pauses: [{ ...fixed, recurring: true, recurringMode: 'slots', intervalSlots: 4, defaultDuration: 15 }] }, clubs()],
    [{ ...settings(), pauses: [{ ...fixed, startTime: '10:00', recurring: true, recurringMode: 'time', intervalMinutes: 120, defaultDuration: 10 }] }, clubs()],
    ...[6, 2].map(maxTeamsPerSlot => [{ ...settings(), foodBreaks: [{ id: 'meal', startTime: '11:30', duration: 45, maxTeamsPerSlot }] }, clubs()]),
    [{ ...settings(), pauses: [{ ...fixed, windowDuration: 90 }] }, [...clubs(), { name: 'C', teams: [{ name: '1' }] }]],
    [{ ...settings(), pauses: [{ ...fixed, windowDuration: 35 }] }, clubs()],
    [{ ...settings(), pauses: [{ ...fixed, id: 'ice', defaultDuration: 30 }] }, clubs()],
    [{ ...settings(), pauses: [fixed, { ...fixed, id: 'overlap', startTime: '12:15' }] }, clubs()],
    [{ ...settings(), pauses: [{ ...fixed, id: 'recurring', recurring: true, recurringMode: 'slots', intervalSlots: 4, defaultDuration: 15 }, fixed] }, clubs()],
  ]
  for (const [s, c] of fixtures) {
    const before = JSON.stringify({ s, c })
    const timeline = dayTimeline(s, c), scheduler = useScheduler()
    scheduler.generate(s, c)
    assert.ok(scheduler.schedule.value, scheduler.warnings.value.join(', '))
    assert.deepEqual(timeline.rounds.map(r => r.startTime), scheduler.schedule.value.slots.map(slot => slot.time))
    assert.deepEqual(timeline.rounds.map(r => r.endTime), scheduler.schedule.value.slots.map(slot => slot.endTime))
    assert.equal(timeline.endOfPlay, timeline.rounds.at(-1).endTime)
    assert.equal(JSON.stringify({ s, c }), before)
  }
  assert.equal(dayTimeline(...fixtures[4]).pauses[0].kind, 'meal')
  assert.equal(dayTimeline(...fixtures[5]).pauses.length, 0)
  assert.equal(dayTimeline(...fixtures[6]).pauses.length, 0)
})

test('timeline pause durations follow club overrides and recurring boundary rules', () => {
  const c = clubs()
  const pause = { id: 'ice', label: 'Isvård', startTime: '10:00', defaultDuration: 30, windowDuration: 0 }
  const fixed = dayTimeline({ ...settings(), pauses: [pause] }, c)
  assert.deepEqual(fixed.pauses, [{ startTime: '10:00', endTime: '10:20', label: 'Isvård', kind: 'pause' }])
  c[0].pauseDurations.ice = 0
  assert.equal(dayTimeline({ ...settings(), pauses: [pause] }, c).pauses.length, 0)
  const recurring = { ...pause, recurring: true, recurringMode: 'slots', intervalSlots: 1 }
  const short = dayTimeline({ ...settings(), endTime: '10:00', pauses: [recurring] }, c)
  assert.deepEqual(short.rounds.map(r => r.startTime), ['09:00', '09:20', '09:40'])
  assert.deepEqual(short.pauses, [])
  const fitting = dayTimeline({ ...settings(), endTime: '10:05', pauses: [recurring] }, c)
  assert.deepEqual(fitting.rounds.map(r => r.startTime), ['09:00', '09:50'])
  assert.deepEqual(fitting.pauses.map(p => [p.startTime, p.endTime]), [['09:20', '09:50']])
})

test('timeline tolerates incomplete drafts, empty clubs and meals below club capacity', () => {
  const empty = { slotLength: 0, rounds: [], pauses: [], endOfPlay: '' }
  for (const s of [null, {}, { ...settings(), startTime: 'bad' }, { ...settings(), endTime: '08:00' },
    { ...settings(), matchLength: 0 }, { ...settings(), breakLength: -1 }, { ...settings(), numRinks: 11 },
    { ...settings(), numRinks: 0 }, { ...settings(), matchLength: '15' }]) {
    assert.deepEqual(dayTimeline(s, clubs()), empty)
  }
  for (const c of [undefined, [], [null, { name: 'A', teams: [] }]]) {
    assert.equal(dayTimeline(settings(), c).rounds.length, 24)
  }
  const s = { ...settings(), foodBreaks: [{ startTime: '11:30', duration: 45, maxTeamsPerSlot: 1 }] }
  assert.equal(dayTimeline(s, clubs()).pauses.length, 0)
  assert.equal(dayTimeline(s, clubs()).rounds.length, 24)
  assert.equal(dayTimeline({ ...settings(), endTime: '09:10' }, clubs()).endOfPlay, '')
})

test('capacity includes the timeline, pause minutes, game totals and end estimate', () => {
  const base = estimateCapacity(settings(), clubs())
  assert.equal(base.totalGames, 4)
  assert.equal(base.usedSlots, 4)
  assert.equal(base.endEstimate, '10:15')
  assert.equal(base.pausedMinutes, 0)
  assert.deepEqual(base.timeline, dayTimeline(settings(), clubs()))
  const pause = { id: 'shared', startTime: '09:20', defaultDuration: 30, windowDuration: 0 }
  const paused = estimateCapacity({ ...settings(), pauses: [pause] }, clubs())
  assert.equal(paused.pausedMinutes, 30)
  assert.equal(paused.rounds, 22)
  assert.equal(paused.endEstimate, '10:45')
  const clipped = estimateCapacity({ ...settings(), pauses: [
    { ...pause, startTime: '08:50' }, { ...pause, id: 'overlap', startTime: '09:10' },
    { ...pause, id: 'late', startTime: '16:50' },
  ] }, clubs())
  assert.equal(clipped.pausedMinutes, 60)
  assert.equal(estimateCapacity({ ...settings(), numRinks: 3 }, clubs()).endEstimate, '09:55')
  assert.equal(estimateCapacity({ ...settings(), numRinks: 3, minRest: 0 }, clubs()).endEstimate, '09:35')
  for (const c of [[], null, [null], [{ teams: [] }], [{ teams: [{}] }]]) {
    const result = estimateCapacity(settings(), c)
    assert.equal(result.totalGames, 0)
    assert.equal(result.endEstimate, '')
  }
  assert.equal(estimateCapacity(null, null).slots, 0)
})

test('capacity caps each team by rounds of rest measured from match end', () => {
  const c = Array.from({ length: 12 }, (_, i) => ({ name: `Club ${i}`, teams: [{ name: '1' }] }))
  const s = { ...settings(), numRinks: 10, maxGames: 20, minRest: 60 }
  const estimate = estimateCapacity(s, c)
  assert.equal(estimate.restRounds, 3)
  assert.equal(estimate.gamesPerTeam, 6)
  assert.equal(estimateCapacity({ ...s, minRest: 5 }, c).restRounds, 0)
  assert.equal(estimateCapacity({ ...s, minRest: 0 }, c).restRounds, 0)
  assert.equal(estimateCapacity({ ...s, endTime: '09:15' }, c).gamesPerTeam, 1)
  assert.equal(estimateCapacity({ ...s, endTime: '09:10' }, c).gamesPerTeam, 0)
})

test('meal capacity floor accommodates the biggest whole club and malformed drafts', () => {
  for (const c of [undefined, null, {}, [], [null, {}, { teams: 'bad' }], clubs()]) assert.equal(mealCapacityFloor(c), 6)
  assert.equal(mealCapacityFloor([{ teams: Array(9).fill({}) }, { teams: Array(7).fill({}) }]), 9)
})

test('joint rest windows bound the tight seven-team day across both rinks', () => {
  const c = [3, 2, 2].map((count, i) => ({ name: ['Lund', 'Malmö', 'Flagg'][i],
    teams: Array.from({ length: count }, (_, j) => ({ name: String(j + 1) })) }))
  const s = { ...settings(), endTime: '12:00', matchLength: 20, breakLength: 5,
    numRinks: 2, minGames: 4, maxGames: 5, minRest: 20 }
  const tight = estimateCapacity(s, c)
  assert.equal(tight.rounds, 7)
  assert.equal(tight.slots, 14)
  assert.equal(tight.gameBound, 11)
  assert.equal(tight.gamesPerTeam, 3)
  assert.equal(tight.totalGames, 11)
  assert.equal(tight.endEstimate, '11:50')
  assert.equal(tight.usedSlots, 11)
  assert.equal(tight.wantedGames, 14)
  assert.equal(tight.enough, false)
  const noRest = estimateCapacity({ ...s, minRest: 0 }, c)
  assert.equal(noRest.gameBound, 14)
  assert.equal(noRest.gamesPerTeam, 4)
  assert.equal(noRest.totalGames, 14)
  assert.equal(noRest.enough, true)
  const longer = estimateCapacity({ ...s, endTime: '12:25' }, c)
  assert.equal(longer.rounds, 8)
  assert.equal(longer.gameBound, 12)
  assert.equal(longer.gamesPerTeam, 3)
  assert.equal(longer.totalGames, 11)
  assert.equal(longer.endEstimate, '11:50')
})

test('joint windows use actual times and permit playing again at the exact rest boundary', () => {
  const c = Array.from({ length: 7 }, (_, i) => ({ name: `Club ${i}`, teams: [{ name: '1' }] }))
  const s = { ...settings(), endTime: '09:45', matchLength: 20, breakLength: 5,
    numRinks: 2, minRest: 20 }
  const adjacent = estimateCapacity(s, c)
  assert.deepEqual(adjacent.timeline.rounds.map(r => r.startTime), ['09:00', '09:25'])
  assert.equal(adjacent.gameBound, 3)
  for (const [endTime, duration] of [['10:00', 20], ['10:05', 25]]) {
    const paused = estimateCapacity({ ...s, endTime,
      pauses: [{ id: 'shared', startTime: '09:20', defaultDuration: duration, windowDuration: 0 }] }, c)
    assert.equal(paused.rounds, 2)
    assert.equal(paused.gameBound, 4)
    assert.equal(paused.pausedMinutes, duration)
    assert.equal(paused.timeline.rounds[1].startTime, duration === 20 ? '09:40' : '09:45')
  }
  for (const c of [[], null, [{ teams: [{}] }]]) assert.equal(estimateCapacity(s, c).gameBound, 0)
  assert.equal(estimateCapacity({ ...s, matchLength: 0 }, c).gameBound, 0)
})

test('the joint bound never falls below real schedules in a seeded matrix with rests and pauses', () => {
  const original = Math.random
  try {
    for (let i = 0; i < 100; i++) {
      let seed = i + 42
      Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
      const c = Array.from({ length: 2 + i % 4 }, (_, club) => ({ name: `Club ${club}`,
        teams: Array.from({ length: 1 + (i + club) % 3 }, (_, team) => ({ name: `Team ${team}` })) }))
      const s = { ...settings(), endTime: ['10:30', '12:00', '13:00'][i % 3], matchLength: 10 + i % 3 * 5,
        numRinks: 1 + i % 3, minGames: 1, maxGames: 5, minRest: [0, 5, 20, 40, 60][i % 5],
        allowInterClub: Boolean(i % 2) }
      const pause = { id: 'shared', startTime: '09:30', defaultDuration: 20, windowDuration: 0 }
      if (i % 4 === 1) s.pauses = [pause]
      if (i % 4 === 2) s.pauses = [{ ...pause, recurring: true, recurringMode: 'slots', intervalSlots: 2 }]
      if (i % 4 === 3) s.foodBreaks = [{ id: 'lunch', startTime: '09:30', duration: 20, maxTeamsPerSlot: 80 }]
      const capacity = estimateCapacity(s, c), scheduler = useScheduler()
      scheduler.generate(s, c)
      const schedule = scheduler.schedule.value
      assert.ok(schedule, `case ${i}: ${scheduler.warnings.value.join(', ')}`)
      const actualGames = schedule.slots.reduce((sum, slot) => sum + slot.matches.filter(m => m.home).length, 0)
      assert.ok(actualGames <= capacity.gameBound, `case ${i}: ${actualGames} > ${capacity.gameBound}`)
      assert.ok(capacity.gameBound <= capacity.slots)
      assert.ok(capacity.totalGames <= capacity.gameBound)
      assert.ok(capacity.gamesPerTeam <= Math.floor(2 * capacity.gameBound / capacity.teams))
    }
  } finally {
    Math.random = original
  }
})
