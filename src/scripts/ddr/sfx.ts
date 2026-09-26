import { getSharedAudioContext } from "../../lib/audio-context"

// Synthesized UI sounds -- lifted from the previous concept page, now
// on the tab-wide shared AudioContext. Everything no-ops gracefully if
// the context isn't running yet (e.g. the first gesture was a scroll).

const SFX_KEY = "concept-sfx-muted"
const PREVIEW_KEY = "concept-preview-muted"

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true"
  } catch {
    return false
  }
}
function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // private mode / storage disabled -- just won't persist
  }
}

export const isSfxMuted = () => readFlag(SFX_KEY)
export const setSfxMuted = (muted: boolean) => writeFlag(SFX_KEY, muted)
export const isPreviewMuted = () => readFlag(PREVIEW_KEY)
export const setPreviewMuted = (muted: boolean) => writeFlag(PREVIEW_KEY, muted)

function runningContext(): AudioContext | null {
  if (isSfxMuted()) return null
  const ctx = getSharedAudioContext()
  if (!ctx || ctx.state !== "running") return null
  return ctx
}

function blip(
  ctx: AudioContext,
  t0: number,
  opts: {
    from: number
    to?: number
    dur: number
    peak: number
    type?: OscillatorType
  },
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = opts.type ?? "triangle"
  osc.frequency.setValueAtTime(opts.from, t0)
  if (opts.to)
    osc.frequency.exponentialRampToValueAtTime(
      opts.to,
      t0 + Math.min(0.02, opts.dur / 2),
    )
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(opts.peak, t0 + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + opts.dur + 0.01)
}

// Wheel step.
export function playTick() {
  const ctx = runningContext()
  if (!ctx) return
  blip(ctx, ctx.currentTime, { from: 700, to: 1000, dur: 0.08, peak: 0.14 })
}

// Entering / leaving a year.
export function playLevelSound(kind: "open" | "close") {
  const ctx = runningContext()
  if (!ctx) return
  const freqs = kind === "open" ? [600, 900] : [900, 600]
  freqs.forEach((freq, i) => {
    blip(ctx, ctx.currentTime + i * 0.045, {
      from: freq,
      dur: 0.07,
      peak: 0.13,
    })
  })
}

// Committing a song -- a brighter rising arpeggio.
export function playDecide() {
  const ctx = runningContext()
  if (!ctx) return
  ;[660, 990, 1320].forEach((freq, i) => {
    blip(ctx, ctx.currentTime + i * 0.05, {
      from: freq,
      dur: 0.12,
      peak: 0.12,
      type: "square",
    })
  })
}
