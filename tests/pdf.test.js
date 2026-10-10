import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import { usePdfExport } from '../src/composables/usePdfExport.js'
import { useScheduler } from '../src/composables/useScheduler.js'
import { normalizeClubs } from '../src/lib/tournament.js'

test('full and club PDFs contain the generated games after draft names change', () => {
  const clubs = normalizeClubs(['A', 'B'].map(name => ({ name, teams: [{ name: '1' }, { name: '2' }] })))
  const settings = { startTime: '09:00', endTime: '17:00', matchLength: 15, breakLength: 5, numRinks: 1, minGames: 2, maxGames: 5, minRest: 20, allowInterClub: false, pauses: [], foodBreaks: [] }
  const scheduler = useScheduler(); scheduler.generate(settings, clubs)
  const snapshot = JSON.parse(JSON.stringify(clubs))
  clubs[0].teams[0].name = 'Changed'
  const docs = [], save = jsPDF.API.save
  jsPDF.API.save = function(filename) { docs.push({ filename, output: this.output() }) }
  try {
    const pdf = usePdfExport()
    pdf.exportPdf(scheduler.schedule.value, settings, snapshot)
    pdf.exportPdf(scheduler.schedule.value, settings, snapshot, { includeSummary: false })
    for (const club of snapshot) pdf.exportClubPdf(scheduler.schedule.value, settings, snapshot, club)
  } finally { jsPDF.API.save = save }
  assert.equal(docs.length, 4)
  for (const doc of docs) assert(doc.output.startsWith('%PDF-'))
  for (const doc of docs.slice(2)) {
    assert(!doc.output.includes('Inga matcher schemalagda'))
    assert.match(doc.output, /09:00/)
    assert(!doc.output.includes('Changed'))
  }
})
