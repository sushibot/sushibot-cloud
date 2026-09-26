import { resumeSharedAudioContext } from "../../lib/audio-context"
import { RADAR_AXES, type Radar } from "../../lib/track-stats"
import { createBpmReadout } from "./bpm-roulette"
import { setFeet } from "./foot-meter"
import { attachWheelStepper, isFormField } from "./input"
import { createPreviewPlayer } from "./preview"
import { createRadar } from "./radar"
import {
  isPreviewMuted,
  isSfxMuted,
  playDecide,
  playLevelSound,
  playTick,
  setPreviewMuted,
  setSfxMuted,
} from "./sfx"
import type { DdrData, DdrItem, DdrTrack, DdrYear } from "./types"
import { createWaveform } from "./waveform"
import { createWheel, type RowSpec } from "./wheel"

// Orchestrates the DDR "Select Music" concept page. Two levels --
// years, then a year's tracks -- on one wheel. The left column always
// renders the "focused" item: the hovered row if the mouse is over the
// wheel, otherwise the row under the cursor.
//
// Playback goes through PlayerBar's player:* events only; this page
// never touches #player-audio. Hover/landing previews use the page's
// own <audio id="ddr-preview"> and pause the main track while they
// play, resuming it when the preview ends.

const PREVIEW_COLOR = "#ff3fae"
const HOVER_DELAY_MS = 250
const SETTLE_DELAY_MS = 500

type Source = "key" | "wheel" | "drag" | "tap" | "click" | "hover"

const pad2 = (n: number) => String(n).padStart(2, "0")

