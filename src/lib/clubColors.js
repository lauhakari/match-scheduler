const HUES = [265, 180, 35, 300, 345, 205, 100, 60]

export function clubColor(index) {
  const hue = HUES[((index % HUES.length) + HUES.length) % HUES.length]
  return { color: `oklch(0.5 0.15 ${hue})`, bg: `oklch(0.965 0.025 ${hue})` }
}

export function clubColorByName(clubs, clubName) {
  return clubColor(Math.max(0, (clubs || []).findIndex(c => c.name === clubName)))
}
