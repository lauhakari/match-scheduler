import { ref } from 'vue'

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateMatchups(teams, allowInterClub) {
  const matchups = []
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      if (!allowInterClub && teams[i].clubName === teams[j].clubName) {
        continue
      }
      matchups.push([teams[i], teams[j]])
    }
  }
  return matchups
}

export function useScheduler() {
  const schedule = ref(null)
  const warnings = ref([])

  function generate(settings, clubs) {
    const teams = []
    clubs.forEach(club => {
      club.teams.forEach(team => {
        teams.push({
          id: `${club.name}::${team.name}`,
          name: team.name,
          clubName: club.name,
        })
      })
    })

    if (teams.length < 2) {
      warnings.value = ['Minst 2 lag krävs för att generera ett schema.']
      schedule.value = null
      return
    }

    const startMin = timeToMinutes(settings.startTime)
    const endMin = timeToMinutes(settings.endTime)
    const slotLength = settings.matchLength + settings.breakLength
    const numRinks = settings.numRinks

    // Calculate time slots
    const timeSlots = []
    let current = startMin
    while (current + settings.matchLength <= endMin) {
      timeSlots.push(current)
      current += slotLength
    }

    if (timeSlots.length === 0) {
      warnings.value = ['Inga tidsperioder ryms inom det angivna tidsintervallet.']
      schedule.value = null
      return
    }

    const allMatchups = generateMatchups(teams, settings.allowInterClub)

    if (allMatchups.length === 0) {
      warnings.value = ['Inga giltiga matchningar. Kontrollera internmatch-inställningen eller lägg till fler klubbar.']
      schedule.value = null
      return
    }

    // Track per-team stats
    const gamesPlayed = {}
    const lastGameEnd = {} // minute when team's last game ends
    teams.forEach(t => {
      gamesPlayed[t.id] = 0
      lastGameEnd[t.id] = -Infinity
    })

    // Precompute blocked intervals per club: { clubName: [[startMin, endMin], ...] }
    // Keyed by club.name — must match the clubName set on each team at construction time above
    const clubBlocked = {}
    clubs.forEach(club => { clubBlocked[club.name] = [] })

    for (const pause of (settings.pauses || [])) {
      const windowStart = timeToMinutes(pause.startTime)
      const windowDuration = pause.windowDuration || 0

      // Collect clubs that have a break for this pause
      const clubBreaks = clubs.map(club => {
        const hasCustom = club.pauseDurations && pause.id in club.pauseDurations
        const duration = hasCustom ? club.pauseDurations[pause.id] : (pause.defaultDuration || 0)
        return { club, duration }
      }).filter(c => c.duration > 0)

      if (clubBreaks.length === 0) continue

      if (windowDuration > 0 && clubBreaks.length > 1) {
        // Spread clubs evenly across the window
        const maxDur = Math.max(...clubBreaks.map(c => c.duration))
        const spread = Math.max(0, Math.floor((windowDuration - maxDur) / (clubBreaks.length - 1) / 10) * 10)
        clubBreaks.forEach(({ club, duration }, i) => {
          const start = windowStart + i * spread
          clubBlocked[club.name].push([start, start + duration])
        })
      } else {
        // Fixed time: all clubs start at the same time
        clubBreaks.forEach(({ club, duration }) => {
          clubBlocked[club.name].push([windowStart, windowStart + duration])
        })
      }
    }

    function isClubBlocked(clubName, slotStart, slotEnd) {
      return (clubBlocked[clubName] || []).some(
        ([bStart, bEnd]) => slotStart < bEnd && slotEnd > bStart
      )
    }

    const usedMatchups = new Set()
    const slots = []

    for (const slotStart of timeSlots) {
      const matches = []
      const busyThisSlot = new Set()

      // Shuffle matchups for variety, then sort by priority (teams with fewer games first)
      const shuffled = shuffle(allMatchups)
      shuffled.sort((a, b) => {
        const aMin = Math.min(gamesPlayed[a[0].id], gamesPlayed[a[1].id])
        const bMin = Math.min(gamesPlayed[b[0].id], gamesPlayed[b[1].id])
        return aMin - bMin
      })

      for (let rink = 0; rink < numRinks; rink++) {
        let assigned = false

        for (const [home, away] of shuffled) {
          // Skip if this pairing has already been scheduled
          const pairKey = [home.id, away.id].sort().join('::vs::')
          if (usedMatchups.has(pairKey)) continue

          // Skip if either team is busy this slot
          if (busyThisSlot.has(home.id) || busyThisSlot.has(away.id)) continue

          // Skip if either team exceeded max games
          if (gamesPlayed[home.id] >= settings.maxGames) continue
          if (gamesPlayed[away.id] >= settings.maxGames) continue

          // Check rest constraint
          const homeRest = slotStart - lastGameEnd[home.id]
          const awayRest = slotStart - lastGameEnd[away.id]
          if (homeRest < settings.minRest || awayRest < settings.minRest) continue

          // Skip if either club is on a pause during this slot
          const slotEnd = slotStart + settings.matchLength
          if (isClubBlocked(home.clubName, slotStart, slotEnd)) continue
          if (isClubBlocked(away.clubName, slotStart, slotEnd)) continue

          // Assign this match
          matches.push({
            rink: rink + 1,
            home,
            away,
          })
          usedMatchups.add(pairKey)
          busyThisSlot.add(home.id)
          busyThisSlot.add(away.id)
          gamesPlayed[home.id]++
          gamesPlayed[away.id]++
          lastGameEnd[home.id] = slotStart + settings.matchLength
          lastGameEnd[away.id] = slotStart + settings.matchLength
          assigned = true
          break
        }

        if (!assigned) {
          matches.push({ rink: rink + 1, home: null, away: null })
        }
      }

      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotStart + settings.matchLength),
        matches,
      })
    }

    // Generate warnings
    const newWarnings = []
    teams.forEach(t => {
      if (gamesPlayed[t.id] < settings.minGames) {
        newWarnings.push(`${t.clubName} — ${t.name}: bara ${gamesPlayed[t.id]} match(er) (min: ${settings.minGames})`)
      }
    })

    // Build team stats
    const teamStats = teams.map(t => ({
      ...t,
      games: gamesPlayed[t.id],
      belowMin: gamesPlayed[t.id] < settings.minGames,
      atMax: gamesPlayed[t.id] >= settings.maxGames,
    }))

    warnings.value = newWarnings
    schedule.value = { slots, teamStats, numRinks }
  }

  return { schedule, warnings, generate }
}
