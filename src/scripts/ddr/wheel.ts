// The song wheel: a vertical drum of rows with a fixed cursor at its
// center. Rows are absolutely positioned and placed every frame from a
// single float `position` that eases toward the integer `target`
// (exponential decay, ~140ms per step). Row DOM comes from the
// <template> in SongWheel.astro so it keeps that component's scoped
// styles.
//
// Like the arcade, the drum wraps around. Lists too short to fill it
// are repeated (the repeats are aria-hidden) so the drum never shows
// an empty half. "Logical" indexes refer to the list the caller passed
// in; "physical" indexes refer to rendered rows, repeats included.

export type RowSpec = {
  id: string
  title: string
  sub: string
  cat: number
  label: string
}

const EASE_DECAY_RATE = 22 // per second, framerate-independent
const SNAP_EPSILON = 0.001
const HIDE_BEYOND = 6 // slots from center
const DRUM_ROWS = 12 // enough physical rows to fill the drum both ways
const MIN_ROWS_TO_REPEAT = 3 // one or two songs repeated just looks broken

const mod = (n: number, m: number) => ((n % m) + m) % m

const easeInCubic = (t: number) => t * t * t
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function createWheel(
  ol: HTMLOListElement,
  template: HTMLTemplateElement,
  opts: {
    reducedMotion: () => boolean
    onRender?: (position: number, count: number) => void
  },
) {
  let rows: HTMLLIElement[] = []
  let count = 0 // logical rows
  let wrap = false
  // In wrap mode position/target are unbounded -- the drum keeps
  // turning the short way round -- and rows are addressed mod length.
  let position = 0
  let target = 0
  let rafId: number | null = null
  let lastFrame = 0
  let rowH = 60
  let width = 400
  let sweepX = 0
  let hovered: number | null = null // physical

  function layout() {
    const h = ol.clientHeight
    width = ol.clientWidth
    if (!h || !width) return
    rowH = Math.max(40, Math.min(h / 8.2, width * 0.14))
    ol.style.setProperty("--row-h", `${rowH}px`)
    ol.parentElement?.style.setProperty("--cursor-px", `${rowH + 8}px`)
  }

  function slotDistance(i: number) {
    let d = i - position
    if (wrap) {
      const len = rows.length
      d = mod(d, len)
      if (d > len / 2) d -= len
    }
    return d
  }

  function render() {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const d = slotDistance(i)
      const ad = Math.abs(d)
      if (ad > HIDE_BEYOND) {
        row.style.visibility = "hidden"
        continue
      }
      row.style.visibility = ""
      // rows compress toward the edges and bow to the right, so the
      // list reads as a drum turning under the fixed cursor
      // (compression stays below the scale falloff so neighbours
      // never overlap each other's subtitle line)
      const y = d * rowH * (1 - 0.02 * Math.min(ad, HIDE_BEYOND))
      const arc = (ad * ad * 0.9 + ad * 2.2) * rowH * 0.1
      const scale = Math.max(1 - 0.07 * ad, 0.62)
      const opacity = Math.max(0, Math.min(1, 1.05 - 0.17 * ad))
      const tilt = Math.max(-24, Math.min(24, -d * 4))
      const sweep = sweepX * (1 + ad * 0.22)
      row.style.transform = `translate3d(${(arc + sweep).toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateX(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`
      row.style.opacity = opacity.toFixed(3)
      row.style.zIndex = String(100 - Math.round(ad * 10))
    }
    opts.onRender?.(count ? (wrap ? mod(position, count) : position) : 0, count)
  }

  function tick(now: number) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000)
    lastFrame = now
    position += (target - position) * (1 - Math.exp(-EASE_DECAY_RATE * dt))
    if (Math.abs(target - position) < SNAP_EPSILON) position = target
    render()
    rafId = position === target ? null : requestAnimationFrame(tick)
  }

  function startAnimation() {
    if (rafId !== null) return
    lastFrame = performance.now()
    rafId = requestAnimationFrame(tick)
  }

  const physicalSelected = () =>
    rows.length ? mod(Math.round(target), rows.length) : 0
  const selectedIndex = () => (count ? physicalSelected() % count : 0)

  function markSelected() {
    const selected = physicalSelected()
    rows.forEach((row, i) => {
      const on = i === selected
      row.classList.toggle("is-selected", on)
      if (!row.hasAttribute("aria-hidden"))
        row.setAttribute("aria-selected", String(on))
    })
    const logical = rows[selectedIndex()]
    if (logical) ol.setAttribute("aria-activedescendant", logical.id)
  }

  // `index` is logical; in wrap mode the drum turns whichever way round
  // is shorter to reach it.
  function select(index: number, instant = false) {
    if (!count) return
    if (wrap) {
      let delta = mod(index, count) - selectedIndex()
      if (delta > count / 2) delta -= count
      if (delta < -count / 2) delta += count
      target = Math.round(target) + delta
    } else {
      target = Math.max(0, Math.min(count - 1, index))
    }
    markSelected()
    if (instant || opts.reducedMotion()) {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = null
      position = target
      render()
    } else {
      startAnimation()
    }
  }

  // Long titles get squeezed horizontally (down to half width) the
  // way the arcade crams names into a fixed banner, then clipped.
  function fitText() {
    for (const row of rows) {
      for (const span of row.querySelectorAll<HTMLElement>(
        ".row-title, .row-sub",
      )) {
        span.style.setProperty("--squish", "1")
        const avail = span.parentElement?.clientWidth ?? 0
        const need = span.offsetWidth
        if (avail > 0 && need > avail) {
          span.style.setProperty(
            "--squish",
            Math.max(0.5, avail / need).toFixed(3),
          )
        }
      }
    }
  }

  function setRows(specs: RowSpec[], initialIndex: number) {
    ol.replaceChildren()
    hovered = null
    count = specs.length
    const copies =
      count >= DRUM_ROWS || count < MIN_ROWS_TO_REPEAT
        ? 1
        : Math.ceil(DRUM_ROWS / count)
    wrap = count * copies >= DRUM_ROWS
    rows = []
    for (let copy = 0; copy < copies; copy++) {
      specs.forEach((spec, i) => {
        const row = (
          template.content.firstElementChild as HTMLLIElement
        ).cloneNode(true) as HTMLLIElement
        row.dataset.index = String(i)
        row.dataset.phys = String(rows.length)
        row.dataset.cat = String(spec.cat)
        if (copy === 0) {
          row.id = `ddr-row-${i}`
          row.setAttribute("aria-label", spec.label)
        } else {
          row.setAttribute("role", "presentation")
          row.setAttribute("aria-hidden", "true")
          row.removeAttribute("aria-selected")
        }
        const title = row.querySelector(".row-title")
        const sub = row.querySelector(".row-sub")
        if (title) title.textContent = spec.title
        if (sub) sub.textContent = spec.sub
        ol.append(row)
        rows.push(row)
      })
    }
    layout()
    position = target = Math.max(0, Math.min(count - 1, initialIndex))
    markSelected()
    render()
    fitText()
  }

  function setHovered(physical: number | null) {
    if (hovered === physical) return
    if (hovered !== null) rows[hovered]?.classList.remove("is-hovered")
    hovered = physical
    if (physical !== null) rows[physical]?.classList.add("is-hovered")
  }

  function setFlags(
    flags: (index: number) => { playing: boolean; previewing: boolean },
  ) {
    const cache = new Map<number, { playing: boolean; previewing: boolean }>()
    rows.forEach((row, i) => {
      const logical = i % count
      let f = cache.get(logical)
      if (!f) {
        f = flags(logical)
        cache.set(logical, f)
      }
      row.classList.toggle("is-playing", f.playing)
      row.classList.toggle("is-previewing", f.previewing)
    })
  }

  // Level change: the whole drum slides off to the right, the rows are
  // swapped at the midpoint, and the new drum slides back in.
  function sweep(midpoint: () => void): Promise<void> {
    if (opts.reducedMotion()) {
      midpoint()
      return Promise.resolve()
    }
    const distance = width * 1.1
    const animate = (
      from: number,
      to: number,
      ms: number,
      ease: (t: number) => number,
    ) =>
      new Promise<void>((resolve) => {
        const start = performance.now()
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / ms)
          sweepX = from + (to - from) * ease(t)
          render()
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      })
    return animate(0, distance, 170, easeInCubic)
      .then(() => {
        midpoint()
        sweepX = distance
        render()
      })
      .then(() => animate(distance, 0, 230, easeOutCubic))
  }

  const ro = new ResizeObserver(() => {
    layout()
    render()
    fitText()
  })
  ro.observe(ol)
  document.fonts?.ready.then(() => fitText())

  function destroy() {
    ro.disconnect()
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
  }

  return {
    select,
    setRows,
    setHovered,
    setFlags,
    sweep,
    destroy,
    rowHeight: () => rowH,
    selectedIndex,
    wraps: () => wrap,
  }
}

export type Wheel = ReturnType<typeof createWheel>
