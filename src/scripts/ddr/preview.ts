import { getSharedAudioContext } from "../../lib/audio-context"

// Hover/landing previews, on a page-owned <audio> separate from the
// global player. Plays a ~20s window starting a third of the way into
// the track, looping with short fades, like the arcade's song select.
//
// Like PlayerBar, the element is requested with crossorigin so a Web
// Audio graph (gain for fades + analyser for the waveform) can read
// it. If the host sends no CORS headers the request fails; we drop
// the attribute and retry, fall back to volume-based fades, and expose
// no analyser (the waveform then goes procedural). The graph is only
// built after a CORS load succeeded -- tainted media routed through a
// MediaElementSource plays as silence.

export type PreviewTrack = {
  id: string
  audioUrl: string
  durationSeconds: number
}

const WINDOW_S = 20
const FADE_IN_MS = 250
const LOOP_FADE_OUT_MS = 120
const LOOP_FADE_IN_MS = 200

export function createPreviewPlayer(
  audio: HTMLAudioElement,
  hooks: {
    // audible state or analyser changed
    onChange: () => void
    // the browser refused to start audio (no user activation yet)
    onBlocked: () => void
  },
) {
  let track: PreviewTrack | null = null
  let token = 0
  let pendingTimer: number | null = null
  let audible = false
  let loopBusy = false
  let corsBlocked = false
  let gain: GainNode | null = null
  let analyser: AnalyserNode | null = null
  let volumeRaf: number | null = null

  function windowFor(t: PreviewTrack, liveDuration?: number) {
    const d =
      Number.isFinite(liveDuration) && liveDuration! > 0
        ? liveDuration!
        : t.durationSeconds
    const start = d > 30 ? d / 3 : 0
    const end = d > 0 ? Math.min(start + WINDOW_S, d - 0.5) : start + WINDOW_S
    return { start, end }
  }

  // ---------- level (gain node when available, element volume otherwise) ----------
  function cancelVolumeRamp() {
    if (volumeRaf !== null) cancelAnimationFrame(volumeRaf)
    volumeRaf = null
  }

  function setLevel(v: number) {
    cancelVolumeRamp()
    if (gain) {
      const ctx = gain.context
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setValueAtTime(v, ctx.currentTime)
    } else {
      audio.volume = v
    }
  }

  function rampTo(v: number, ms: number) {
    cancelVolumeRamp()
    if (gain) {
      const ctx = gain.context
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(v, now + Math.max(ms, 1) / 1000)
      return
    }
    const from = audio.volume
    const start = performance.now()
    const step = (now: number) => {
      const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms)
      audio.volume = Math.max(0, Math.min(1, from + (v - from) * t))
      volumeRaf = t < 1 ? requestAnimationFrame(step) : null
    }
    volumeRaf = requestAnimationFrame(step)
  }

  function ensureGraph() {
    if (gain || corsBlocked || !audio.crossOrigin) return
    const ctx = getSharedAudioContext()
    // A suspended context would silence the element once connected.
    if (!ctx || ctx.state !== "running") return
    try {
      const source = ctx.createMediaElementSource(audio)
      const g = ctx.createGain()
      const a = ctx.createAnalyser()
      a.fftSize = 1024
      a.smoothingTimeConstant = 0.6
      // hand the current element level over to the gain node
      g.gain.value = audio.volume
      audio.volume = 1
      source.connect(g)
      g.connect(a)
      a.connect(ctx.destination)
      gain = g
      analyser = a
    } catch {
      // already claimed -- keep using volume fades
    }
  }

  // ---------- element events ----------
  audio.addEventListener("playing", () => {
    if (!track) return
    cancelVolumeRamp()
    ensureGraph()
    if (!audible) {
      audible = true
      rampTo(1, FADE_IN_MS)
      hooks.onChange()
    }
  })

  audio.addEventListener("loadedmetadata", () => {
    if (!track) return
    // Media-fragment (#t=) seeking isn't universal; enforce the window.
    const { start } = windowFor(track, audio.duration)
    if (audio.currentTime < start - 1) audio.currentTime = start
  })

  audio.addEventListener("timeupdate", () => {
    if (!track || !audible || loopBusy) return
    const { start, end } = windowFor(track, audio.duration)
    if (audio.currentTime < end - 0.25) return
    loopBusy = true
    const my = token
    rampTo(0, LOOP_FADE_OUT_MS)
    window.setTimeout(() => {
      if (token !== my) return
      audio.currentTime = start
      rampTo(1, LOOP_FADE_IN_MS)
      loopBusy = false
    }, LOOP_FADE_OUT_MS + 10)
  })

  audio.addEventListener("ended", () => {
    if (!track) return
    audio.currentTime = windowFor(track, audio.duration).start
    audio.play().catch(() => {})
  })

  audio.addEventListener("error", () => {
    if (!track || corsBlocked || gain || !audio.crossOrigin) return
    corsBlocked = true
    audio.removeAttribute("crossorigin")
    begin(token)
  })

  // ---------- control ----------
  function begin(my: number) {
    if (token !== my || !track) return
    pendingTimer = null
    loopBusy = false
    setLevel(0)
    const { start } = windowFor(track)
    audio.src = `${track.audioUrl}#t=${start.toFixed(2)}`
    audio.play().catch((err: DOMException) => {
      if (token !== my) return
      if (err?.name === "NotAllowedError") {
        track = null
        audible = false
        hooks.onBlocked()
        hooks.onChange()
      }
      // AbortError (src swapped mid-load) is expected -- ignore
    })
  }

  function start(next: PreviewTrack, delayMs = 0) {
    if (track?.id === next.id) return
    if (pendingTimer !== null) window.clearTimeout(pendingTimer)
    pendingTimer = null
    token++
    const my = token
    const wasAudible = audible
    track = next
    audible = false
    if (wasAudible) hooks.onChange()
    if (delayMs > 0) pendingTimer = window.setTimeout(() => begin(my), delayMs)
    else begin(my)
  }

  function stop(fadeMs = 150) {
    if (pendingTimer !== null) window.clearTimeout(pendingTimer)
    pendingTimer = null
    if (!track) return
    token++
    const my = token
    const wasAudible = audible
    track = null
    audible = false
    loopBusy = false
    if (wasAudible && fadeMs > 0) {
      rampTo(0, fadeMs)
      window.setTimeout(() => {
        if (token === my) audio.pause()
      }, fadeMs + 20)
    } else {
      setLevel(0)
      audio.pause()
    }
    if (wasAudible) hooks.onChange()
  }

  function destroy() {
    stop(0)
    cancelVolumeRamp()
    audio.removeAttribute("src")
    audio.load()
  }

  return {
    start,
    stop,
    destroy,
    get activeId() {
      return track?.id ?? null
    },
    get audible() {
      return audible
    },
    get analyser() {
      return analyser
    },
  }
}

export type PreviewPlayer = ReturnType<typeof createPreviewPlayer>
