import assert from "node:assert"
import type { CollectionEntry } from "astro:content"

export type YearRange = { min: number; max: number }

/** Earliest/latest release year across the albums collection, or null if
 * none has a usable release year. Shared by Nav.astro, index.astro, and
 * albums/index.astro so the archive range reads consistently everywhere
 * instead of each page hardcoding or recomputing it differently. */
export function getYearRange(
  albums: CollectionEntry<"albums">[],
): YearRange | null {
  const years = albums
    .map((a) => a.data.releaseDate?.getUTCFullYear())
    .filter((y): y is number => typeof y === "number")
  if (years.length === 0) return null
  return { min: Math.min(...years), max: Math.max(...years) }
}

/** "SC-2011/26" style archive index label; "SC" alone if there's no range. */
export function formatArchiveIndex(range: YearRange | null): string {
  if (!range) return "SC"
  return `SC-${range.min}/${String(range.max).slice(-2)}`
}

export type Era = { token: string; bg: string; fg: string }

// Thresholds and colors read from the POC library page's ERAS array.
const ERAS: { from: number; token: string; fg: string }[] = [
  { from: 2012, token: "--era-2012", fg: "var(--void)" },
  { from: 2015, token: "--era-2015", fg: "var(--void)" },
  { from: 2018, token: "--era-2018", fg: "var(--bone)" },
  { from: 2021, token: "--era-2021", fg: "var(--bone)" },
  { from: 2024, token: "--era-2024", fg: "var(--bone)" },
]

/** Buckets a year to its era token. The POC's own eraOf() returns
 * undefined for any year before the first era (2012) -- the real
 * catalog has a 2011 album, so anything earlier than the first
 * threshold clamps into that earliest bucket instead. */
export function eraOf(year: number): Era {
  const bucket = [...ERAS].reverse().find((e) => year >= e.from) ?? ERAS[0]
  return { token: bucket.token, bg: `var(${bucket.token})`, fg: bucket.fg }
}

/** One angular sigil per era, shown in each album's tile on the archives
 * wheel in place of the year (which the row's title already shows).
 * Paths on a 30x30 grid, built from 45° bars and chevrons -- original
 * marks, not lifted from any reference. */
export const ERA_SIGILS: Record<string, string[]> = {
  "--era-2012": ["M4 8l7-7 4 4-7 7 7 7-4 4-7-7z", "M16 8h10l-3 4H13z"],
  "--era-2015": ["M4 4h22l-4 4H8v14l-4 4z", "M14 14h8l-3 4h-5z"],
  "--era-2018": ["M15 2l11 11-4 4-7-7-7 7-4-4z", "M11 20h8l-3 4h-8z"],
  "--era-2021": ["M4 22L22 4l4 4L8 26z", "M4 4h8l-3 4H1z", "M18 22h8l-3 4h-8z"],
  "--era-2024": ["M2 15l8-8 4 4-4 4 4 4-4 4z", "M28 15l-8-8-4 4 4 4-4 4 4 4z"],
}

/** "m:ss" or "h:mm:ss" -> seconds; 0 for anything unparseable. */
export function parseDuration(text: string | undefined): number {
  if (!text) return 0
  const parts = text.split(":").map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return 0
  return parts.reduce((sum, n) => sum * 60 + n, 0)
}

/** seconds -> "m:ss" (minutes keep counting past 60, e.g. "72:05"). */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// Build-time assertion (no test runner in this repo) guarding the clamp
// behavior and the top-of-range bucket, per the spec's "cover it with a
// tiny test or a build-time assertion."
assert.strictEqual(eraOf(2011).token, "--era-2012", "year below the first era must clamp to era-2012")
assert.strictEqual(eraOf(2012).token, "--era-2012")
assert.strictEqual(eraOf(2017).token, "--era-2015")
assert.strictEqual(eraOf(2025).token, "--era-2024", "the latest years must resolve to the last era")
assert.strictEqual(eraOf(2026).token, "--era-2024")
assert.strictEqual(formatDuration(parseDuration("2:41") + parseDuration("1:20")), "4:01")

/** The track-position number shown to a visitor (row disc, stage "T0n"
 * code, "track n of N" subline). Sequential 1..N across the album's
 * displayed tracks, not each file's own stored trackNumber -- a deleted
 * or display:false track leaves a gap in the stored numbering that
 * reads as a bug to a visitor, not as the real sequence. `index` is the
 * track's 0-based position in the album's trackNumber-sorted,
 * already-display-filtered track list (the same `i` the row-rendering
 * loop already has).
 *
 * This is the only place that needs to change to go back to each
 * file's own stored number -- swap which return line is active. */
export function displayTrackNumber(
  track: CollectionEntry<"tracks">,
  index: number,
): number {
  return index + 1
  // return track.data.trackNumber
}
