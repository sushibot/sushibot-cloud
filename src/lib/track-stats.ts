// Deterministic "groove radar" stats for the DDR concept page.
//
// No real per-track analysis exists in the data (see
// src/content.config.ts), so every track gets stable, unique-looking
// values derived from its slug. Hand overrides in the track JSON
// (`stats`, `bpm`, `feet`) win over the seeded values. Pure TS, no DOM
// -- imported from both Astro frontmatter (build) and client scripts.

export const RADAR_AXES = [
  "stream",
  "voltage",
  "chaos",
  "air",
  "freeze",
] as const
export type RadarAxis = (typeof RADAR_AXES)[number]
export type Radar = Record<RadarAxis, number>

export type TrackStats = Radar & {
  bpm: number
  feet: number
  // 0..5 -- index into the six DDR title colours (cream, red,
  // lavender, magenta, orange, cyan).
  category: number
}

export type StatsOverrides = {
  stats?: Partial<Radar>
  bpm?: number
  feet?: number
}

export type JacketSeed = {
  hue: number
  hue2: number
  // 0 stripes, 1 halftone, 2 grid, 3 sunburst
  pattern: 0 | 1 | 2 | 3
  angle: number
}

export type AggregateStats = {
  radar: Radar
  bpmMin: number
  bpmMax: number
  feet: number
}

// FNV-1a, 32-bit.
export function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// mulberry32 -- small, good-enough PRNG for cosmetic values.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RADAR_MIN = 18
const RADAR_MAX = 100

// Draw order is fixed and append-only: adding a new derived value
// later must go at the END so existing tracks keep their numbers.
export function seededStats(slug: string): TrackStats {
  const hash = hashString(slug)
  const rand = mulberry32(hash)
  const radar = {} as Radar
  for (const axis of RADAR_AXES) {
    radar[axis] = Math.round(RADAR_MIN + rand() * (RADAR_MAX - RADAR_MIN))
  }
  const bpm = 80 + Math.floor(rand() * 101)
  const mean =
    RADAR_AXES.reduce((sum, axis) => sum + radar[axis], 0) / RADAR_AXES.length
  const feet = clamp(Math.round(mean / 10), 1, 10)
  return { ...radar, bpm, feet, category: hash % 6 }
}

export function resolveTrackStats(
  slug: string,
  overrides: StatsOverrides = {},
): TrackStats {
  const base = seededStats(slug)
  const out: TrackStats = { ...base }
  if (overrides.stats) {
    for (const axis of RADAR_AXES) {
      const v = overrides.stats[axis]
      if (typeof v === "number") out[axis] = clamp(v, 0, 100)
    }
  }
  if (typeof overrides.bpm === "number") out.bpm = overrides.bpm
  if (typeof overrides.feet === "number")
    out.feet = clamp(overrides.feet, 1, 10)
  return out
}

export function aggregateStats(list: TrackStats[]): AggregateStats {
  const radar = {} as Radar
  for (const axis of RADAR_AXES) {
    radar[axis] = list.length
      ? Math.round(list.reduce((sum, s) => sum + s[axis], 0) / list.length)
      : 0
  }
  const bpms = list.map((s) => s.bpm)
  return {
    radar,
    bpmMin: bpms.length ? Math.min(...bpms) : 0,
    bpmMax: bpms.length ? Math.max(...bpms) : 0,
    feet: list.length ? Math.max(...list.map((s) => s.feet)) : 1,
  }
}

export function jacketSeed(key: string): JacketSeed {
  const rand = mulberry32(hashString(`jacket:${key}`))
  const hue = Math.floor(rand() * 360)
  // Second hue sits 40..140deg away so the gradient always reads as
  // two colours rather than one muddy blend.
  const hue2 = (hue + 40 + Math.floor(rand() * 100)) % 360
  const pattern = Math.floor(rand() * 4) as JacketSeed["pattern"]
  const angle = Math.floor(rand() * 360)
  return { hue, hue2, pattern, angle }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
