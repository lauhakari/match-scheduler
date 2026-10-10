import { validatePayload, MAX_PAYLOAD_BYTES } from '../lib/tournament.js'

async function request(url, options) {
  let response
  try { response = await fetch(url, options) }
  catch { throw new Error('Kunde inte nå servern. Ditt schema finns kvar i webbläsaren.') }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Kunde inte spara eller läsa schemat. Försök igen.')
  }
  return response.status === 204 ? null : response.json()
}

export function useSavedSchedule() {
  async function load(id) {
    const result = await request(`/api/schedules/${id}`)
    if (!validatePayload(result.data) || !Number.isInteger(result.version) || result.version < 1) throw new Error('Det sparade schemat är ogiltigt.')
    return result
  }

  async function save(data, saved = null) {
    if (!validatePayload(data)) throw new Error('Schemat är ogiltigt. Generera ett nytt schema innan du sparar.')
    const body = JSON.stringify({ data, ...(saved ? { version: saved.version } : {}) })
    if (new TextEncoder().encode(body).length > MAX_PAYLOAD_BYTES) throw new Error('Schemat är för stort för att sparas.')
    return request(saved ? `/api/schedules/${saved.id}` : '/api/schedules', {
      method: saved ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(saved ? { Authorization: `Bearer ${saved.editToken}` } : {}) },
      body,
    })
  }

  async function remove(saved) {
    await request(`/api/schedules/${saved.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${saved.editToken}` } })
  }

  function links(saved) {
    const publicUrl = `${window.location.origin}/s/${saved.id}`
    return { publicUrl, editUrl: `${publicUrl}#edit=${saved.editToken}` }
  }

  return { load, save, remove, links }
}
