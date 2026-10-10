import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { onRequest } from '../functions/api/schedules/[[path]].js'
import { MAX_PAYLOAD_BYTES, normalizeClubs } from '../src/lib/tournament.js'
import { useScheduler } from '../src/composables/useScheduler.js'

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_schedules.sql', import.meta.url), 'utf8'))
  t.after(() => sqlite.close())
  const DB = { prepare(sql) {
    const statement = sqlite.prepare(sql)
    let args = []
    return {
      bind(...values) { args = values; return this },
      async first() { return statement.get(...args) ?? null },
      async run() { const result = statement.run(...args); return { meta: { changes: result.changes } } },
    }
  } }
  const s = { startTime: '09:00', endTime: '17:00', matchLength: 15, breakLength: 5,
    numRinks: 1, minGames: 2, maxGames: 5, minRest: 20, allowInterClub: false, pauses: [], foodBreaks: [] }
  const c = normalizeClubs(['A', 'B'].map(name => ({ name, teams: [{ name: '1' }, { name: '2' }] })))
  const scheduler = useScheduler()
  scheduler.generate(s, c)
  const data = JSON.parse(JSON.stringify({ s, c, g: scheduler.schedule.value, w: scheduler.warnings.value }))
  async function request(method, path = [], body, headers = {}, env = { DB }) {
    const pending = []
    const init = { method, headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers } }
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
      init.headers['Content-Type'] ??= 'application/json'
    }
    const response = await onRequest({ request: new Request(`https://tournament.test/api/schedules/${path.join('/')}`, init),
      env, params: { path }, waitUntil(promise) { pending.push(promise) } })
    await Promise.all(pending)
    return response
  }
  const create = async () => {
    const response = await request('POST', [], { data })
    assert.equal(response.status, 201)
    return response.json()
  }
  return { sqlite, data, request, create }
}

test('saved schedules have permanent public IDs, public data and hashed edit credentials', async t => {
  const { sqlite, data, request, create } = fixture(t)
  const saved = await create()
  assert.match(saved.id, /^[a-f0-9]{32}$/)
  assert.match(saved.editToken, /^[a-f0-9]{64}$/)
  assert.equal(saved.version, 1)
  const response = await request('GET', [saved.id])
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const publicResult = await response.json()
  assert.deepEqual(publicResult.data, data)
  assert.equal(publicResult.id, saved.id)
  assert.equal(publicResult.version, 1)
  assert.ok(!JSON.stringify(publicResult).includes(saved.editToken))
  assert.equal(publicResult.editToken, undefined)
  const row = sqlite.prepare('SELECT * FROM schedules WHERE id = ?').get(saved.id)
  assert.match(row.edit_token_hash, /^[a-f0-9]{64}$/)
  assert.notEqual(row.edit_token_hash, saved.editToken)
  assert.ok(!JSON.stringify(row).includes(saved.editToken))
})

test('only the edit token can update or delete a saved schedule', async t => {
  const { data, request, create } = fixture(t)
  const saved = await create()
  for (const method of ['PUT', 'DELETE']) for (const authorization of [undefined, 'Bearer invalid', `Bearer ${'0'.repeat(64)}`]) {
    const headers = authorization ? { Authorization: authorization } : {}
    const response = await request(method, [saved.id], method === 'PUT' ? { data, version: 1 } : undefined, headers)
    assert.equal(response.status, 403)
  }
  const response = await request('GET', [saved.id])
  assert.equal(response.status, 200)
  assert.equal((await response.json()).version, 1)
})

test('updates keep the public ID and reject stale versions without overwriting the newer schedule', async t => {
  const { data, request, create } = fixture(t)
  const saved = await create(), headers = { Authorization: `Bearer ${saved.editToken}` }
  const changed = structuredClone(data)
  changed.w = ['Updated warning']
  const response = await request('PUT', [saved.id], { data: changed, version: 1 }, headers)
  assert.equal(response.status, 200)
  const updated = await response.json()
  assert.equal(updated.id, saved.id)
  assert.equal(updated.version, 2)
  const stale = await request('PUT', [saved.id], { data, version: 1 }, headers)
  assert.equal(stale.status, 409)
  const publicResult = await (await request('GET', [saved.id])).json()
  assert.equal(publicResult.version, 2)
  assert.deepEqual(publicResult.data, changed)
  assert.equal((await request('PUT', [saved.id], { data }, headers)).status, 400)
  assert.equal((await request('DELETE', [saved.id], undefined, headers)).status, 204)
  assert.equal((await request('GET', [saved.id])).status, 404)
  assert.equal((await request('PUT', [saved.id], { data, version: 2 }, headers)).status, 403)
})

test('the database enforces 30 saves per IP per hour, while public reads stay available', async t => {
  t.mock.method(Date, 'now', () => 1_800_000_000_000)
  const { data, request, create } = fixture(t)
  const saved = await create()
  for (let i = 1; i < 30; i++) assert.equal((await request('POST', [], { data })).status, 201)
  const limited = await request('POST', [], { data })
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('Retry-After'), '3600')
  assert.equal((await request('GET', [saved.id])).status, 200)
  assert.equal((await request('POST', [], { data }, { 'CF-Connecting-IP': '192.0.2.2' })).status, 201)
  t.mock.method(Date, 'now', () => 1_800_003_600_000)
  assert.equal((await request('POST', [], { data })).status, 201)
})

test('malformed, oversized and incorrect-content-type bodies are rejected without saving', async t => {
  const { sqlite, data, request } = fixture(t)
  for (const body of ['{', '{}', JSON.stringify({ data: { c: [], s: {}, g: {} } }),
    JSON.stringify({ data, padding: 'x'.repeat(MAX_PAYLOAD_BYTES) })]) {
    assert.equal((await request('POST', [], body)).status, 400)
  }
  assert.equal((await request('POST', [], JSON.stringify({ data }), { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await request('POST')).status, 415)
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM schedules').get().count, 0)
})

test('invalid routes, unsupported methods and unavailable database return explicit failures', async t => {
  const { data, request } = fixture(t)
  const id = 'a'.repeat(32)
  assert.equal((await request('GET', [id])).status, 404)
  assert.equal((await request('GET', ['not-an-id'])).status, 404)
  assert.equal((await request('GET', [id, 'extra'])).status, 404)
  assert.equal((await request('POST', [id], { data })).status, 404)
  assert.equal((await request('GET')).status, 404)
  const unsupported = await request('PATCH', [id], { data })
  assert.equal(unsupported.status, 405)
  assert.ok(unsupported.headers.get('Allow').includes('PUT'))
  assert.equal((await request('POST', [], { data }, {}, {})).status, 503)
})

test('cross-origin writes are rejected before any database changes', async t => {
  const { sqlite, data, request, create } = fixture(t)
  const saved = await create(), auth = { Authorization: `Bearer ${saved.editToken}` }
  for (const foreign of [{ Origin: 'https://other.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await request('POST', [], { data }, foreign)).status, 403)
    assert.equal((await request('PUT', [saved.id], { data, version: 1 }, { ...auth, ...foreign })).status, 403)
    assert.equal((await request('DELETE', [saved.id], undefined, { ...auth, ...foreign })).status, 403)
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM schedules').get().count, 1)
  assert.equal((await request('POST', [], { data }, { Origin: 'https://tournament.test' })).status, 201)
})