function fmt(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s < 10 ? "0" : ""}${s}`
}

function pickRadar(source: Radar): Radar {
  const out = {} as Radar
  for (const axis of RADAR_AXES) out[axis] = source[axis]
  return out
}

export function initDdr() {
  const root = document.getElementById("ddr-root")
  if (!root || root.dataset.initialized === "true") return
  root.dataset.initialized = "true"

  const dataEl = document.getElementById("wheel-data")
  if (!dataEl?.textContent) return
  const data = JSON.parse(dataEl.textContent) as DdrData
  if (data.years.length === 0) return

  const byId = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T
  const ol = byId<HTMLOListElement>("wheel")
  const template = byId<HTMLTemplateElement>("wheel-row-template")
  const thumb = byId<HTMLElement>("ddr-scroll-thumb")
  const stageEl = byId<HTMLElement>("ddr-stage")
  const sortEl = byId<HTMLElement>("ddr-sort")
  const counterEl = byId<HTMLElement>("ddr-stage-counter")
  const backBtn = byId<HTMLButtonElement>("ddr-back")
  const jacketEl = byId<HTMLElement>("ddr-jacket")
  const jacketImg = byId<HTMLImageElement>("ddr-jacket-img")
  const jacketNo = byId<HTMLElement>("ddr-jacket-no")
  const jacketTitle = byId<HTMLElement>("ddr-jacket-title")
  const jacketSub = byId<HTMLElement>("ddr-jacket-sub")
  const jacketFlash = byId<HTMLElement>("ddr-jacket-flash")
  const feetEl = byId<HTMLElement>("ddr-feet")
  const feetNum = byId<HTMLElement>("ddr-feet-num")
  const waveCanvas = byId<HTMLCanvasElement>("ddr-wave")
  const waveBox = waveCanvas.closest<HTMLElement>(".wave")
  const waveLabel = byId<HTMLElement>("ddr-wave-label")
  const metaEl = byId<HTMLElement>("ddr-meta")
  const attractEl = byId<HTMLElement>("ddr-attract")
  const prevBtn = byId<HTMLButtonElement>("ddr-prev")
  const playBtn = byId<HTMLButtonElement>("ddr-play")
  const nextBtn = byId<HTMLButtonElement>("ddr-next")
  const npLabel = byId<HTMLElement>("ddr-np-label")
  const npTitle = byId<HTMLElement>("ddr-np-title")
  const npTime = byId<HTMLElement>("ddr-np-time")
  const progress = byId<HTMLElement>("ddr-progress")
  const progressFill = byId<HTMLElement>("ddr-progress-fill")
  const sfxBtn = byId<HTMLButtonElement>("sfx-toggle")
  const sfxState = byId<HTMLElement>("sfx-toggle-state")
  const previewBtn = byId<HTMLButtonElement>("preview-toggle")
  const previewState = byId<HTMLElement>("preview-toggle-state")
  const announcer = byId<HTMLElement>("ddr-announcer")
  const previewAudio = byId<HTMLAudioElement>("ddr-preview")

  const ac = new AbortController()
  const { signal } = ac

  const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  )
  const reducedMotion = () => reducedMotionQuery.matches
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)")

  const yearIndexById = new Map(data.years.map((y, i) => [y.id, i]))
  const trackByUrl = new Map(
    Object.values(data.tracks).map((t) => [t.audioUrl, t]),
  )

  // ---------- state ----------
  let view: "years" | "tracks" = "years"
  let yearCursor = 0
  let trackCursor = 0
  let currentYear: DdrYear | null = null
  let hoveredIndex: number | null = null
  let transitioning = false
  let panelId: string | null = null
  let userMoved = false
  let activated = navigator.userActivation?.hasBeenActive ?? false

  let activeAudioUrl: string | null = null
  let activePlaying = false
  let hasPrevious = false
  let hasNext = false
  let lastTime = 0
  let lastDuration = 0
  let mainAnalyser: AnalyserNode | null = window.__playerAnalyser ?? null
  // Set when a preview paused the main track; the main track resumes
  // when previewing ends (unless the user took over in the meantime).
  let resumeMainAfterPreview = false

  let settleTimer: number | null = null
  let hoverTimer: number | null = null
  // After a click moves the wheel, the pointer ends up over some other
  // row without the user choosing it. Don't preview that row until the
  // pointer actually moves onto a different one.
  let hoverSuppressRowId: string | null = null
  let lastPointerType = "mouse"

  // ---------- modules ----------
  const wheel = createWheel(ol, template, {
    reducedMotion,
    onRender: (position, count) => {
      thumb.style.setProperty(
        "--p",
        count > 1 ? String(position / (count - 1)) : "0",
      )
    },
  })
  const radar = createRadar(
    byId<SVGPolygonElement>("ddr-radar-poly") as unknown as SVGPolygonElement,
  )
  const bpm = createBpmReadout(byId<HTMLElement>("ddr-bpm"))
  const wave = createWaveform(waveCanvas)
  const preview = createPreviewPlayer(previewAudio, {
    onChange: () => {
      if (preview.audible && activePlaying && !resumeMainAfterPreview) {
        resumeMainAfterPreview = true
        document.dispatchEvent(new CustomEvent("player:pause"))
      }
      refreshRowFlags()
      refreshWave()
      refreshTransport()
    },
    onBlocked: () => {
      activated = false
      attractEl.hidden = false
    },
  })

  // ---------- list helpers ----------
  function listItems(): DdrItem[] {
    if (view === "years" || !currentYear) return data.years
    return currentYear.trackIds.map((id) => data.tracks[id])
  }
  const cursorIndex = () => (view === "years" ? yearCursor : trackCursor)
  const itemAt = (i: number) => listItems()[i]
  const focusItem = () => itemAt(hoveredIndex ?? cursorIndex())

  function rowSpecs(): RowSpec[] {
    if (view === "years" || !currentYear) {
      return data.years.map((y) => {
        const n = y.trackIds.length
        const songs = `${n} SONG${n === 1 ? "" : "S"}`
        return {
          id: y.id,
          title: y.title,
          sub: `/ ${songs}${y.totalDuration ? ` · ${y.totalDuration}` : ""}`,
          cat: y.category,
          label: `${y.title}, ${songs.toLowerCase()}`,
        }
      })
    }
    const n = currentYear.trackIds.length
    return currentYear.trackIds.map((id) => {
      const t = data.tracks[id]
      return {
        id: t.id,
        title: t.title,
        sub: `/ SUSHIBOT${t.duration ? ` · ${t.duration}` : ""}`,
        cat: t.stats.category,
        label: `${t.title}, track ${t.position} of ${n}`,
      }
    })
  }

  // ---------- panel ----------
  function flashJacket() {
    if (reducedMotion()) return
    jacketFlash.classList.remove("is-on")
    void jacketFlash.offsetWidth
    jacketFlash.classList.add("is-on")
  }

  function setJacket(opts: {
    seed: DdrTrack["jacketSeed"]
    title: string
    sub: string
    no: string
    art: string | null
  }) {
    jacketEl.style.setProperty("--hue", String(opts.seed.hue))
    jacketEl.style.setProperty("--hue2", String(opts.seed.hue2))
    jacketEl.style.setProperty("--angle", `${opts.seed.angle}deg`)
    jacketEl.dataset.pattern = String(opts.seed.pattern)
    jacketEl.classList.toggle("is-long", opts.title.length > 16)
    jacketTitle.textContent = opts.title
    jacketSub.textContent = opts.sub
    jacketNo.textContent = opts.no
    if (opts.art) {
      jacketImg.src = opts.art
      jacketImg.hidden = false
      jacketEl.classList.add("has-art")
    } else {
      jacketImg.hidden = true
      jacketImg.removeAttribute("src")
      jacketEl.classList.remove("has-art")
    }
  }

  function renderPanel(force = false) {
    const item = focusItem()
    if (!item) return
    if (!force && item.id === panelId) return
    panelId = item.id
    const animate = !reducedMotion()

    if (item.kind === "year") {
      const n = item.trackIds.length
      stageEl.textContent = "YEAR"
      bpm.range(item.agg.bpmMin, item.agg.bpmMax)
      setJacket({
        seed: item.jacketSeed,
        title: item.title,
        sub: `${n} SONG${n === 1 ? "" : "S"}`,
        no: "",
        art: null,
      })
      radar.set(item.agg.radar, animate)
      setFeet(feetEl, feetNum, item.agg.feet)
      metaEl.textContent = item.totalDuration?.toUpperCase() ?? ""
    } else {
      const count = currentYear?.trackIds.length ?? 0
      stageEl.textContent = item.year
      bpm.roll(item.stats.bpm, animate)
      setJacket({
        seed: item.jacketSeed,
        title: item.title,
        sub: item.year,
        no: `No.${pad2(item.position)} / ${pad2(count)}`,
        art: item.jacket,
      })
      radar.set(pickRadar(item.stats), animate)
      setFeet(feetEl, feetNum, item.stats.feet)
      metaEl.textContent = item.duration ?? ""
    }
    flashJacket()
  }

  function announce(text: string) {
    announcer.textContent = text
  }

  function announceCursor() {
    const item = itemAt(cursorIndex())
    if (!item) return
    if (item.kind === "year") {
      announce(`${item.title}, ${item.trackIds.length} songs`)
    } else {
      announce(
        `${item.title}, track ${item.position} of ${currentYear?.trackIds.length ?? 0}, ${item.stats.bpm} BPM`,
      )
    }
  }

  function updateChrome() {
    backBtn.hidden = view !== "tracks"
    sortEl.textContent = view === "years" ? "YEAR" : "SONG"
    counterEl.textContent = pad2(
      view === "years" ? data.totalTracks : (currentYear?.trackIds.length ?? 0),
    )
  }

  function refreshRowFlags() {
    const playingTrack = activeAudioUrl
      ? trackByUrl.get(activeAudioUrl)
      : undefined
    wheel.setFlags((i) => {
      const item = itemAt(i)
      if (!item) return { playing: false, previewing: false }
      if (item.kind === "year") {
        return {
          playing: activePlaying && playingTrack?.yearId === item.id,
          previewing: false,
        }
      }
      return {
        playing: activePlaying && item.audioUrl === activeAudioUrl,
        previewing: preview.audible && preview.activeId === item.id,
      }
    })
  }

  // ---------- waveform source ----------
  function refreshWave() {
    if (!waveBox) return
    if (preview.audible) {
      wave.setSource(preview.analyser, "live", PREVIEW_COLOR)
      waveBox.dataset.mode = "preview"
      waveLabel.textContent = "PREVIEW"
    } else if (activePlaying) {
      wave.setSource(mainAnalyser, "live")
      waveBox.dataset.mode = "main"
      waveLabel.textContent = "NOW PLAYING"
    } else {
      wave.setSource(null, "idle")
      waveBox.dataset.mode = "idle"
      waveLabel.textContent = "STANDBY"
    }
  }

  // ---------- transport ----------
  function refreshTransport() {
    const track = activeAudioUrl ? trackByUrl.get(activeAudioUrl) : undefined
    const hasTrack = !!activeAudioUrl
    playBtn.disabled = !hasTrack
    prevBtn.disabled = !hasTrack
    nextBtn.disabled = !hasTrack
    playBtn.classList.toggle("is-playing", activePlaying)
    playBtn.setAttribute("aria-label", activePlaying ? "Pause" : "Play")
    if (!hasTrack) {
      npLabel.textContent = "NO DISC"
      npTitle.textContent = "Select a song"
      return
    }
    npTitle.textContent = track?.title ?? "Now playing"
    const year = track ? ` · ${track.year}` : ""
    if (activePlaying) npLabel.textContent = `NOW PLAYING${year}`
    else if (resumeMainAfterPreview && preview.audible)
      npLabel.textContent = "PAUSED FOR PREVIEW"
    else npLabel.textContent = `PAUSED${year}`
  }

  function refreshProgress() {
    const pct =
      lastDuration > 0 ? Math.min(100, (lastTime / lastDuration) * 100) : 0
    progressFill.style.width = `${pct}%`
    npTime.textContent = `${fmt(lastTime)} / ${fmt(lastDuration)}`
    progress.setAttribute(
      "aria-valuemax",
      String(Math.floor(lastDuration || 0)),
    )
    progress.setAttribute("aria-valuenow", String(Math.floor(lastTime)))
    progress.setAttribute(
      "aria-valuetext",
      `${fmt(lastTime)} of ${fmt(lastDuration)}`,
    )
  }

  function seekTo(time: number) {
    if (!activeAudioUrl) return
    document.dispatchEvent(
      new CustomEvent("player:seek", {
        detail: { time: Math.max(0, Math.min(lastDuration || 0, time)) },
      }),
    )
  }

  // ---------- previews ----------
  function clearTimers() {
    if (settleTimer !== null) window.clearTimeout(settleTimer)
    if (hoverTimer !== null) window.clearTimeout(hoverTimer)
    settleTimer = hoverTimer = null
  }

  function resumeMainIfPaused() {
    if (!resumeMainAfterPreview) return
    resumeMainAfterPreview = false
    document.dispatchEvent(new CustomEvent("player:resume"))
  }

  function stopPreview(opts: { resume: boolean; fadeMs?: number }) {
    clearTimers()
    preview.stop(opts.fadeMs ?? 150)
    if (opts.resume) resumeMainIfPaused()
  }

  function startPreview(track: DdrTrack) {
    if (!activated || isPreviewMuted()) {
      stopPreview({ resume: true })
      return
    }
    // Landing on the song that's already the main track: let it play.
    if (track.audioUrl === activeAudioUrl) {
      stopPreview({ resume: true })
      return
    }
    preview.start(track)
  }

  // After the cursor moves by key/wheel, DDR waits for it to settle
  // before the preview starts. A tap starts it right away, inside the
  // gesture, which iOS requires before it will play a new element.
  function schedulePreviewForCursor(source: Source) {
    if (settleTimer !== null) window.clearTimeout(settleTimer)
    settleTimer = null
    if (view !== "tracks") return
    const track = itemAt(trackCursor) as DdrTrack | undefined
    if (!track) return
    if (preview.activeId && preview.activeId !== track.id) preview.stop(80)
    if (source === "tap") {
      startPreview(track)
      return
    }
    if (source === "drag") return
    settleTimer = window.setTimeout(() => {
      settleTimer = null
      startPreview(track)
    }, SETTLE_DELAY_MS)
  }

  // ---------- cursor ----------
  function moveCursor(index: number, source: Source) {
    const n = listItems().length
    const clamped = wheel.wraps()
      ? ((index % n) + n) % n
      : Math.max(0, Math.min(n - 1, index))
    if (clamped === cursorIndex()) return false
    if (view === "years") yearCursor = clamped
    else trackCursor = clamped
    userMoved = true
    wheel.select(clamped)
    playTick()
    if (source !== "hover") {
      hoveredIndex = null
      wheel.setHovered(null)
    }
    renderPanel()
    announceCursor()
    schedulePreviewForCursor(source)
    return true
  }

  // ---------- commit ----------
  function commit(track: DdrTrack) {
    clearTimers()
    preview.stop(0)
    playDecide()
    flashJacket()
    if (track.audioUrl === activeAudioUrl) {
      resumeMainAfterPreview = false
      if (!activePlaying)
        document.dispatchEvent(new CustomEvent("player:resume"))
      return
    }
    resumeMainAfterPreview = false
    const year = data.years[yearIndexById.get(track.yearId) ?? 0]
    const queue = year.trackIds.map((id) => {
      const t = data.tracks[id]
      return {
        title: t.title,
        album: t.year,
        albumId: t.yearId,
        audioUrl: t.audioUrl,
      }
    })
    document.dispatchEvent(
      new CustomEvent("player:play", {
        detail: { queue, index: Math.max(0, year.trackIds.indexOf(track.id)) },
      }),
    )
    announce(`Playing ${track.title}`)
  }

  // ---------- levels ----------
  function setYearInUrl(yearId: string | null) {
    const url = new URL(location.href)
    if (yearId) url.searchParams.set("year", yearId)
    else url.searchParams.delete("year")
    // replaceState, keeping Astro's own history.state: a pushState
    // entry would make the ClientRouter re-fetch the page on back.
    history.replaceState(history.state, "", url)
  }

  async function enterYear(year: DdrYear, source: Source) {
    if (transitioning) return
    transitioning = true
    clearTimers()
    hoveredIndex = null
    wheel.setHovered(null)
    playLevelSound("open")
    const playing = activeAudioUrl ? trackByUrl.get(activeAudioUrl) : undefined
    const start = playing?.yearId === year.id ? playing.position - 1 : 0
    await wheel.sweep(() => {
      view = "tracks"
      currentYear = year
      trackCursor = start
      wheel.setRows(rowSpecs(), trackCursor)
      refreshRowFlags()
      updateChrome()
      renderPanel(true)
    })
    transitioning = false
    setYearInUrl(year.id)
    const first = itemAt(trackCursor)
    announce(
      `${year.title}. ${year.trackIds.length} songs. ${first?.title ?? ""}`,
    )
    if (source === "click") hoverSuppressRowId = "pending"
    schedulePreviewForCursor(source === "tap" ? "key" : source)
  }

  async function requestBack() {
    if (view !== "tracks" || transitioning || !currentYear) return
    transitioning = true
    stopPreview({ resume: true })
    hoveredIndex = null
    wheel.setHovered(null)
    playLevelSound("close")
    const index = yearIndexById.get(currentYear.id) ?? 0
    await wheel.sweep(() => {
      view = "years"
      currentYear = null
      yearCursor = index
      wheel.setRows(rowSpecs(), yearCursor)
      refreshRowFlags()
      updateChrome()
      renderPanel(true)
    })
    transitioning = false
    setYearInUrl(null)
    announceCursor()
  }

  function activateCursorItem(source: Source) {
    const item = itemAt(cursorIndex())
    if (!item) return
    if (item.kind === "year") enterYear(item, source)
    else commit(item)
  }

  // ---------- activation (autoplay policy) ----------
  function activate() {
    resumeSharedAudioContext()
    if (activated) return
    activated = true
    attractEl.hidden = true
  }
  attractEl.hidden = activated
  if (window.matchMedia("(hover: none)").matches)
    attractEl.textContent = "TAP TO START"
  document.addEventListener("pointerdown", activate, { signal, capture: true })

  // ---------- hover (mouse only) ----------
  // `index` is the logical item; `physical` is the rendered row under
  // the pointer (short lists repeat around the drum).
  function setHover(index: number | null, physical: number | null) {
    wheel.setHovered(physical)
    if (index === hoveredIndex) return
    hoveredIndex = index
    renderPanel()
    if (hoverTimer !== null) window.clearTimeout(hoverTimer)
    hoverTimer = null
    if (view !== "tracks") return
    if (index === null) {
      // back on the cursor: previews belong to the cursor again
      stopPreview({ resume: true })
      return
    }
    const track = itemAt(index) as DdrTrack | undefined
    if (!track) return
    if (hoverSuppressRowId !== null) {
      if (hoverSuppressRowId === "pending") hoverSuppressRowId = track.id
      if (hoverSuppressRowId === track.id) return
      hoverSuppressRowId = null
    }
    if (preview.activeId === track.id) return
    if (settleTimer !== null) window.clearTimeout(settleTimer)
    settleTimer = null
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null
      startPreview(track)
    }, HOVER_DELAY_MS)
  }

  ol.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse" || !canHover.matches || transitioning)
        return
      const row = (event.target as Element | null)?.closest<HTMLLIElement>(
        ".row",
      )
      setHover(
        row ? Number(row.dataset.index) : null,
        row ? Number(row.dataset.phys) : null,
      )
    },
    { signal },
  )
  ol.addEventListener(
    "pointerleave",
    (event) => {
      if (event.pointerType !== "mouse") return
      hoverSuppressRowId = null
      setHover(null, null)
    },
    { signal },
  )

  // ---------- click (mouse) ----------
  ol.addEventListener(
    "click",
    (event) => {
      if (lastPointerType !== "mouse" || transitioning) return
      const row = (event.target as Element | null)?.closest<HTMLLIElement>(
        ".row",
      )
      if (!row) return
      const index = Number(row.dataset.index)
      const item = itemAt(index)
      if (!item) return
      clearTimers()
      hoveredIndex = null
      wheel.setHovered(null)
      if (item.kind === "year") {
        moveCursor(index, "click")
        enterYear(item, "click")
      } else {
        moveCursor(index, "click")
        commit(item)
        hoverSuppressRowId = "pending"
      }
    },
    { signal },
  )

  // ---------- touch / pen: tap selects, tap again commits, drag steps ----------
  let drag: {
    id: number
    startY: number
    lastY: number
    acc: number
    moved: boolean
  } | null = null

  ol.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerType = event.pointerType
      if (event.pointerType === "mouse" || transitioning) return
      drag = {
        id: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        acc: 0,
        moved: false,
      }
      try {
        ol.setPointerCapture(event.pointerId)
      } catch {
        // pointer already gone -- the gesture still works uncaptured
      }
    },
    { signal },
  )
  ol.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.id) return
      drag.acc += event.clientY - drag.lastY
      drag.lastY = event.clientY
      if (Math.abs(event.clientY - drag.startY) > 8) drag.moved = true
      if (!drag.moved) return
      const step = wheel.rowHeight() * 0.7
      while (drag.acc <= -step) {
        drag.acc += step
        moveCursor(cursorIndex() + 1, "drag")
      }
      while (drag.acc >= step) {
        drag.acc -= step
        moveCursor(cursorIndex() - 1, "drag")
      }
    },
    { signal },
  )
  ol.addEventListener(
    "pointerup",
    (event) => {
      if (!drag || event.pointerId !== drag.id) return
      const wasDrag = drag.moved
      drag = null
      if (wasDrag) {
        // in-gesture, so iOS lets the preview start
        if (view === "tracks") startPreview(itemAt(trackCursor) as DdrTrack)
        return
      }
      const row = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLLIElement>(".row")
      if (!row || !ol.contains(row)) return
      const index = Number(row.dataset.index)
      if (index === cursorIndex()) activateCursorItem("tap")
      else moveCursor(index, "tap")
    },
    { signal },
  )
  ol.addEventListener("pointercancel", () => (drag = null), { signal })

  // ---------- mouse wheel ----------
  attachWheelStepper(ol, (dir) => moveCursor(cursorIndex() + dir, "wheel"), {
    signal,
    enabled: () => !transitioning,
  })

  // ---------- keyboard ----------
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented || isFormField(event.target)) return
      if (event.altKey || event.metaKey || event.ctrlKey) return
      const target = event.target as HTMLElement | null
      const onControl = target?.closest?.("button, a")
      if (onControl && (event.key === "Enter" || event.key === " ")) return
      activate()
      const c = cursorIndex()
      const last = listItems().length - 1
      let handled = true
      switch (event.key) {
        case "ArrowUp":
          if (!transitioning) moveCursor(c - 1, "key")
          break
        case "ArrowDown":
          if (!transitioning) moveCursor(c + 1, "key")
          break
        case "PageUp":
          if (!transitioning) moveCursor(c - 5, "key")
          break
        case "PageDown":
          if (!transitioning) moveCursor(c + 5, "key")
          break
        case "Home":
          if (!transitioning) moveCursor(0, "key")
          break
        case "End":
          if (!transitioning) moveCursor(last, "key")
          break
        case "ArrowRight":
          if (view === "years" && !transitioning) activateCursorItem("key")
          break
        case "Enter":
          if (!transitioning) activateCursorItem("key")
          break
        case "Escape":
        case "ArrowLeft":
        case "Backspace":
          requestBack()
          break
        default:
          handled = false
      }
      if (handled) event.preventDefault()
    },
    { signal },
  )

  backBtn.addEventListener("click", () => requestBack(), { signal })

  // ---------- transport ----------
  playBtn.addEventListener(
    "click",
    () => {
      if (resumeMainAfterPreview) {
        stopPreview({ resume: true })
        return
      }
      stopPreview({ resume: false })
      document.dispatchEvent(new CustomEvent("player:toggle"))
    },
    { signal },
  )
  prevBtn.addEventListener(
    "click",
    () => {
      if (!activeAudioUrl) return
      stopPreview({ resume: false })
      if (lastTime > 3 || !hasPrevious) seekTo(0)
      else document.dispatchEvent(new CustomEvent("player:prev"))
    },
    { signal },
  )
  nextBtn.addEventListener(
    "click",
    () => {
      if (!activeAudioUrl) return
      stopPreview({ resume: false })
      if (!hasNext) seekTo(0)
      else document.dispatchEvent(new CustomEvent("player:next"))
    },
    { signal },
  )
  progress.addEventListener(
    "click",
    (event) => {
      const rect = progress.getBoundingClientRect()
      const ratio = Math.max(
        0,
        Math.min(1, (event.clientX - rect.left) / rect.width),
      )
      seekTo(ratio * lastDuration)
    },
    { signal },
  )
  progress.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown")
        seekTo(lastTime - 5)
      else if (event.key === "ArrowRight" || event.key === "ArrowUp")
        seekTo(lastTime + 5)
      else return
      event.preventDefault()
    },
    { signal },
  )

  // ---------- toggles ----------
  function refreshToggles() {
    const sfxOn = !isSfxMuted()
    sfxBtn.setAttribute("aria-pressed", String(sfxOn))
    sfxState.textContent = sfxOn ? "ON" : "OFF"
    const previewOn = !isPreviewMuted()
    previewBtn.setAttribute("aria-pressed", String(previewOn))
    previewState.textContent = previewOn ? "ON" : "OFF"
  }
  sfxBtn.addEventListener(
    "click",
    () => {
      setSfxMuted(!isSfxMuted())
      refreshToggles()
    },
    { signal },
  )
  previewBtn.addEventListener(
    "click",
    () => {
      const muting = !isPreviewMuted()
      setPreviewMuted(muting)
      if (muting) stopPreview({ resume: true })
      refreshToggles()
    },
    { signal },
  )

  // ---------- player events ----------
  let firstState = true
  document.addEventListener(
    "player:state",
    ((event: CustomEvent) => {
      const detail = event.detail ?? {}
      activeAudioUrl = detail.audioUrl ?? null
      activePlaying = !!detail.playing
      hasPrevious = !!detail.hasPrevious
      hasNext = !!detail.hasNext
      // Main started playing while a preview was up (Space, media
      // keys, the transport...): the user took over, so the preview
      // yields and there's nothing left to resume.
      if (activePlaying && (preview.audible || preview.activeId)) {
        resumeMainAfterPreview = false
        clearTimers()
        preview.stop(120)
      }
      if (firstState && !userMoved && activeAudioUrl) {
        const t = trackByUrl.get(activeAudioUrl)
        if (t && view === "years") {
          yearCursor = yearIndexById.get(t.yearId) ?? yearCursor
          wheel.select(yearCursor, true)
          renderPanel(true)
        } else if (t && currentYear?.id === t.yearId) {
          trackCursor = t.position - 1
          wheel.select(trackCursor, true)
          renderPanel(true)
        }
      }
      firstState = false
      refreshTransport()
      refreshRowFlags()
      refreshWave()
    }) as EventListener,
    { signal },
  )
  document.addEventListener(
    "player:progress",
    ((event: CustomEvent) => {
      lastTime = Number(event.detail?.currentTime) || 0
      lastDuration = Number(event.detail?.duration) || 0
      refreshProgress()
    }) as EventListener,
    { signal },
  )
  document.addEventListener(
    "player:analyser",
    ((event: CustomEvent) => {
      mainAnalyser = event.detail?.analyser ?? null
      refreshWave()
    }) as EventListener,
    { signal },
  )

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState === "hidden" &&
        (preview.audible || preview.activeId)
      ) {
        stopPreview({ resume: true, fadeMs: 0 })
      }
    },
    { signal },
  )

  // ---------- teardown on navigation ----------
  document.addEventListener(
    "astro:before-swap",
    () => {
      stopPreview({ resume: true, fadeMs: 0 })
      ac.abort()
      preview.destroy()
      wheel.destroy()
      wave.destroy()
      radar.destroy()
      bpm.destroy()
    },
    { signal, once: true },
  )

  // ---------- initial paint ----------
  const initialYearId = new URLSearchParams(location.search).get("year")
  const initialYearIndex = initialYearId
    ? yearIndexById.get(initialYearId)
    : undefined
  if (initialYearIndex !== undefined) {
    view = "tracks"
    currentYear = data.years[initialYearIndex]
    yearCursor = initialYearIndex
    trackCursor = 0
  }
  wheel.setRows(rowSpecs(), cursorIndex())
  updateChrome()
  refreshToggles()
  renderPanel(true)
  refreshTransport()
  refreshProgress()
  refreshWave()
  document.dispatchEvent(new CustomEvent("player:query"))
}
