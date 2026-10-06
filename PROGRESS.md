# Cyberpunk rebuild — progress log

Source of truth for disagreements between this log and the POC files
(`docs/poc/sushicloud-home.html`, `docs/poc/sushicloud-library.html`):
the HTML wins.

## Step 9 — track wheel rebuild + desktop stage port + POC-deviation fixes

**Status: pending independent review.**

### What changed
- `src/pages/albums/[id].astro`: track list rebuilt as a scroll-snap
  wheel (was a plain list), reusing `src/lib/wheel.ts` — the same
  mechanics as the archives wheel, not a second implementation.
- `src/lib/wheel.ts`: extracted shared wheel code; archives and track
  pages both import it.
- `src/components/PlayerBar.astro`: full-screen stage markup/CSS
  rebuilt to match the POC's `.stage-in` structure (980px column,
  collapse button, framed "now playing" bar with barcode + code,
  glowing title, SIGNAL decal, hazard stripe, seek bar, 3-button
  transport).
- `src/styles/global.css`: shared row/wheel CSS consolidated here so
  archives and track pages render identical rows.
- Four POC deviations found by numeric comparison and fixed:
  1. Seek bar: 44px tap target everywhere (mini bar, desktop bar,
     stage), 6px visible track — was 6px tap target site-wide.
  2. Row discs: fixed 56px on both wheels (POC's `.rowbtn .disc`
     override) — was responsive 72/76px.
  3. Body line-height: 1.4 (was 1.6). Audited every page at
     390/1280/1920 for clipping afterward — none found; the only
     automated hits were a screen-reader-only utility class (by
     design, 1px) and an intentional 2-line title clamp (explicit
     line-height, unaffected by the body change).
  4. Header top padding: archives header (`.phead`) keeps 24px (POC's
     own override); track header (`.thead`) corrected to 0px — the POC
     gives these two headers different top padding by design, and this
     page had wrongly copied the archives value.
- `src/lib/archive.ts`: added `displayTrackNumber(track, index)` —
  sequential 1..N display numbering, doesn't touch stored data. See
  "Track numbering" below for why and where to revert.

### Verification
- Numeric Playwright comparison (bounding boxes + computed styles)
  against the POC at 390/1280/1440/1920px: archives wheel, track
  wheel, and stage now match the POC pixel-for-pixel at every element
  checked, at every width, after the four fixes above. One trivial,
  unrelated 2px height difference remains on the stage's `.code` label
  (font-metrics/loading timing, not structural).
- Full Playwright suite (`player-test.mjs`): 23/23 pass in Chrome.
  18/23 pass in WebKit; the 5 failures are the pre-existing
  `transition:persist`/`moveBefore()` Chrome-only-API gap (confirmed
  present in the original baseline commit, before this session's work
  — not a new regression).
- 27-track album (2023) and 1-track album (2018) both tested directly.
- Deep-link (`?track=`) scroll-to-center confirmed landing exactly on
  the POC's 0.34 anchor fraction.
- `overscroll-behavior: contain` confirmed present (iOS pull-to-refresh
  guard).

### Track numbering
- **2023** skips 06, 11, 17, 24 in the stored `trackNumber` field:
  caused by 4 deleted files (`sample-buu.json` #6, `dont-know-why-v8.json`
  #11, `samps-buu.json` #17, `sunshine-mix-v7.json` #24), removed in
  commit `24cf92a` ("update song title names") — superseded/duplicate
  recordings, not a sync bug.
- **2026** skips 07: `jamcorder-practice.json` has `trackNumber: 7` but
  `"display": false` — a manual "hide from public display" flag that
  `scripts/sync-r2-music.mjs` (lines 230-231, 249-250) preserves across
  re-syncs. The file isn't deleted, just hidden. The same `display:
  false` pattern also exists on one track each in 2015, 2017, 2019, and
  2020 (not asked about this round, flagged for awareness).
- No data was changed. Display numbering is sequential 1..N, routed
  through one helper: `displayTrackNumber()` in `src/lib/archive.ts`.
  To revert to each file's own stored number, that function has both
  return lines written in — comment out `return index + 1` and
  uncomment `return track.data.trackNumber`. That is the only change
  needed; every call site (row discs, stage "T0n" code, "track n of N"
  subline) already goes through this one function.

### Status-report items carried over from an earlier round
(No PROGRESS.md existed before this entry, so these are verified
against current code/live behavior rather than against a prior written
checklist.)
- **A — desktop bar** (wide flex seek bar, bottom padding, nothing
  hidden): done. Scrub bar, prev/next, and the expand control are all
  visible and un-hidden at ≥980px (confirmed live). Mobile safe-area
  bottom padding (16px) matches the POC's own mobile override exactly.
  The desktop bar's own height/padding model (84px fixed height +
  flex-centering) intentionally doesn't literally copy the POC's
  10px-padding mini-bar — it's the already-approved "label-sheet
  style" restyle (commit `88aded0`), not a pixel port.
- **B — desktop stage opening**: done. Verified empirically: row click
  opens the stage; re-clicking the already-playing row opens it
  without restart; the bar's info area and the expand control both
  open it; Escape and the collapse button both close it; background
  content is `inert` while open and un-inert after close; focus moves
  into the stage on open and back to the opener on close.
- **F — durations floored**: the player's elapsed/total time display
  floors both minutes and seconds (`PlayerBar.astro` ~line 376-377),
  matching the POC's own `mmss()` exactly. No duration is currently
  displayed in the track list in either the POC or the port (the
  `duration` content field exists in the schema but isn't rendered
  anywhere) — flagging this rather than guessing what "in the list"
  was meant to cover.
- **G — grain mix-blend-mode**: current implementation uses
  `mix-blend-mode: screen` (normal rows) / `multiply` (focused row).
  Screenshot A/B test with `mix-blend-mode: normal` substituted:
  visually indistinguishable on this site's flat-color backgrounds.

### Open for the user
- No decision requested this round on track numbering — sequential
  display is implemented per the standing lean toward option (b);
  flag if you want this reverted.
