import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planChecks, endTimeFor, dayStrip } from '../src/lib/planChecks.js'
import { estimateCapacity, normalizeClubs } from '../src/lib/tournament.js'

const settings = (extra = {}) => ({ startTime: '09:00', endTime: '17:00', matchLength: 15, breakLength: 5, numRinks: 1, rinkLabel: 'Rink',
  minGames: 2, maxGames: 5, minRest: 20, allowInterClub: false, pauses: [], foodBreaks: [], ...extra })
const clubs = () => normalizeClubs(['A', 'B'].map(name => ({ name, teams: [{ name: '1' }, { name: '2' }] })))

test('plan checks report an empty day, missing teams and a day that works', () => {
  assert.equal(planChecks(settings({ endTime: '09:10' }), clubs()).status, 'empty')
  const noTeams = planChecks(settings(), [])
  assert.equal(noTeams.status, 'empty')
  assert.deepEqual(noTeams.checks[0].fixes, [{ label: 'Gå till Lag', go: 3 }])
  const fine = planChecks(settings({ maxGames: 2 }), clubs())
  assert.equal(fine.status, 'ok')
  assert.equal(fine.headline, 'Dagen går ihop')
  assert.match(fine.summary, /^24 matchtider på 1 rink\./)
  assert.ok(fine.checks.every(c => c.level === 'ok'))
})

test('unreachable game counts come with fixes that patch the settings', () => {
  const tooMany = planChecks(settings({ minGames: 3 }), clubs())
  assert.equal(tooMany.status, 'warn')
  const check = tooMany.checks.find(c => c.id === 'min-games')
  assert.equal(check.level, 'error')
  assert.deepEqual(check.fixes.find(f => f.label === 'Tillåt matcher inom klubben'), { label: 'Tillåt matcher inom klubben', patch: { allowInterClub: true } })
  assert.deepEqual(check.fixes.find(f => f.label.startsWith('Sätt minst')), { label: 'Sätt minst 2', patch: { minGames: 2, maxGames: 5 } })
  const patched = planChecks({ ...settings({ minGames: 3 }), ...check.fixes[0].patch }, clubs())
  assert.equal(patched.status, 'ok')
  assert.equal(patched.checks.find(c => c.id === 'max-games').fixes[0].label, 'Sätt högst 3')
  const capped = planChecks(settings(), clubs())
  const maxCheck = capped.checks.find(c => c.id === 'max-games')
  assert.equal(maxCheck.level, 'warn')
  assert.deepEqual(maxCheck.fixes[0], { label: 'Sätt högst 2', patch: { maxGames: 2 } })
})

test('a later end time is suggested only when it fits before midnight and helps', () => {
  const short = settings({ endTime: '09:40', minGames: 2, maxGames: 2 })
  const later = endTimeFor(2, short, estimateCapacity(short, clubs()))
  assert.equal(later, '10:15')
  const plan = planChecks(short, clubs())
  assert.ok(plan.checks.find(c => c.id === 'min-games').fixes.some(f => f.label === 'Förläng till 10:15' && f.patch.endTime === '10:15'))
  const late = settings({ startTime: '20:00', endTime: '20:40', minGames: 10, maxGames: 10, allowInterClub: true })
  assert.equal(endTimeFor(10, late, estimateCapacity(late, clubs())), null)
})

test('meal checks catch clubs bigger than a pass and passes that run past the end', () => {
  const meal = { id: 'm1', startTime: '16:30', label: 'Lunch', duration: 45, maxTeamsPerSlot: 1 }
  const plan = planChecks(settings({ maxGames: 2, foodBreaks: [meal] }), clubs())
  const check = plan.checks.find(c => c.id === 'meal-m1')
  assert.equal(check.level, 'error')
  assert.equal(check.fixes[0].label, 'Öka till 2 lag per pass')
  assert.equal(check.fixes[0].patch.foodBreaks[0].maxTeamsPerSlot, 2)
  const fixed = planChecks(settings({ maxGames: 2, foodBreaks: [{ ...meal, maxTeamsPerSlot: 2 }] }), clubs())
  const lateCheck = fixed.checks.find(c => c.id === 'meal-m1')
  assert.equal(lateCheck.level, 'error')
  assert.deepEqual(lateCheck.fixes[0], { label: 'Förläng till 18:00', patch: { endTime: '18:00' } })
  const ok = planChecks(settings({ maxGames: 2, foodBreaks: [{ ...meal, startTime: '11:30', maxTeamsPerSlot: 2 }] }), clubs())
  assert.equal(ok.checks.find(c => c.id === 'meal-m1').level, 'ok')
})

test('the day strip marks used, free and paused cells per rink', () => {
  const s = settings({ numRinks: 2, maxGames: 2 })
  const capacity = estimateCapacity(s, clubs())
  const strip = dayStrip(s, capacity)
  if (!capacity.timeline) return
  assert.equal(strip.length, 2)
  assert.equal(strip[0].name, 'Rink 1')
  assert.equal(strip.flatMap(r => r.cells).filter(c => c.kind === 'match').length, capacity.totalGames)
})
