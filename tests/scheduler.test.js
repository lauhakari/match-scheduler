import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { useScheduler, expandPauses, groupFoodBreak } from '../src/composables/useScheduler.js'

const base = { startTime: '09:00', endTime: '17:00', matchLength: 15, breakLength: 5,
  numRinks: 1, minGames: 2, maxGames: 5, minRest: 20, allowInterClub: false, pauses: [], foodBreaks: [] }
const clubs = () => ['A', 'B'].map(name => ({ name, teams: [{ name: '1' }, { name: '2' }] }))
const minutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
const run = (settings = base, entries = clubs()) => {
  const scheduler = useScheduler()
  scheduler.generate(settings, entries)
  return scheduler
}
function seeded(seed, fn) {
  const original = Math.random
  Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
  try { return fn() } finally { Math.random = original }
}
function checkSchedule(schedule, settings) {
  assert.ok(schedule)
  const ends = new Map(), counts = new Map(), pairs = new Set()
  let previousEnd = -Infinity
  for (const slot of schedule.slots) {
    const start = minutes(slot.time), end = minutes(slot.endTime), busy = new Set()
    assert.ok(start >= previousEnd)
    assert.ok(start >= minutes(settings.startTime) && end <= minutes(settings.endTime))
    assert.equal(end - start, settings.matchLength)
    assert.equal(slot.matches.length, settings.numRinks)
    previousEnd = end
    for (const [i, match] of slot.matches.entries()) {
      assert.equal(match.rink, i + 1)
      if (!match.home) { assert.equal(match.away, null); continue }
      assert.notEqual(match.home.id, match.away.id)
      if (!settings.allowInterClub) assert.notEqual(match.home.clubName, match.away.clubName)
      const pair = JSON.stringify([match.home.id, match.away.id].sort())
      assert.ok(!pairs.has(pair)); pairs.add(pair)
      for (const team of [match.home, match.away]) {
        assert.ok(!busy.has(team.id)); busy.add(team.id)
        assert.ok(start - (ends.get(team.id) ?? -Infinity) >= settings.minRest)
        ends.set(team.id, end)
        counts.set(team.id, (counts.get(team.id) || 0) + 1)
        assert.ok(counts.get(team.id) <= settings.maxGames)
      }
    }
  }
  for (const team of schedule.teamStats) {
    assert.equal(team.games, counts.get(team.id) || 0)
    assert.equal(team.belowMin, team.games < settings.minGames)
    assert.equal(team.atMax, team.games >= settings.maxGames)
  }
}
function checkBlocks(schedule, blocks) {
  let games = 0
  for (const slot of schedule.slots) for (const match of slot.matches) {
    if (!match.home) continue
    games++
    for (const team of [match.home, match.away]) for (const [start, end] of blocks[team.clubName] || []) {
      assert.ok(!(minutes(slot.time) < end && minutes(slot.endTime) > start), `${team.clubName} plays during its break`)
    }
  }
  assert.ok(games > 0)
}

test('the feasible default four-team tournament meets every requested minimum', () => {
  for (let seed = 1; seed <= 30; seed++) seeded(seed, () => {
    const scheduler = run()
    checkSchedule(scheduler.schedule.value, base)
    assert.ok(scheduler.schedule.value.teamStats.every(t => t.games >= 2))
    assert.deepEqual(scheduler.warnings.value, [])
  })
})

test('200 deterministic tournaments preserve time, rest, unique opponents, rink conflicts and accurate counts', () => {
  for (let i = 0; i < 200; i++) seeded(i + 42, () => {
    const entries = Array.from({ length: 2 + i % 5 }, (_, c) => ({ name: `Club ${c}`,
      teams: Array.from({ length: 1 + (i + c) % 4 }, (_, t) => ({ name: `Team ${t}` })) }))
    const settings = { ...base, numRinks: 1 + i % 4, minRest: i % 61,
      minGames: 1, maxGames: 1 + i % 8, allowInterClub: Boolean(i % 2) }
    checkSchedule(run(settings, entries).schedule.value, settings)
  })
})

test('invalid input clears an existing result and supplies warnings', () => {
  for (const settings of [{ ...base, matchLength: -1 }, { ...base, minRest: -1 },
    { ...base, endTime: '08:00' }, { ...base, numRinks: 0 }, { ...base, minGames: 6 }]) {
    const scheduler = run()
    scheduler.generate(settings, clubs())
    assert.equal(scheduler.schedule.value, null)
    assert.ok(scheduler.warnings.value.length > 0)
  }
})

