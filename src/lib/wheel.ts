// Shared scroll-snap "wheel" mechanics, ported from the POC's createWheel
// (sushicloud-library.html). Used by both the archives album wheel and the
// per-album track wheel so the perspective/fan-tilt interaction and focus
// tracking are implemented exactly once.
//
// The wheel loops like a DDR music wheel: the real rows are repeated above
// and below as aria-hidden clones, and once scrolling comes to rest the
// position jumps by whole lists back into the middle copy. Every copy looks
// identical, so the jump is invisible and the list never runs out -- the
// selection stays centered with no empty space past either end.
//
// Rows are addressed two ways: `k` is a position in the extended (cloned)
// list, `i` is the real row index (k mod n). Everything the caller sees --
// onFocus, onActivate, goTo -- uses real indices.
export type WheelOptions = {
  onFocus?: (index: number) => void
  onActivate: (index: number) => void
  anchor?: number
}

export function createWheel(
  scroller: HTMLElement,
  ol: HTMLElement,
  { onFocus, onActivate, anchor = 0.5 }: WheelOptions,
) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

  const real = Array.from(ol.children) as HTMLElement[]
  const n = real.length

  // Enough copies on each side to cover at least 1.5 screens even for a
  // 3-track album, so a fling can't run past the clones before the
  // recenter kicks in.
  const estRow = real[0]?.offsetHeight || 88
  const copies = n ? Math.max(1, Math.ceil((window.innerHeight * 1.5) / (n * estRow))) : 0
  const before: HTMLElement[] = []
  const after: HTMLElement[] = []
  for (let c = 0; c < copies; c++) {
    for (const li of real) {
      before.push(cloneRow(li))
      after.push(cloneRow(li))
    }
  }
  ol.prepend(...before)
  ol.append(...after)

  const rows: HTMLElement[] = Array.from(ol.children) as HTMLElement[]
  rows.forEach((li, k) => (li.dataset.k = String(k)))
  const mid = copies * n // k of real row 0
  const realOf = (k: number) => ((k % n) + n) % n

  let focus = -1
  let focusReal = -1
  let prev: [number, number] = [0, -1]

  const rowH = () => (rows[0] ? rows[0].offsetHeight : 96)

  function cloneRow(li: HTMLElement) {
    const c = li.cloneNode(true) as HTMLElement
    c.setAttribute("aria-hidden", "true")
    c.dataset.clone = ""
    c.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"))
    return c
  }

  function style(li: HTMLElement, d: number) {
    const a = Math.min(Math.abs(d), 3.2)
    const x = li.firstElementChild as HTMLElement | null
    if (!x) return
    const shift = reduce ? 0 : a * a * 6.5
    const rot = reduce ? 0 : -clamp(d / 3, -1, 1) * 7
    x.style.transform = `translate3d(${shift.toFixed(1)}px,0,0) rotate(${rot.toFixed(2)}deg) scale(${(1 - 0.075 * a).toFixed(3)})`
    x.style.opacity = Math.max(0.3, 1 - 0.24 * a).toFixed(2)
  }

  function layout() {
    if (!scroller.isConnected) return
    const r = rowH()
    const h = scroller.clientHeight
    ol.style.paddingTop = Math.max(0, h * anchor - r / 2) + "px"
    ol.style.paddingBottom = Math.max(0, h * (1 - anchor) - r / 2) + "px"
    scroller.style.scrollPaddingBottom = Math.max(0, h * (1 - 2 * anchor)) + "px"
  }

  function update() {
    if (!rows.length) return
    // A ResizeObserver elsewhere isn't disconnected on client-side
    // navigation away from the page, so it can fire once more against
    // the detached (zero-height) old scroller mid-transition -- without
    // this guard that turns scrollTop/rowH() into NaN and rows[NaN]
    // throws on the next line.
    if (!scroller.isConnected) return
    const f = scroller.scrollTop / rowH()
    const lo = Math.max(0, Math.floor(f) - 5)
    const hi = Math.min(rows.length - 1, Math.ceil(f) + 5)
    for (let k = Math.min(prev[0], lo); k <= Math.max(prev[1], hi); k++) {
      if (rows[k]) style(rows[k], k - f)
    }
    prev = [lo, hi]
    const nf = clamp(Math.round(f), 0, rows.length - 1)
    if (nf !== focus) {
      if (rows[focus]) {
        rows[focus].classList.remove("is-focus")
        const btn = rows[focus].querySelector(".rowbtn") as HTMLElement | null
        if (btn) btn.tabIndex = -1
      }
      focus = nf
      rows[nf].classList.add("is-focus")
      const btn = rows[nf].querySelector(".rowbtn") as HTMLElement | null
      if (btn) btn.tabIndex = 0
      const i = realOf(nf)
      if (i !== focusReal) {
        focusReal = i
        // the page-load spin passes through rows on its way in; callers
        // only hear about the row it lands on (see spinIn)
        if (!spinning) onFocus?.(i)
      }
    }
  }

  // Jump back into the middle copy once the wheel is at rest (never
  // mid-drag). Moves by whole lists, so the rows under the finger look
  // exactly the same before and after; keyboard focus follows along.
  function recenter() {
    if (!n || !scroller.isConnected || dragging || focus < 0) return
    const target = mid + focusReal
    if (focus === target) return
    const hadFocus = rows[focus]?.contains(document.activeElement)
    scroller.scrollTop += (target - focus) * rowH()
    update()
    if (hadFocus) {
      const btn = rows[target].querySelector(".rowbtn") as HTMLElement | null
      btn?.focus({ preventScroll: true })
    }
  }

  let dragging = false
  let settle = 0
  scroller.addEventListener("touchstart", () => (dragging = true), { passive: true })
  const release = () => {
    dragging = false
    clearTimeout(settle)
    settle = window.setTimeout(recenter, 150)
  }
  scroller.addEventListener("touchend", release, { passive: true })
  scroller.addEventListener("touchcancel", release, { passive: true })

  let ticking = false
  scroller.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          ticking = false
          update()
        })
      }
      clearTimeout(settle)
      settle = window.setTimeout(recenter, 150)
    },
    { passive: true },
  )

  // Page-load entrance: the wheel spins in from a few rows back and
  // lands on the current row, like a DDR song wheel settling. Short and
  // front-loaded (quart ease-out) so it reads as snappy, not slow. Snap
  // is off while it runs (programmatic steps would otherwise snap row
  // by row), any touch / wheel / key cuts it short, and reduced motion
  // skips it entirely.
  let spinning = false
  function spinIn(rowsAway = 4, duration = 450) {
    if (reduce || !n || !scroller.isConnected) return
    const r = rowH()
    // from the scroll position, not `focus`: a goTo() just before this
    // has moved the scroller but its focus update is still a frame away
    const target = Math.round(scroller.scrollTop / r)
    const from = Math.max(0, target - rowsAway)
    if (from === target) return
    spinning = true
    const snap = scroller.style.scrollSnapType
    scroller.style.scrollSnapType = "none"
    scroller.scrollTop = from * r
    const t0 = performance.now()
    const ease = (x: number) => 1 - Math.pow(1 - x, 4)
    function finish() {
      if (!spinning) return
      spinning = false
      stopEvents.forEach((type) => scroller.removeEventListener(type, finish))
      scroller.scrollTop = target * r
      scroller.style.scrollSnapType = snap
      update()
      onFocus?.(focusReal)
    }
    const stopEvents = ["pointerdown", "touchstart", "wheel", "keydown"]
    stopEvents.forEach((type) => scroller.addEventListener(type, finish, { passive: true }))
    function step(now: number) {
      if (!spinning) return
      const x = Math.min(1, (now - t0) / duration)
      scroller.scrollTop = (from + (target - from) * ease(x)) * r
      if (x < 1) requestAnimationFrame(step)
      else finish()
    }
    requestAnimationFrame(step)
  }

  function goToK(k: number, smooth = true, focusBtn = false) {
    k = clamp(k, 0, rows.length - 1)
    if (!rows[k]) return
    scroller.scrollTo({ top: k * rowH(), behavior: smooth && !reduce ? "smooth" : "auto" })
    if (focusBtn) {
      const btn = rows[k].querySelector(".rowbtn") as HTMLElement | null
      btn?.focus({ preventScroll: true })
    }
  }

  // Real index -> the nearest copy of that row, so jumps take the short
  // way around (track 01 -> the last track is one step up, not a scroll
  // through the whole album).
  function goTo(i: number, smooth = true, focusBtn = false) {
    if (!n) return
    i = clamp(i, 0, n - 1)
    const from = focus < 0 ? mid : focus
    const k = from + ((((i - realOf(from)) % n) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2)
    goToK(k, smooth, focusBtn)
  }

  ol.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest(".row") as HTMLElement | null
    if (!li) return
    const k = Number(li.dataset.k)
    const isActivate = k === focus || fine
    if (!isActivate) {
      e.preventDefault()
      goToK(k, true, true)
      return
    }
    const btn = li.querySelector(".rowbtn") as HTMLElement | null
    // A row marked data-navigate is a real link to another page (the
    // archives wheel's multi-track rows) -- let the browser navigate
    // instead of calling onActivate. Rows that happen to be <a> tags for
    // other reasons (e.g. direct links to an audio file) are not marked
    // this way and are always treated as activatable.
    if (btn?.hasAttribute("data-navigate")) return
    e.preventDefault()
    if (k !== focus) goToK(k)
    onActivate(realOf(k))
  })

  ol.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[e.key]
    if (step) {
      e.preventDefault()
      goToK(focus + step, true, true)
    } else if (e.key === "Home") {
      e.preventDefault()
      goTo(0, true, true)
    } else if (e.key === "End") {
      e.preventDefault()
      goTo(n - 1, true, true)
    }
  })

  new ResizeObserver(() => {
    layout()
    update()
  }).observe(scroller)

  layout()
  // start on the real (middle) copy of row 0
  scroller.scrollTop = mid * rowH()
  update()

  return {
    goTo,
    spinIn,
    /** real index of the focused row */
    get focus() {
      return focusReal
    },
    get rows() {
      return real
    },
    update,
  }
}
