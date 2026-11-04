# Desktop-only build: saved ideas

Status: **parked until a desktop-only build.** These were designed while
reworking the phone layouts and deliberately left off desktop for now.

## Full-screen player: Spotify-style controls

Mockup: [desktop-player-controls-mockup.html](desktop-player-controls-mockup.html)
(current desktop on top, proposed below).

Phones already have this (built 2026-11-03, `@media (max-width: 979px)`
in `src/components/PlayerBar.astro`). For desktop:

- **Back:** a bare chevron instead of the 56px red box, with a 44px tap
  area.
- **Transport:** a compact centered row: plain previous and next icons
  around one solid red play square with chamfered corners, replacing the
  full-width boxed PREV / play / NEXT buttons. On phones the square is
  44px; size it up a little for desktop.
- **Seek bar:** keep the times beside the bar on desktop (there's room),
  unlike phones where they sit under it.
- Expect more empty space around the smaller row; that's intentional.

Known desktop quirk to look at in the same pass: with a long two-line
title the full-screen player scrolls by about 10px.

## Also waiting on desktop decisions

- The album page header on desktop still uses the full header; the
  pinned slim bar with genre chips in [genre-chips-plan.md](genre-chips-plan.md)
  is phones-only for now.
- The BPM and genre rail in
  [player-bpm-genre-rail-plan.md](player-bpm-genre-rail-plan.md) has a
  desktop layout in its mockup.