test('zero slot duration rejects promptly instead of hanging', () => {
  const moduleUrl = new URL('../src/composables/useScheduler.js', import.meta.url).href
  const script = `import {useScheduler} from ${JSON.stringify(moduleUrl)}; const s=useScheduler(); s.generate(${JSON.stringify({ ...base, matchLength: 0, breakLength: 0 })},${JSON.stringify(clubs())}); if(s.schedule.value!==null || !s.warnings.value.length) process.exit(1)`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 2000, encoding: 'utf8' })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
})

test('duplicate names reject rather than collide in statistics', () => {
  for (const entries of [clubs().map(c => ({ ...c, name: 'Same' })),
    [{ name: 'A', teams: [{ name: 'Same' }, { name: ' same ' }] }, clubs()[1]]]) {
    const scheduler = run(base, entries)
    assert.equal(scheduler.schedule.value, null)
    assert.ok(scheduler.warnings.value.length)
  }
})

test('unavailable matchups and insufficient time produce a clear rejection', () => {
  assert.equal(run(base, [clubs()[0]]).schedule.value, null)
  assert.equal(run({ ...base, endTime: '09:10' }).schedule.value, null)
  assert.ok(run({ ...base, allowInterClub: true }, [clubs()[0]]).schedule.value)
})

test('fixed and recurring time pauses exclude games throughout their intervals', () => {
  const pause = { id: 'ice', startTime: '09:10', defaultDuration: 30, windowDuration: 0,
    recurring: true, recurringMode: 'time', intervalMinutes: 120 }
  const expanded = expandPauses([pause], minutes(base.endTime))
  assert.deepEqual(expanded.map(p => p.startTime), ['09:10', '11:10', '13:10', '15:10'])
  for (const p of [pause, { ...pause, recurring: false }]) {
    const settings = { ...base, pauses: [p] }
    const schedule = run(settings).schedule.value
    checkSchedule(schedule, settings)
    const intervals = (p.recurring ? expanded : [p]).map(p => [minutes(p.startTime), minutes(p.startTime) + 30])
    checkBlocks(schedule, { A: intervals, B: intervals })
  }
})

test('slot recurrence inserts a break after every two rounds', () => {
  const settings = { ...base, endTime: '11:00', pauses: [{ id: 'ice', startTime: '09:00', recurring: true,
    recurringMode: 'slots', intervalSlots: 2, defaultDuration: 10, windowDuration: 0 }] }
  const schedule = run(settings).schedule.value
  checkSchedule(schedule, settings)
  assert.equal(schedule.generatedPauses[0].startTime, '09:40')
  assert.equal(schedule.slots[2].time, '09:50')
  const intervals = schedule.generatedPauses.map(p => [minutes(p.startTime), minutes(p.startTime) + 10])
  checkBlocks(schedule, { A: intervals, B: intervals })
})

test('staggered pauses block each club at its assigned time', () => {
  const entries = ['A', 'B', 'C', 'D'].map(name => ({ name, teams: [{ name: '1' }] }))
  const settings = { ...base, minRest: 0, pauses: [{ id: 'ice', startTime: '09:00', defaultDuration: 20, windowDuration: 80 }] }
  const schedule = run(settings, entries).schedule.value
  checkSchedule(schedule, settings)
  checkBlocks(schedule, { A: [[540, 560]], B: [[560, 580]], C: [[580, 600]], D: [[600, 620]] })
})

test('food breaks respect capacity and exclude participating teams', () => {
  const food = { id: 'lunch', startTime: '09:00', duration: 50, maxTeamsPerSlot: 2 }
  const entries = clubs(), groups = groupFoodBreak(food, entries)
  assert.equal(groups.length, 2)
  for (const group of groups) assert.ok(group.clubNames.reduce((count, name) => count + entries.find(c => c.name === name).teams.length, 0) <= 2)
  const settings = { ...base, foodBreaks: [food] }, schedule = run(settings, entries).schedule.value
  checkSchedule(schedule, settings)
  checkBlocks(schedule, { A: [[540, 590]], B: [[590, 640]] })
  const scheduler = run({ ...base, foodBreaks: [{ ...food, maxTeamsPerSlot: 1 }] })
  assert.equal(scheduler.schedule.value, null)
  assert.ok(scheduler.warnings.value.length)
})
