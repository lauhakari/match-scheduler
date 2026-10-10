import { MAX_PAYLOAD_BYTES, validatePayload } from '../../../src/lib/tournament.js'

const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra,
} })
const validId = value => /^[a-f0-9]{32}$/.test(value)
const validToken = value => /^[a-f0-9]{64}$/.test(value)
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
const random = length => hex(crypto.getRandomValues(new Uint8Array(length)))
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

async function readBody(request) {
  const reader = request.body?.getReader()
  if (!reader) return null
  let size = 0, text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PAYLOAD_BYTES) { await reader.cancel(); return null }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text)
  } catch { return null }
  finally { reader.releaseLock() }
}

async function admit(db, ip, now) {
  const key = await hash(ip)
  const bucket = Math.floor(now / 3_600_000)
  const row = await db.prepare(`INSERT INTO save_limits (identity, bucket, count) VALUES (?, ?, 1)
    ON CONFLICT(identity, bucket) DO UPDATE SET count = count + 1 RETURNING count`).bind(key, bucket).first()
  return row.count <= 30
}

export async function onRequest({ request, env, params, waitUntil }) {
  if (!env.DB) return json({ error: 'Sparade scheman är inte tillgängliga just nu.' }, 503)
  const segments = params.path || []
  const publicId = segments[0]
  const method = request.method
  const url = new URL(request.url)
  if (segments.length > 1 || (publicId && !validId(publicId))) return json({ error: 'Schemat hittades inte.' }, 404)
  if ((method === 'POST' && publicId) || (method !== 'POST' && !publicId)) return json({ error: 'Ogiltig adress.' }, 404)
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) return json({ error: 'Metoden stöds inte.' }, 405, { Allow: 'GET, POST, PUT, DELETE' })
  if (method === 'GET') {
    const row = await env.DB.prepare('SELECT payload, version, updated_at FROM schedules WHERE id = ?').bind(publicId).first()
    if (!row) return json({ error: 'Schemat hittades inte.' }, 404)
    return json({ id: publicId, data: JSON.parse(row.payload), version: row.version, updatedAt: row.updated_at })
  }
  const origin = request.headers.get('Origin')
  if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Begäran måste komma från samma webbplats.' }, 403)
  let tokenHash
  if (method !== 'POST') {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || ''
    if (!validToken(token)) return json({ error: 'Redigeringslänken är ogiltig.' }, 403)
    tokenHash = await hash(token)
    const row = await env.DB.prepare('SELECT version FROM schedules WHERE id = ? AND edit_token_hash = ?').bind(publicId, tokenHash).first()
    if (!row) return json({ error: 'Redigeringslänken är ogiltig.' }, 403)
  }
  const now = Date.now()
  if (!await admit(env.DB, request.headers.get('CF-Connecting-IP') || 'local', now)) return json({ error: 'För många sparningar. Försök igen om en timme.' }, 429, { 'Retry-After': '3600' })
  waitUntil(env.DB.prepare('DELETE FROM save_limits WHERE bucket < ?').bind(Math.floor(now / 3_600_000) - 1).run())
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM schedules WHERE id = ? AND edit_token_hash = ?').bind(publicId, tokenHash).run()
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Begäran måste innehålla JSON.' }, 415)
  const body = await readBody(request)
  if (!body || !validatePayload(body.data)) return json({ error: 'Schemat är ogiltigt eller för stort. Generera ett nytt schema.' }, 400)
  if (method === 'POST') {
    const id = random(16), editToken = random(32), editHash = await hash(editToken)
    await env.DB.prepare('INSERT INTO schedules (id, edit_token_hash, payload, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(id, editHash, JSON.stringify(body.data), now, now).run()
    return json({ id, editToken, version: 1, updatedAt: now }, 201)
  }
  if (!Number.isInteger(body.version) || body.version < 1) return json({ error: 'Schemat saknar versionsnummer. Ladda om sidan.' }, 400)
  const result = await env.DB.prepare('UPDATE schedules SET payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND edit_token_hash = ? AND version = ?')
    .bind(JSON.stringify(body.data), now, publicId, tokenHash, body.version).run()
  if (!result.meta.changes) return json({ error: 'Schemat har ändrats i en annan flik. Ladda om innan du sparar igen.' }, 409)
  return json({ id: publicId, version: body.version + 1, updatedAt: now })
}
