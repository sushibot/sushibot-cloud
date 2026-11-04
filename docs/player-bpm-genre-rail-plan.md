# Player: BPM and genre rail

Status: **planned for later, waiting on BPM and genre data.** Mockup:
[player-bpm-genre-rail-mockup.html](player-bpm-genre-rail-mockup.html)
(phone and desktop). Builds on the redesigned full-screen player in
[player-redesign-plan.md](player-redesign-plan.md).

## Design (option 5)

- A rail down the left edge of the spectrum, rotated to read bottom to
  top: `HARDSTYLE / 128 BPM` with a small red light that blinks on the
  beat at the track's tempo.
- Same placement on phone and desktop; on desktop it runs the full height
  of the spectrum.
- Hide whatever is missing: no genre shows only the BPM and light, no
  BPM shows only the genre (and no light), neither hides the rail.
- With reduced motion, the light stays solid instead of blinking.

## Data

Both fields already exist (optional) on tracks in `src/content.config.ts`:
`bpm: z.number()` and `genre: z.string()`. As of 2026-11-03, **0 of 151
tracks** set either. Tag them in `src/content/tracks/<year>/*.json`. The
same `genre` values feed the album-page genre chips in
[genre-chips-plan.md](genre-chips-plan.md). The player's queue entries
already carry `bpm`; `genre` would need adding to the queue JSON built in
`src/pages/albums/[id].astro` (and the archives page's single-track
queue).
