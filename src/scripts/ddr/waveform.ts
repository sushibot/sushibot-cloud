// Mini oscilloscope. "live" reads a real AnalyserNode; "procedural"
// fakes a lively bar display when no analyser is available (e.g. the
// audio host isn't sending CORS headers, so Web Audio can't read it);
// "idle" draws a flat line once and stops the loop.

export type WaveMode = "live" | "procedural" | "idle"

const LIME = "#c6f52e"
const LIME_HOT = "#e4ff5c"
const DIM = "rgba(198, 245, 46, 0.25)"

export function createWaveform(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")
  let analyser: AnalyserNode | null = null
  let buffer: Uint8Array<ArrayBuffer> | null = null
  let mode: WaveMode = "idle"
  let rafId: number | null = null
  let width = 0
  let height = 0
  let accent = LIME

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (mode === "idle") drawIdle()
  }

  function drawIdle() {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = DIM
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
  }

  function drawLive() {
    if (!ctx || !analyser || !buffer) return
    analyser.getByteTimeDomainData(buffer)
    ctx.clearRect(0, 0, width, height)
    const mid = height / 2
    const n = buffer.length
    const stepX = width / (n - 1)

    // soft mirrored fill under the line
    ctx.fillStyle = "rgba(198, 245, 46, 0.12)"
    ctx.beginPath()
    ctx.moveTo(0, mid)
    for (let i = 0; i < n; i++) {
      const v = (buffer[i] - 128) / 128
      ctx.lineTo(i * stepX, mid - Math.abs(v) * mid * 0.95)
    }
    for (let i = n - 1; i >= 0; i--) {
      const v = (buffer[i] - 128) / 128
      ctx.lineTo(i * stepX, mid + Math.abs(v) * mid * 0.95)
    }
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.shadowColor = accent
    ctx.shadowBlur = 6
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const v = (buffer[i] - 128) / 128
      const y = mid - v * mid * 0.95
      if (i === 0) ctx.moveTo(0, y)
      else ctx.lineTo(i * stepX, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  function drawProcedural(now: number) {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    const bars = 28
    const gap = 2
    const barW = (width - gap * (bars - 1)) / bars
    const t = now / 1000
    for (let i = 0; i < bars; i++) {
      const phase = i * 0.55
      const env =
        0.35 +
        0.3 * Math.sin(t * 5.2 + phase) +
        0.2 * Math.sin(t * 9.1 + phase * 1.7) +
        0.15 * Math.sin(t * 2.3 + i)
      const h = Math.max(2, Math.min(1, Math.abs(env)) * height * 0.9)
      ctx.fillStyle = i % 5 === 0 ? LIME_HOT : accent
      ctx.globalAlpha = 0.55 + 0.45 * Math.min(1, Math.abs(env))
      ctx.fillRect(i * (barW + gap), (height - h) / 2, barW, h)
    }
    ctx.globalAlpha = 1
  }

  function loop(now: number) {
    if (document.visibilityState === "visible") {
      if (mode === "live") drawLive()
      else if (mode === "procedural") drawProcedural(now)
    }
    rafId = mode === "idle" ? null : requestAnimationFrame(loop)
  }

  function setSource(
    next: AnalyserNode | null,
    nextMode: WaveMode,
    color?: string,
  ) {
    analyser = next
    buffer = next ? new Uint8Array(new ArrayBuffer(next.fftSize)) : null
    accent = color ?? LIME
    mode = nextMode === "live" && !next ? "procedural" : nextMode
    if (mode === "idle") {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = null
      drawIdle()
    } else if (rafId === null) {
      rafId = requestAnimationFrame(loop)
    }
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()

  function destroy() {
    ro.disconnect()
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
  }

  return { setSource, destroy }
}
