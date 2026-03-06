import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function usePdfExport() {
  function exportPdf(schedule, settings, clubs) {
    const doc = new jsPDF({ orientation: 'landscape' })

    // Title
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('Tournament Schedule', 14, 18)

    // Settings summary
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const settingsText = [
      `Time: ${settings.startTime} – ${settings.endTime}`,
      `Match: ${settings.matchLength}min + ${settings.breakLength}min break`,
      `Rinks: ${settings.numRinks}`,
      `Games per team: ${settings.minGames}–${settings.maxGames}`,
      `Min rest: ${settings.minRest}min`,
      `Inter-club: ${settings.allowInterClub ? 'Yes' : 'No'}`,
    ].join('   |   ')
    doc.text(settingsText, 14, 26)

    // Club listing
    const clubsText = clubs.map(c => `${c.name}: ${c.teams.map(t => t.name).join(', ')}`).join('   |   ')
    doc.text(clubsText, 14, 32)

    // Schedule table
    const rinkHeaders = Array.from({ length: schedule.numRinks }, (_, i) => `Rink ${i + 1}`)
    const head = [['Time', ...rinkHeaders]]

    const body = schedule.slots.map(slot => {
      const cells = [slot.time + ' – ' + slot.endTime]
      for (let r = 0; r < schedule.numRinks; r++) {
        const match = slot.matches.find(m => m.rink === r + 1)
        if (match && match.home && match.away) {
          cells.push(`${match.home.clubName} ${match.home.name}\nvs\n${match.away.clubName} ${match.away.name}`)
        } else {
          cells.push('—')
        }
      }
      return cells
    })

    autoTable(doc, {
      startY: 37,
      head,
      body,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
        valign: 'middle',
        halign: 'center',
      },
      headStyles: {
        fillColor: [17, 24, 39],
        textColor: [203, 213, 225],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [241, 245, 249],
      },
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold', cellWidth: 30 },
      },
    })

    // Team stats table on next area
    const finalY = doc.lastAutoTable.finalY + 10
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Team Summary', 14, finalY)

    autoTable(doc, {
      startY: finalY + 4,
      head: [['Club', 'Team', 'Games']],
      body: schedule.teamStats.map(t => [t.clubName, t.name, t.games]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [17, 24, 39],
        textColor: [203, 213, 225],
        fontStyle: 'bold',
      },
    })

    doc.save('tournament-schedule.pdf')
  }

  return { exportPdf }
}
