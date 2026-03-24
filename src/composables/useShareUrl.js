import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

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
      const json = decompressFromEncodedURIComponent(compressed)
      if (!json) return null
      const data = JSON.parse(json)
      if (!data.c || !data.s || !data.g) return null
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
