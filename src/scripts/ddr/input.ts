// Mouse wheel / trackpad -> one wheel step per gesture. Lifted from the
// previous concept page: after a step fires, further steps are locked
// until either no wheel events arrive for ~150ms, or a new event isn't
// smaller than the previous one -- which covers both a genuinely new,
// bigger flick AND a run of same-strength mouse-wheel notches (neither
// decays the way an inertia tail does), so both unlock immediately.

const WHEEL_STEP_THRESHOLD = 70
const WHEEL_LOCK_SILENCE_MS = 150
const WHEEL_DECAY_TOLERANCE = 0.85

function normalizeWheelDeltaY(e: WheelEvent) {
  if (e.deltaMode === 1) return e.deltaY * 16 // DOM_DELTA_LINE (Firefox)
  if (e.deltaMode === 2) return e.deltaY * 800 // DOM_DELTA_PAGE (rare)
  return e.deltaY
}

export function attachWheelStepper(
  el: HTMLElement,
  onStep: (dir: 1 | -1) => void,
  opts: { signal: AbortSignal; enabled: () => boolean },
) {
  let accumulator = 0
  let locked = false
  let lastAbsDelta = 0
  let silenceTimer: number | undefined

  el.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault()
      if (!opts.enabled()) return

      window.clearTimeout(silenceTimer)
      silenceTimer = window.setTimeout(() => {
        locked = false
        accumulator = 0
        lastAbsDelta = 0
      }, WHEEL_LOCK_SILENCE_MS)

      const delta = normalizeWheelDeltaY(event)
      const absDelta = Math.abs(delta)

      if (locked) {
        const isDecaying = absDelta < lastAbsDelta * WHEEL_DECAY_TOLERANCE
        lastAbsDelta = absDelta
        if (isDecaying) return
        locked = false
        accumulator = 0
      }

      accumulator += delta
      lastAbsDelta = absDelta

      if (Math.abs(accumulator) >= WHEEL_STEP_THRESHOLD) {
        onStep(accumulator > 0 ? 1 : -1)
        locked = true
        accumulator = 0
      }
    },
    { passive: false, signal: opts.signal },
  )
}

export function isFormField(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  )
}
