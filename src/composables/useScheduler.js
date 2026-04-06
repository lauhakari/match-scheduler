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

export function expandPauses(pauses, endMinutes) {
  const result = []
  for (const pause of pauses) {
    if (pause.recurring && pause.recurringMode === 'time' && pause.intervalMinutes > 0) {
      const startMin = timeToMinutes(pause.startTime)
      let offset = 0
      let occurrence = 1
      while (startMin + offset < endMinutes) {
        const occStart = startMin + offset
        result.push({
          ...pause,
          id: `${pause.id}__${occurrence}`,
          originalId: pause.id,
          startTime: minutesToTime(occStart),
          recurring: false,
        })
        offset += pause.intervalMinutes
        occurrence++
      }
    } else if (!pause.recurring || pause.recurringMode !== 'slots') {
      // Pass through non-recurring pauses; slot-based recurring are handled during slot generation
      result.push(pause)
    }
  }
  return result
}

export function groupFoodBreak(foodBreak, clubs) {
  const startMin = timeToMinutes(foodBreak.startTime)
  const maxTeams = foodBreak.maxTeamsPerSlot || Infinity

  // Use club list order — user controls lunch slot assignment via club ordering
  const ordered = clubs.map(c => ({ name: c.name, teamCount: c.teams.length }))

  const slots = []
  for (const club of ordered) {
    let placed = false
    for (const slot of slots) {
      const currentTeams = slot.clubNames.reduce(
        (sum, name) => sum + clubs.find(c => c.name === name).teams.length, 0
      )
      if (currentTeams + club.teamCount <= maxTeams) {
        slot.clubNames.push(club.name)
        placed = true
        break
      }
    }
    if (!placed) {
      const slotStart = startMin + slots.length * foodBreak.duration
      slots.push({
        startMin: slotStart,
        endMin: slotStart + foodBreak.duration,
        clubNames: [club.name],
      })
    }
  }

  return slots
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

    // Expand time-based recurring pauses into individual occurrences
    const expandedPauses = expandPauses(settings.pauses || [], endMin)

    // Process food breaks — group clubs into slots and generate pause-like entries
    const foodBreakPauses = []
    for (const fb of (settings.foodBreaks || [])) {
      const slots = groupFoodBreak(fb, clubs)
      for (const slot of slots) {
        foodBreakPauses.push({
          id: `${fb.id}__fb${slot.startMin}`,
          startTime: minutesToTime(slot.startMin),
          defaultDuration: fb.duration,
          windowDuration: 0,
          label: fb.label || 'Matpaus',
          _clubNames: slot.clubNames,
          _isFoodBreak: true,
        })
      }
    }

    // Collect slot-based recurring pauses (handled during slot generation)
    const slotBasedPauses = (settings.pauses || [])
      .filter(p => p.recurring && p.recurringMode === 'slots' && p.intervalSlots > 0)

    // Collect universal pauses (all clubs blocked simultaneously) to skip time slots
    // A pause is universal when all clubs break at the same time — either window=0,
    // or window > 0 but too small relative to duration (effective spread = 0)
    const universalPauses = []
    for (const pause of expandedPauses) {
      const pStart = timeToMinutes(pause.startTime)
      const uLookupId = pause.originalId || pause.id
      const clubDurations = clubs.map(club => {
        if (club.pauseDurations && uLookupId in club.pauseDurations) {
          return club.pauseDurations[uLookupId]
        }
        return pause.defaultDuration || 0
      }).filter(d => d > 0)

      if (clubDurations.length === 0) continue

      const maxDuration = Math.max(...clubDurations)
      const windowDuration = pause.windowDuration || 0

      // Check if clubs actually stagger: spread > 0 only when window > maxDuration
      const effectiveSpread = windowDuration > 0 && clubDurations.length > 1
        ? Math.max(0, Math.floor((windowDuration - maxDuration) / (clubDurations.length - 1) / 10) * 10)
        : 0

      if (effectiveSpread === 0) {
        // All clubs break at the same time — skip these slots
        universalPauses.push([pStart, pStart + maxDuration])
      }
    }

    // Check food break slots — if a slot contains ALL clubs, it's universal
    const allClubNames = new Set(clubs.map(c => c.name))
    for (const fb of (settings.foodBreaks || [])) {
      const slots = groupFoodBreak(fb, clubs)
      for (const slot of slots) {
        const slotClubs = new Set(slot.clubNames)
        if (allClubNames.size === slotClubs.size && [...allClubNames].every(c => slotClubs.has(c))) {
          universalPauses.push([slot.startMin, slot.endMin])
        }
      }
    }
    universalPauses.sort((a, b) => a[0] - b[0])

    // Helper: get max pause duration across all clubs for a given pause
    function getMaxPauseDuration(pause) {
      const lookupId = pause.originalId || pause.id
      return Math.max(
        pause.defaultDuration || 0,
        ...clubs.map(club => {
          if (club.pauseDurations && lookupId in club.pauseDurations) {
            return club.pauseDurations[lookupId]
          }
          return 0
        })
      )
    }

    // Calculate time slots, skipping over universal pauses and inserting slot-based pauses
    const timeSlots = []
    const generatedPauses = [] // track dynamically generated pauses for grid display
    const lastPausedAt = new Map() // track last slotCount each slot-based pause fired at
    let current = startMin
    let slotCount = 0
    while (current + settings.matchLength <= endMin) {
      // Check slot-based recurring pauses
      let pauseInserted = false
      for (const pause of slotBasedPauses) {
        if (slotCount > 0 && slotCount % pause.intervalSlots === 0 && lastPausedAt.get(pause.id) !== slotCount) {
          const dur = getMaxPauseDuration(pause)
          // Skip if not enough time left for break + at least one more game
          if (dur > 0 && current + dur + settings.matchLength <= endMin) {
            const occurrence = Math.floor(slotCount / pause.intervalSlots)
            generatedPauses.push({
              ...pause,
              id: `${pause.id}__s${occurrence}`,
              originalId: pause.id,
              startTime: minutesToTime(current),
              recurring: false,
            })
            lastPausedAt.set(pause.id, slotCount)
            current += dur
            pauseInserted = true
          }
        }
      }
      if (pauseInserted) continue

      // Check universal (window=0) pauses — skip the inter-game break before the pause
      const slotEnd = current + settings.matchLength
      const overlapping = universalPauses.find(([pStart, pEnd]) => current < pEnd && slotEnd > pStart)
      if (overlapping) {
        // If the overlap is caused by the trailing break, absorb it
        const withoutBreak = current - settings.breakLength
        if (slotCount > 0 && withoutBreak + settings.matchLength <= overlapping[0]) {
          // The game fits if we remove the break — add it, then skip to pause end
          timeSlots.push(withoutBreak)
          slotCount++
        }
        current = overlapping[1]
        continue
      }
      timeSlots.push(current)
      slotCount++
      current += slotLength
    }

    // Merge generated pauses into expandedPauses for club blocking
    const allPauses = [...expandedPauses, ...generatedPauses]

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
    const clubsPlayed = {} // track which clubs each team has faced
    const firstSlotTeams = new Set() // teams that play in the first time slot
    const clusterClubs = new Set(clubs.filter(c => c.cluster).map(c => c.name))
    teams.forEach(t => {
      gamesPlayed[t.id] = 0
      lastGameEnd[t.id] = -Infinity
      clubsPlayed[t.id] = new Set()
    })
    const lastTimeSlot = timeSlots[timeSlots.length - 1]

    // Precompute blocked intervals per club: { clubName: [[startMin, endMin], ...] }
    // Keyed by club.name — must match the clubName set on each team at construction time above
    const clubBlocked = {}
    clubs.forEach(club => { clubBlocked[club.name] = [] })

    // Add food break blocked intervals per club
    for (const fbPause of foodBreakPauses) {
      const pStart = timeToMinutes(fbPause.startTime)
      const pEnd = pStart + fbPause.defaultDuration
      for (const clubName of fbPause._clubNames) {
        if (clubBlocked[clubName]) {
          clubBlocked[clubName].push([pStart, pEnd])
        }
      }
    }

    for (const pause of allPauses) {
      const windowStart = timeToMinutes(pause.startTime)
      const windowDuration = pause.windowDuration || 0

      // Collect clubs that have a break for this pause
      const lookupId = pause.originalId || pause.id
      const clubBreaks = clubs.map(club => {
        const hasCustom = club.pauseDurations && lookupId in club.pauseDurations
        const duration = hasCustom ? club.pauseDurations[lookupId] : (pause.defaultDuration || 0)
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

      // Shuffle matchups for variety, then sort by priority:
      // 1. Teams with fewer games first
      // 2. Prefer clustered clubs' teams that played recently
      // Club diversity and first/last avoidance are handled as multi-pass constraints below
      const isLastSlot = slotStart === lastTimeSlot
      const shuffled = shuffle(allMatchups)
      shuffled.sort((a, b) => {
        const aMin = Math.min(gamesPlayed[a[0].id], gamesPlayed[a[1].id])
        const bMin = Math.min(gamesPlayed[b[0].id], gamesPlayed[b[1].id])
        if (aMin !== bMin) return aMin - bMin

        // Boost clustered teams that played recently (prefer shorter gaps)
        const aCluster = clusterClubs.has(a[0].clubName) || clusterClubs.has(a[1].clubName)
        const bCluster = clusterClubs.has(b[0].clubName) || clusterClubs.has(b[1].clubName)
        if (aCluster !== bCluster) {
          const aStarted = aCluster && (lastGameEnd[a[0].id] > -Infinity || lastGameEnd[a[1].id] > -Infinity)
          const bStarted = bCluster && (lastGameEnd[b[0].id] > -Infinity || lastGameEnd[b[1].id] > -Infinity)
          if (aStarted && !bStarted) return -1
          if (!aStarted && bStarted) return 1
        }

        return 0
      })

      for (let rink = 0; rink < numRinks; rink++) {
        let assigned = false

        // Multi-pass assignment with progressive relaxation:
        // Pass 0: new club opponents only + avoid first/last overlap
        // Pass 1: new club opponents only (relax first/last)
        // Pass 2: any opponent + avoid first/last overlap
        // Pass 3: any opponent (fully relaxed)
        const maxPasses = isLastSlot ? 4 : 2
        for (let pass = 0; pass < maxPasses && !assigned; pass++) {
          const requireNewClub = pass < 2
          const avoidFirstLast = isLastSlot && (pass % 2 === 0)

        for (const [home, away] of shuffled) {
          // Skip if this pairing has already been scheduled
          const pairKey = [home.id, away.id].sort().join('::vs::')
          if (usedMatchups.has(pairKey)) continue

          // Skip if either team is busy this slot
          if (busyThisSlot.has(home.id) || busyThisSlot.has(away.id)) continue

          // Skip if either team exceeded max games
          if (gamesPlayed[home.id] >= settings.maxGames) continue
          if (gamesPlayed[away.id] >= settings.maxGames) continue

          // Prefer new club opponents: skip if both teams already played against this club
          if (requireNewClub
            && clubsPlayed[home.id].has(away.clubName)
            && clubsPlayed[away.id].has(home.clubName)) continue

          // Avoid first+last slot overlap
          if (avoidFirstLast && (firstSlotTeams.has(home.id) || firstSlotTeams.has(away.id))) continue

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
          clubsPlayed[home.id].add(away.clubName)
          clubsPlayed[away.id].add(home.clubName)
          if (slotStart === timeSlots[0]) {
            firstSlotTeams.add(home.id)
            firstSlotTeams.add(away.id)
          }
          lastGameEnd[home.id] = slotStart + settings.matchLength
          lastGameEnd[away.id] = slotStart + settings.matchLength
          assigned = true
          break
        }
        } // end passes loop

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
    schedule.value = { slots, teamStats, numRinks, generatedPauses, foodBreakPauses }
  }

  return { schedule, warnings, generate }
}
