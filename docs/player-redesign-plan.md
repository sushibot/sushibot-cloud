# Full-screen player redesign

Status: **built 2026-11-03** (phones and desktop), except BPM and genre,
which moved to a later plan. Mockups (open in a browser):

- [mobile-player-mockup.html](mobile-player-mockup.html): the approved
  phone layout (concept A).
- [player-bpm-genre-rail-mockup.html](player-bpm-genre-rail-mockup.html):
  phone and desktop layouts (the BPM and genre rail in it is planned for
  later; everything else is this plan).

The current player lives in `src/components/PlayerBar.astro` (the
`.player-drawer` / `.stage-in` section).

## Layout (concept A)

- **Spectrum is the hero.** The existing block visualizer takes most of
  the screen.
- **Top row:** the red back button on the left, the barcode and the
  glitched track code on the right. The "Now playing" label goes away.
- **Frequency axis:** a thin strip under the spectrum with a hairline on
  top and a short tick under each label: 50, 100, 250, 500, 1k, 2k, 4k,
  8k Hz. Ticks sit at their true positions on the visualizer's log scale
  (45 Hz to 9 kHz, `f0`/`f1` in the analyser code). No guide lines run up
  through the bars. Always shown, including when the player falls back to
  simulated bars (no real analyser, e.g. when the audio host blocks
  cross-origin analysis); the labels are decorative then.
- **Title:** plain cream, no glow, one line with the delayed marquee
  (already in place on phones). On desktop the title sits above the
  spectrum, larger, on one line.
- **Below the spectrum:** subtitle (`2016 · track 4 of 7`), seek bar,
  prev / play / next.

## Track code

The code next to the barcode (e.g. `A06-T04`) is album 6, track 4. It's
decorative, so show it as glitched "zalgo" text: random combining marks
stacked on the real characters, re-scrambled every few seconds so it
flickers. Mark it `aria-hidden`; no other meaning is lost.

## BPM and genre

Split out into its own later plan:
[player-bpm-genre-rail-plan.md](player-bpm-genre-rail-plan.md).

## Scope

- Phone layout (under 980px) first, matching the mockup.
- Desktop gets the same pieces (title above the spectrum, axis) in the
  larger layout shown in the rail mockup.
