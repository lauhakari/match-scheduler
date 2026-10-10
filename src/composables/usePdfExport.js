import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { expandPauses } from './useScheduler.js'
import { getTeamId } from '../lib/tournament.js'

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

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getEffectiveDuration(club, pause) {
  const lookupId = pause.originalId || pause.id
  if (club.pauseDurations && lookupId in club.pauseDurations) {
    return club.pauseDurations[lookupId]
  }
  return pause.defaultDuration || 0
}

function buildPauseInfo(pause, clubs) {
  const pauseStart = timeToMinutes(pause.startTime)
  const affected = clubs
    .filter(club => {
      if (pause._isFoodBreak) return (pause._clubNames || []).includes(club.name)
      return true
    })
    .map(club => {
      const dur = pause._isFoodBreak ? pause.defaultDuration : getEffectiveDuration(club, pause)
      return dur > 0 ? { name: club.name, duration: dur } : null
    })
    .filter(Boolean)

  if (affected.length === 0) return null

  const windowDuration = pause.windowDuration || 0
  const maxDur = Math.max(...affected.map(c => c.duration))
  const spread = windowDuration > 0 && affected.length > 1
    ? Math.max(0, Math.floor((windowDuration - maxDur) / (affected.length - 1) / 10) * 10)
    : 0

  const clubTimes = affected.map((c, i) => {
    const start = pauseStart + i * spread
    return { ...c, startTime: minutesToTime(start), endTime: minutesToTime(start + c.duration) }
  })

  const allSameDuration = affected.every(c => c.duration === affected[0].duration)
  const isUniform = spread === 0 && allSameDuration

  return {
    label: pause.label || 'Paus',
    startTime: pause.startTime,
    endTime: clubTimes[0]?.endTime,
    isUniform,
    clubs: clubTimes,
    isRecurring: !!pause.originalId || !!pause._isFoodBreak,
    isFoodBreak: !!pause._isFoodBreak,
  }
}

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

    // --- Build interleaved rows (games + recurring pauses) ---
    const lastSlot = schedule.slots[schedule.slots.length - 1]
    const endMin = lastSlot ? timeToMinutes(lastSlot.endTime) : 0
    const allPauses = [
      ...expandPauses(settings.pauses || [], endMin),
      ...(schedule.generatedPauses || []),
      ...(schedule.foodBreakPauses || []),
    ]

    // Separate recurring and non-recurring pauses
    const nonRecurringPauses = []
    const insertedPauses = new Set()

    const rinkHeaders = Array.from({ length: schedule.numRinks }, (_, i) => `Rink ${i + 1}`)
    const head = [['Tid', ...rinkHeaders]]

    // row types: 'slot' or 'pause'
    const rowTypes = []
    const body = []
    const slotData = []

    for (const slot of schedule.slots) {
      const slotStart = timeToMinutes(slot.time)

      // Insert recurring pause rows before this slot
      for (const pause of allPauses) {
        if (insertedPauses.has(pause.id)) continue
        const pauseStart = timeToMinutes(pause.startTime)
        if (slotStart >= pauseStart) {
          const info = buildPauseInfo(pause, clubs)
          if (info) {
            if (info.isFoodBreak) {
              // Food breaks: inline row AND separate table
              const pauseText = `${info.label}  ${info.startTime}–${info.endTime}`
              body.push([{ content: pauseText, colSpan: schedule.numRinks + 1, styles: { halign: 'center' } }])
              rowTypes.push('pause')
              slotData.push(null)
              nonRecurringPauses.push(info)
            } else if (info.isRecurring) {
              // Recurring: inline row only
              const pauseText = `${info.label}  ${info.startTime}–${info.endTime}`
              body.push([{ content: pauseText, colSpan: schedule.numRinks + 1, styles: { halign: 'center' } }])
              rowTypes.push('pause')
              slotData.push(null)
            } else {
              // Non-recurring: separate table only
              nonRecurringPauses.push(info)
            }
          }
          insertedPauses.add(pause.id)
        }
      }

      // Add game slot row
      const cells = [slot.time + '\n' + slot.endTime]
      const rinkMatches = []
      for (let r = 0; r < schedule.numRinks; r++) {
        const match = slot.matches.find(m => m.rink === r + 1)
        if (match && match.home && match.away) {
          cells.push(`${match.home.clubName}  ${match.home.name}\nmot\n${match.away.clubName}  ${match.away.name}`)
        } else {
          cells.push('—')
        }
        rinkMatches.push(match)
      }
      body.push(cells)
      rowTypes.push('slot')
      slotData.push(rinkMatches)
    }

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
        if (data.section === 'body') {
          const row = data.row.index
          if (rowTypes[row] === 'pause') {
            // Style pause rows with amber accent
            data.cell.styles.fillColor = [255, 251, 235]
            data.cell.styles.textColor = [120, 80, 10]
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fontSize = 8
          } else if (data.column.index > 0) {
            // Color match cells based on clubs
            const col = data.column.index - 1
            const match = slotData[row]?.[col]
            if (match?.home && match?.away) {
              const homeColors = clubColorMap[match.home.clubName]
              const awayColors = clubColorMap[match.away.clubName]
              if (homeColors && awayColors) {
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
        }
      },
      didDrawCell(data) {
        if (data.section === 'body' && rowTypes[data.row.index] === 'slot' && data.column.index > 0) {
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

    // --- Non-recurring pause tables (grouped by label) ---
    const pauseGroups = new Map()
    for (const pauseInfo of nonRecurringPauses) {
      const key = pauseInfo.label
      if (!pauseGroups.has(key)) pauseGroups.set(key, [])
      pauseGroups.get(key).push(pauseInfo)
    }

    for (const [label, groupPauses] of pauseGroups) {
      let y = doc.lastAutoTable.finalY + 8
      if (y + 30 > pageH) {
        doc.addPage()
        y = 14
      }

      // Group title
      const firstTime = groupPauses[0].startTime
      const lastPause = groupPauses[groupPauses.length - 1]
      const lastTime = lastPause.endTime
      doc.setFillColor(255, 251, 235)
      doc.roundedRect(12, y, 80, 7, 1.5, 1.5, 'F')
      doc.setTextColor(120, 80, 10)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`${label.toUpperCase()}  ${firstTime}–${lastTime}`, 16, y + 5)

      // Combine all clubs from all slots in this group into one table
      const tableBody = []
      const clubColors = []
      for (const pauseInfo of groupPauses) {
        for (const c of pauseInfo.clubs) {
          tableBody.push([c.name, c.startTime, c.endTime])
          clubColors.push(clubColorMap[c.name])
        }
      }

      autoTable(doc, {
        startY: y + 10,
        head: [['Klubb', 'Start', 'Slut']],
        body: tableBody,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 3,
          lineColor: [203, 213, 225],
          lineWidth: 0.3,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [120, 80, 10],
          textColor: [255, 251, 235],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'center' },
          2: { halign: 'center' },
        },
        didParseCell(data) {
          if (data.section === 'body' && data.column.index === 0) {
            const colors = clubColors[data.row.index]
            if (colors) {
              data.cell.styles.fillColor = colors.bg
              data.cell.styles.textColor = colors.text
            }
          }
        },
      })
    }

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

  function exportClubPdf(schedule, settings, clubs, targetClub) {
    const doc = new jsPDF({ orientation: 'portrait' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    // Club color
    const clubIndex = clubs.findIndex(c => c.name === targetClub.name)
    const colors = CLUB_PALETTE[clubIndex >= 0 ? clubIndex % CLUB_PALETTE.length : 0]

    // --- Header ---
    doc.setFillColor(...colors.accent)
    doc.rect(0, 0, pageW, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(targetClub.name.toUpperCase(), 14, 12)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${settings.startTime} – ${settings.endTime}  ·  ${settings.matchLength} min matcher`, 14, 19)

    // --- Collect pauses for this club ---
    const lastSlot = schedule.slots[schedule.slots.length - 1]
    const endMin = lastSlot ? timeToMinutes(lastSlot.endTime) : 0
    const allPauses = [
      ...expandPauses(settings.pauses || [], endMin),
      ...(schedule.generatedPauses || []),
      ...(schedule.foodBreakPauses || []),
    ]

    // Build pause events for this club — only non-recurring (set time) pauses
    const clubPauseEvents = []
    for (const pause of allPauses) {
      if (pause.originalId) continue
      if (pause._isFoodBreak && !(pause._clubNames || []).includes(targetClub.name)) continue
      const dur = pause._isFoodBreak ? pause.defaultDuration : getEffectiveDuration(targetClub, pause)
      if (dur <= 0) continue
      const pStart = timeToMinutes(pause.startTime)
      const windowDuration = pause.windowDuration || 0

      // Calculate this club's specific start time (accounting for spread)
      const affected = clubs.filter(c => getEffectiveDuration(c, pause) > 0)
      const maxDur = Math.max(...affected.map(c => getEffectiveDuration(c, pause)))
      const spread = windowDuration > 0 && affected.length > 1
        ? Math.max(0, Math.floor((windowDuration - maxDur) / (affected.length - 1) / 10) * 10)
        : 0
      const clubIdx = affected.findIndex(c => c.name === targetClub.name)
      const clubStart = pStart + (clubIdx >= 0 ? clubIdx * spread : 0)

      clubPauseEvents.push({
        label: pause.label || 'Paus',
        startMin: clubStart,
        endMin: clubStart + dur,
        startTime: minutesToTime(clubStart),
        endTime: minutesToTime(clubStart + dur),
      })
    }

    // --- Per-team tables ---
    let y = 30

    for (const team of targetClub.teams) {
      const teamId = getTeamId(targetClub, team)

      // Collect this team's games
      const teamGames = []
      for (const slot of schedule.slots) {
        for (const match of slot.matches) {
          if (!match.home || !match.away) continue
          if (match.home.id === teamId || match.away.id === teamId) {
            const opponent = match.home.id === teamId ? match.away : match.home
            teamGames.push({
              time: slot.time,
              endTime: slot.endTime,
              startMin: timeToMinutes(slot.time),
              opponent,
              rink: match.rink,
            })
          }
        }
      }

      // Sort by time
      teamGames.sort((a, b) => a.startMin - b.startMin)

      // Build interleaved rows: games + pauses
      const tableBody = []
      const tableRowTypes = []
      const insertedPauseIdxs = new Set()

      for (const game of teamGames) {
        // Insert any pauses that fall before this game
        for (let pi = 0; pi < clubPauseEvents.length; pi++) {
          if (insertedPauseIdxs.has(pi)) continue
          const pe = clubPauseEvents[pi]
          if (pe.startMin <= game.startMin) {
            tableBody.push([{ content: `${pe.label}  ${pe.startTime}–${pe.endTime}`, colSpan: 3, styles: { halign: 'center' } }])
            tableRowTypes.push('pause')
            insertedPauseIdxs.add(pi)
          }
        }

        tableBody.push([
          game.time + '–' + game.endTime,
          `${game.opponent.clubName}  ${game.opponent.name}`,
          `${game.rink}`,
        ])
        tableRowTypes.push('game')
      }

      // Insert any remaining pauses after last game
      for (let pi = 0; pi < clubPauseEvents.length; pi++) {
        if (insertedPauseIdxs.has(pi)) continue
        const pe = clubPauseEvents[pi]
        tableBody.push([{ content: `${pe.label}  ${pe.startTime}–${pe.endTime}`, colSpan: 3, styles: { halign: 'center' } }])
        tableRowTypes.push('pause')
      }

      // Check page space
      const estimatedHeight = 12 + tableBody.length * 10 + 8
      if (y + estimatedHeight > pageH - 12) {
        doc.addPage()
        y = 14
      }

      // Team name header
      doc.setFillColor(...colors.bg)
      doc.roundedRect(12, y, pageW - 24, 7, 1.5, 1.5, 'F')
      doc.setTextColor(...colors.text)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(team.name, 16, y + 5)
      y += 10

      if (tableBody.length === 0) {
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.text('Inga matcher schemalagda', 16, y + 4)
        y += 10
        continue
      }

      // Opponent color map for cell coloring
      const opponentClubs = teamGames.map(g => g.opponent.clubName)

      autoTable(doc, {
        startY: y,
        head: [['Tid', 'Motståndare', 'Rink']],
        body: tableBody,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 3,
          lineColor: [203, 213, 225],
          lineWidth: 0.3,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [...colors.accent],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 18, halign: 'center' },
        },
        didParseCell(data) {
          if (data.section === 'body') {
            if (tableRowTypes[data.row.index] === 'pause') {
              data.cell.styles.fillColor = [255, 251, 235]
              data.cell.styles.textColor = [120, 80, 10]
              data.cell.styles.fontStyle = 'bold'
            }
          }
        },
      })

      y = doc.lastAutoTable.finalY + 8
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

    const safeName = targetClub.name.replace(/[^a-zA-Z0-9\u00C0-\u024F -]/g, '').trim()
    doc.save(`${safeName}.pdf`)
  }

  return { exportPdf, exportClubPdf }
}
