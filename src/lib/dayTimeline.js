const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const timeToMinutes = value => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}
const minutesToTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export function dayTimeline(settings, clubs) {
  const empty = { slotLength: 0, rounds: [], pauses: [], endOfPlay: '' }
  if (!settings || !time(settings.startTime) || !time(settings.endTime)
    || settings.startTime >= settings.endTime || !Number.isInteger(settings.matchLength) || settings.matchLength < 1
    || !Number.isInteger(settings.breakLength) || settings.breakLength < 0
    || !Number.isInteger(settings.numRinks) || settings.numRinks < 1 || settings.numRinks > 10) return empty

  clubs = Array.isArray(clubs) ? clubs.filter(club => club && typeof club === 'object') : []
  const startMin = timeToMinutes(settings.startTime), endMin = timeToMinutes(settings.endTime)
  const slotLength = settings.matchLength + settings.breakLength
  const sourcePauses = Array.isArray(settings.pauses) ? settings.pauses.filter(p => p && typeof p === 'object') : []
  const expanded = []
  for (const pause of sourcePauses) {
    if (pause.recurring && pause.recurringMode === 'slots') continue
    if (!time(pause.startTime)) continue
    if (pause.recurring && pause.recurringMode === 'time' && Number.isInteger(pause.intervalMinutes) && pause.intervalMinutes > 0) {
      for (let start = timeToMinutes(pause.startTime); start < endMin; start += pause.intervalMinutes) {
        expanded.push({ ...pause, originalId: pause.id, startTime: minutesToTime(start) })
      }
    } else expanded.push(pause)
  }

  const intervals = []
  const durationFor = (club, pause) => club.pauseDurations?.[pause.originalId || pause.id] ?? (pause.defaultDuration || 0)
  for (const pause of expanded) {
    const durations = clubs.map(club => durationFor(club, pause))
    if (!durations.length || durations.some(d => !Number.isFinite(d) || d <= 0)) continue
    const maxDuration = Math.max(...durations)
    const spread = pause.windowDuration > 0 && durations.length > 1
      ? Math.max(0, Math.floor((pause.windowDuration - maxDuration) / (durations.length - 1) / 10) * 10) : 0
    if (spread === 0) {
      const start = timeToMinutes(pause.startTime)
      intervals.push({ start, end: start + Math.min(...durations), label: pause.label || '', kind: 'pause' })
    }
  }

  const meals = Array.isArray(settings.foodBreaks) ? settings.foodBreaks : []
  for (const meal of meals) {
    if (!meal || !time(meal.startTime) || !Number.isFinite(meal.duration) || meal.duration <= 0) continue
    const maxTeams = meal.maxTeamsPerSlot || Infinity
    const ordered = clubs.map(club => ({ name: club.name, count: Array.isArray(club.teams) ? club.teams.length : 0 }))
    // The scheduler rejects this meal; draft estimates must remain usable.
    if (ordered.some(club => club.count > maxTeams)) continue
    const groups = []
    for (const club of ordered) {
      const group = groups.find(group => group.count + club.count <= maxTeams)
      if (group) {
        group.count += club.count
        group.names.add(club.name)
      } else groups.push({ count: club.count, names: new Set([club.name]) })
    }
    const names = new Set(clubs.map(club => club.name))
    groups.forEach((group, index) => {
      if (group.names.size === names.size && [...names].every(name => group.names.has(name))) {
        const start = timeToMinutes(meal.startTime) + index * meal.duration
        intervals.push({ start, end: start + meal.duration, label: meal.label || 'Matpaus', kind: 'meal' })
      }
    })
  }
  intervals.sort((a, b) => a.start - b.start)

  const slotPauses = sourcePauses.filter(p => p.recurring && p.recurringMode === 'slots' && Number.isInteger(p.intervalSlots) && p.intervalSlots > 0)
  const generated = [], rounds = [], lastPausedAt = new Map()
  let current = startMin
  while (current + settings.matchLength <= endMin) {
    let inserted = false
    for (const pause of slotPauses) {
      if (rounds.length > 0 && rounds.length % pause.intervalSlots === 0 && lastPausedAt.get(pause.id) !== rounds.length) {
        const lookupId = pause.originalId || pause.id
        const duration = Math.max(pause.defaultDuration || 0, ...clubs.map(club => club.pauseDurations?.[lookupId] || 0))
        if (Number.isFinite(duration) && duration > 0 && current + duration + settings.matchLength <= endMin) {
          generated.push({ start: current, end: current + duration, label: pause.label || '', kind: 'pause' })
          current += duration
          lastPausedAt.set(pause.id, rounds.length)
          inserted = true
        }
      }
    }
    if (inserted) continue
    const overlapping = intervals.find(p => current < p.end && current + settings.matchLength > p.start)
    if (overlapping) {
      current = overlapping.end
      continue
    }
    rounds.push({ startTime: minutesToTime(current), endTime: minutesToTime(current + settings.matchLength) })
    current += slotLength
  }
  const pauses = [...intervals, ...generated].sort((a, b) => a.start - b.start)
    .map(p => ({ startTime: minutesToTime(p.start), endTime: minutesToTime(p.end), label: p.label, kind: p.kind }))
  return { slotLength, rounds, pauses, endOfPlay: rounds.at(-1)?.endTime || '' }
}
