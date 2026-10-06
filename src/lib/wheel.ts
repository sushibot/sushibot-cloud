// Shared scroll-snap "wheel" mechanics, ported from the POC's createWheel
// (sushicloud-library.html). Used by both the archives album wheel and the
// per-album track wheel so the perspective/fan-tilt interaction and focus
// tracking are implemented exactly once.
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

  let rows: HTMLElement[] = Array.from(ol.children) as HTMLElement[]
  let focus = -1
  let prev: [number, number] = [0, -1]

  const rowH = () => (rows[0] ? rows[0].offsetHeight : 96)

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
    for (let i = Math.min(prev[0], lo); i <= Math.max(prev[1], hi); i++) {
      if (rows[i]) style(rows[i], i - f)
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
      onFocus?.(nf)
    }
  }

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
    },
    { passive: true },
  )

  function goTo(i: number, smooth = true, focusBtn = false) {
    i = clamp(i, 0, rows.length - 1)
    if (!rows[i]) return
    scroller.scrollTo({ top: i * rowH(), behavior: smooth && !reduce ? "smooth" : "auto" })
    if (focusBtn) {
      const btn = rows[i].querySelector(".rowbtn") as HTMLElement | null
      btn?.focus({ preventScroll: true })
    }
  }

  ol.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest(".row") as HTMLElement | null
    if (!li) return
    const i = Number(li.dataset.i)
    const isActivate = i === focus || fine
    if (!isActivate) {
      e.preventDefault()
      goTo(i, true, true)
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
    if (i !== focus) goTo(i)
    onActivate(i)
  })

  ol.addEventListener("keydown", (e) => {
    const k = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[e.key]
    if (k) {
      e.preventDefault()
      goTo(focus + k, true, true)
    } else if (e.key === "Home") {
      e.preventDefault()
      goTo(0, true, true)
    } else if (e.key === "End") {
      e.preventDefault()
      goTo(rows.length - 1, true, true)
    }
  })

  new ResizeObserver(() => {
    layout()
    update()
  }).observe(scroller)

  layout()
  update()

  return {
    goTo,
    get focus() {
      return focus
    },
    get rows() {
      return rows
    },
    update,
  }
}
