import lz from 'lz-string'
import { MAX_PAYLOAD_BYTES, validatePayload } from '../lib/tournament.js'
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lz

export function useShareUrl() {
  function generateShareUrl(clubs, settings, schedule) {
    const data = { c: clubs, s: settings, g: schedule }
    const compressed = compressToEncodedURIComponent(JSON.stringify(data))
    return window.location.origin + window.location.pathname + '#s=' + compressed
  }

  function loadFromUrl() {
    const hash = window.location.hash
    if (!hash.startsWith('#s=')) return null

    try {
      const compressed = hash.slice(3)
      if (compressed.length > 8192) return null
      const json = decompressFromEncodedURIComponent(compressed)
      if (!json || new TextEncoder().encode(json).length > MAX_PAYLOAD_BYTES) return null
      const data = JSON.parse(json)
      if (!validatePayload(data)) return null
      return data
    } catch {
      return null
    }
  }

  async function shareSchedule(clubs, settings, schedule) {
    const url = generateShareUrl(clubs, settings, schedule)
    history.replaceState(null, '', '#s=' + url.split('#s=')[1])
    await navigator.clipboard.writeText(url)
    return url
  }

  return { generateShareUrl, loadFromUrl, shareSchedule }
}
