import type { Radar } from "../../lib/track-stats"

// Shared with GrooveRadar.astro, which draws the static grid at build
// time from the same numbers (viewBox 0 0 280 224).
export const RADAR_GEOMETRY = { cx: 140, cy: 118, r: 78 }

// Clockwise from the top, which is the order polygon points must go:
// STREAM (top), CHAOS (upper-right), FREEZE (lower-right), AIR
// (lower-left), VOLTAGE (upper-left).
const RING: [keyof Radar, number][] = [
  ["stream", -90],
  ["chaos", -18],
  ["freeze", 54],
  ["air", 126],
  ["voltage", 198],
]

export function pentagonPoints(
  values: Radar,
  radius = RADAR_GEOMETRY.r,
): string {
  const { cx, cy } = RADAR_GEOMETRY
  return RING.map(([axis, deg]) => {
    const rad = (deg * Math.PI) / 180
    const k = Math.max(0, Math.min(100, values[axis])) / 100
    const x = cx + Math.cos(rad) * radius * k
    const y = cy + Math.sin(rad) * radius * k
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

// Tweens the value polygon between radars (~300ms), starting from
// wherever it currently is -- including mid-tween, so rapid cursor
// moves never snap.
export function createRadar(poly: SVGPolygonElement) {
  let current: Radar = {
    stream: 20,
    voltage: 20,
    chaos: 20,
    air: 20,
    freeze: 20,
  }
  let rafId: number | null = null

  function draw(values: Radar) {
    current = values
    poly.setAttribute("points", pentagonPoints(values))
  }

  function set(target: Radar, animate: boolean) {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    if (!animate) {
      draw(target)
      return
    }
    const from = { ...current }
    const start = performance.now()
    const DURATION = 300
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const e = easeOutCubic(t)
      const next = {} as Radar
      for (const key of Object.keys(target) as (keyof Radar)[]) {
        next[key] = from[key] + (target[key] - from[key]) * e
      }
      draw(next)
      rafId = t < 1 ? requestAnimationFrame(step) : null
    }
    rafId = requestAnimationFrame(step)
  }

  function destroy() {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
  }

  return { set, destroy }
}
