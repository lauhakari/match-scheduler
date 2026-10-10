import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeClubs, snapshotTournament, getTeamId, validateTournament, validatePayload } from '../src/lib/tournament.js'
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
