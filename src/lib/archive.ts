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

// Build-time assertion (no test runner in this repo) guarding the clamp
// behavior and the top-of-range bucket, per the spec's "cover it with a
// tiny test or a build-time assertion."
assert.strictEqual(eraOf(2011).token, "--era-2012", "year below the first era must clamp to era-2012")
assert.strictEqual(eraOf(2012).token, "--era-2012")
assert.strictEqual(eraOf(2017).token, "--era-2015")
assert.strictEqual(eraOf(2025).token, "--era-2024", "the latest years must resolve to the last era")
assert.strictEqual(eraOf(2026).token, "--era-2024")
