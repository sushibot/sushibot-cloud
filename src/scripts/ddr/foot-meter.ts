// Lights the first `n` feet. Clearing, forcing a reflow, then lighting
// restarts the CSS transition-delay stagger so the meter refills
// left-to-right on every change, like the arcade.
export function setFeet(
  container: HTMLElement,
  numEl: HTMLElement | null,
  n: number,
) {
  const feet = container.querySelectorAll<HTMLElement>(".foot")
  feet.forEach((foot) => foot.classList.remove("is-lit"))
  void container.offsetWidth
  feet.forEach((foot, i) => foot.classList.toggle("is-lit", i < n))
  if (numEl) numEl.textContent = String(n)
}
