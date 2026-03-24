import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Club palette — muted but distinct, print-friendly
const CLUB_PALETTE = [
  { bg: [219, 234, 254], text: [30, 64, 115], accent: [59, 130, 246] },   // blue
  { bg: [254, 243, 199], text: [120, 80, 10], accent: [245, 158, 11] },    // amber
  { bg: [209, 250, 229], text: [20, 83, 55], accent: [16, 185, 129] },     // emerald
  { bg: [254, 215, 226], text: [120, 30, 50], accent: [244, 63, 94] },     // rose
  { bg: [233, 213, 255], text: [76, 29, 149], accent: [139, 92, 246] },    // purple
  { bg: [207, 250, 254], text: [22, 78, 99], accent: [6, 182, 212] },      // cyan
  { bg: [255, 228, 196], text: [120, 60, 15], accent: [249, 115, 22] },    // orange
  { bg: [252, 231, 243], text: [112, 26, 86], accent: [236, 72, 153] },    // pink
]

export function usePdfExport() {
  function exportPdf(schedule, settings, clubs, { includeSummary = true } = {}) {
    const doc = new jsPDF({ orientation: 'landscape' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    // Build club color map
    const clubColorMap = {}
    clubs.forEach((c, i) => {
      clubColorMap[c.name] = CLUB_PALETTE[i % CLUB_PALETTE.length]
    })

    // --- Header band ---
    doc.setFillColor(17, 24, 39)
    doc.rect(0, 0, pageW, 28, 'F')

    // Accent stripe
    doc.setFillColor(42, 149, 255)
    doc.rect(0, 28, pageW, 1.5, 'F')

    // Title
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('TURNERINGSSCHEMA', 14, 13)

    // Subtitle line
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    const subtitle = `${settings.startTime} – ${settings.endTime}  ·  ${settings.matchLength} min matcher  ·  ${settings.breakLength} min paus  ·  ${settings.numRinks} rink${settings.numRinks > 1 ? 'ar' : ''}  ·  ${settings.minGames}–${settings.maxGames} matcher/lag  ·  Vila: ${settings.minRest} min  ·  Internmatcher: ${settings.allowInterClub ? 'Ja' : 'Nej'}`
    doc.text(subtitle, 14, 21)

    // Club legend chips on right side of header
    let chipX = pageW - 14
    doc.setFontSize(7)
    clubs.slice().reverse().forEach(club => {
      const colors = clubColorMap[club.name]
      const textW = doc.getTextWidth(club.name) + 6
      chipX -= textW
      doc.setFillColor(...colors.bg)
      doc.roundedRect(chipX, 5, textW, 7, 1.5, 1.5, 'F')
      doc.setTextColor(...colors.text)
      doc.text(club.name, chipX + 3, 9.8)
      chipX -= 3
    })

    // --- Schedule table ---
    const rinkHeaders = Array.from({ length: schedule.numRinks }, (_, i) => `Rink ${i + 1}`)
    const head = [['Tid', ...rinkHeaders]]

    const body = schedule.slots.map(slot => {
      const cells = [slot.time + '\n' + slot.endTime]
      for (let r = 0; r < schedule.numRinks; r++) {
        const match = slot.matches.find(m => m.rink === r + 1)
        if (match && match.home && match.away) {
          cells.push(`${match.home.clubName}  ${match.home.name}\nmot\n${match.away.clubName}  ${match.away.name}`)
        } else {
          cells.push('—')
        }
      }
      return cells
    })

    // Track slot data for custom cell coloring
    const slotData = schedule.slots.map(slot => {
      const rinkMatches = []
      for (let r = 0; r < schedule.numRinks; r++) {
        rinkMatches.push(slot.matches.find(m => m.rink === r + 1))
      }
      return rinkMatches
    })

    autoTable(doc, {
      startY: 33,
      head,
      body,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
        valign: 'middle',
        halign: 'center',
        lineColor: [203, 213, 225],
        lineWidth: 0.3,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [226, 232, 240],
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 4,
      },
      columnStyles: {
        0: {
          halign: 'center',
          fontStyle: 'bold',
          cellWidth: 26,
          fillColor: [241, 245, 249],
          textColor: [30, 41, 59],
          fontSize: 9,
        },
      },
      didParseCell(data) {
        // Color match cells based on clubs
        if (data.section === 'body' && data.column.index > 0) {
          const row = data.row.index
          const col = data.column.index - 1
          const match = slotData[row]?.[col]
          if (match?.home && match?.away) {
            const homeColors = clubColorMap[match.home.clubName]
            const awayColors = clubColorMap[match.away.clubName]
            if (homeColors && awayColors) {
              // Blend the two club colors for the cell background
              data.cell.styles.fillColor = [
                Math.round((homeColors.bg[0] + awayColors.bg[0]) / 2),
                Math.round((homeColors.bg[1] + awayColors.bg[1]) / 2),
                Math.round((homeColors.bg[2] + awayColors.bg[2]) / 2),
              ]
            }
          } else {
            data.cell.styles.fillColor = [248, 250, 252]
            data.cell.styles.textColor = [180, 180, 180]
          }
        }
      },
      didDrawCell(data) {
        // Draw a colored left accent bar on match cells
        if (data.section === 'body' && data.column.index > 0) {
          const row = data.row.index
          const col = data.column.index - 1
          const match = slotData[row]?.[col]
          if (match?.home && match?.away) {
            const homeColors = clubColorMap[match.home.clubName]
            if (homeColors) {
              doc.setFillColor(...homeColors.accent)
              doc.rect(data.cell.x, data.cell.y, 1.2, data.cell.height, 'F')
            }
            const awayColors = clubColorMap[match.away.clubName]
            if (awayColors) {
              doc.setFillColor(...awayColors.accent)
              doc.rect(data.cell.x + data.cell.width - 1.2, data.cell.y, 1.2, data.cell.height, 'F')
            }
          }
        }
      },
    })

    // --- Team summary ---
    if (includeSummary) {
      const finalY = doc.lastAutoTable.finalY + 8

      // Check if we need a new page
      if (finalY + 40 > pageH) {
        doc.addPage()
        drawSummaryTable(doc, 14, clubs, schedule, clubColorMap)
      } else {
        drawSummaryTable(doc, finalY, clubs, schedule, clubColorMap)
      }
    }

    // --- Footer ---
    const totalPages = doc.internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFillColor(241, 245, 249)
      doc.rect(0, pageH - 8, pageW, 8, 'F')
      doc.setFontSize(6.5)
      doc.setTextColor(148, 163, 184)
      doc.text('Genererat med Spelschema', 14, pageH - 3)
      doc.text(`Sida ${i} av ${totalPages}`, pageW - 14, pageH - 3, { align: 'right' })
    }

    doc.save('turneringsschema.pdf')
  }

  function drawSummaryTable(doc, startY, clubs, schedule, clubColorMap) {
    doc.setFillColor(30, 41, 59)
    doc.roundedRect(12, startY, 60, 7, 1.5, 1.5, 'F')
    doc.setTextColor(226, 232, 240)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('LAGSAMMANFATTNING', 16, startY + 5)

    autoTable(doc, {
      startY: startY + 10,
      head: [['Klubb', 'Lag', 'Matcher', 'Status']],
      body: schedule.teamStats.map(t => {
        let status = 'OK'
        if (t.belowMin) status = 'Under min'
        else if (t.atMax) status = 'Vid max'
        return [t.clubName, t.name, t.games, status]
      }),
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
        lineColor: [203, 213, 225],
        lineWidth: 0.3,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [226, 232, 240],
        fontStyle: 'bold',
      },
      didParseCell(data) {
        if (data.section === 'body') {
          const clubName = schedule.teamStats[data.row.index]?.clubName
          const colors = clubColorMap[clubName]
          if (data.column.index === 0 && colors) {
            data.cell.styles.fillColor = colors.bg
            data.cell.styles.textColor = colors.text
            data.cell.styles.fontStyle = 'bold'
          }
          if (data.column.index === 3) {
            const val = data.cell.raw
            if (val === 'Under min') {
              data.cell.styles.textColor = [180, 100, 10]
              data.cell.styles.fontStyle = 'bold'
            } else if (val === 'OK') {
              data.cell.styles.textColor = [16, 120, 80]
            }
          }
        }
      },
      columnStyles: {
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'center' },
      },
    })
  }

  return { exportPdf }
}
