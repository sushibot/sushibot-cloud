// DDR's SPEED readout: on landing, the digits spin through random
// values for a moment before settling on the real BPM.

const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(3, "0")

export function createBpmReadout(el: HTMLElement) {
  let timer: number | null = null

  function clear() {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }

  function roll(target: number, animate: boolean) {
    clear()
    if (!animate) {
      el.textContent = pad(target)
      return
    }
    const deadline = performance.now() + 600
    el.textContent = pad(80 + Math.random() * 200)
    timer = window.setInterval(() => {
      if (performance.now() >= deadline) {
        clear()
        el.textContent = pad(target)
        return
      }
      el.textContent = pad(60 + Math.random() * 240)
    }, 60)
  }

  function range(min: number, max: number) {
    clear()
    el.textContent = min === max ? pad(min) : `${pad(min)}-${pad(max)}`
  }

  return { roll, range, destroy: clear }
}
