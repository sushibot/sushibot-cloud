// One AudioContext for the whole tab.
//
// PlayerBar persists across navigations (transition:persist) while
// page scripts are re-run on every astro:page-load, so the context is
// parked on `window` rather than in any one module's closure. Chrome
// caps the number of contexts per tab, and MediaElementSource nodes
// can only ever belong to one context, so everything (SFX, analysers,
// preview graph) must go through here.

declare global {
  interface Window {
    __sushiAudioCtx?: AudioContext
  }
}

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  const AC = window.AudioContext
  if (!AC) return null
  if (!window.__sushiAudioCtx) window.__sushiAudioCtx = new AC()
  return window.__sushiAudioCtx
}

// Safe to call from any user-gesture handler; a no-op when the
// context is already running or doesn't exist yet.
export function resumeSharedAudioContext() {
  const ctx = getSharedAudioContext()
  if (ctx && ctx.state !== "running") ctx.resume().catch(() => {})
}
