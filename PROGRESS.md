# Cyberpunk rebuild — progress log

Source of truth for disagreements between this log and the POC files
(`docs/poc/sushicloud-home.html`, `docs/poc/sushicloud-library.html`):
the HTML wins.

## Step 9 — track wheel rebuild + desktop stage port + POC-deviation fixes

**Status: reviewed — APPROVE WITH NOTES, both notes fixed. Awaiting
user's phone/desktop test before step 10.**

### Independent review (fresh subagent, second attempt — first attempt
failed on a rate limit before reviewing anything)
Verdict: **APPROVE WITH NOTES**. Reviewer independently verified (not
just trusted) the POC-comparison numbers, the track-numbering causes
against git history/file contents, the shared-wheel claim, and the
clipping-audit false-positive reasoning — all confirmed correct. Found
two issues, both fixed below:
- **Real bug** (not previously flagged): the queue-JSON build threaded
  `i` (a track's position in the *full* track list) onto each playable
  row's `data-index`, but `queue` itself is the list compacted down to
  only audio-having tracks. If a displayed track had no audio and was
  followed by another displayed track, `queue[i]` would point at the
  wrong entry (or be out of bounds) for everything after the gap.
  Currently dormant — every track in the catalog has `audioUrl` today,
  verified by the reviewer across all 151 track files — but a latent
  bug waiting for the first no-audio track added ahead of a playable
  one. **Fixed**: added a separate `queueIndex` (position among only
  audio-having tracks) in `src/pages/albums/[id].astro`, used for
  `data-index` instead of `i`; `i` still drives the visible track
  number via `displayTrackNumber()`, unaffected. Verified across all
  16 albums (145 playable rows): every row's `data-index` now resolves
  to the matching `queue` entry.
- **Minor**: `--font-display`/`--font-body`/`--font-mono` in
  `global.css` were missing several of the POC's fallback fonts
  (`Rajdhani`, `system-ui`, `"Segoe UI"`, `Menlo`, `Consonas`) —
  harmless today since the primary webfonts load, but incomplete.
  Fixed to match the POC's fallback stacks exactly. (This did not
  resolve the one remaining 2px `.code` height difference noted below
  — that diff's exact cause is still unconfirmed, but it's isolated,
  doesn't cascade into any other element's position, and is
  non-blocking.)
- Also noted, not fixed (zero visible effect, skipped for efficiency):
  the icon-only `.collapse` button resolves to native button font
  metrics instead of inheriting the page font — invisible since it has
  no text.

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

## Step 9b — phone/desktop test fixes (3 bugs)

**Status: reviewed — APPROVE WITH NOTES. Pushed to staging. Awaiting
user's phone/desktop test before step 10.**

### Independent review (fresh subagent, diff only)
Verdict: **APPROVE WITH NOTES**. Reviewer traced the module-scope
refactor's correctness by hand (no use-before-init, no stale closures),
specifically checked whether the `document.contains(audio)` guard could
ever swallow a real user pause (it can't -- walked the scenario), and
confirmed the two defenses against the resume race (the `contains`
guard and the `resumeIndex`/`resumePlaying`/`resumeTime` snapshot)
aren't redundant -- they cover two different moments. Confirmed the bar
markup has no leftover interactive seek input and the stage's own seek
bar is untouched. One note: their own WebKit run in their sandbox was
inconsistent (one failure on the triple-navigation test, and on a
noisier run, broader failures with `currentTime` never advancing at
all) and they recommended a re-run on a clean machine, flagging it as
probably sandbox resource contention but not certain.

Followed up on that note directly: reran the suite repeatedly after a
cooldown. The specific triple-navigation test the reviewer flagged
passed every time. But a broader symptom reappeared -- `currentTime`
stuck at 0 (not advancing at all) -- and chasing it found the real
cause: by this point in the session, several hundred real HTTP
requests had gone out today to the live R2 bucket this site streams
from (every manual test run hits the actual production audio files,
there's no mock). A control test confirmed it: the *exact* symptom
(play() succeeds, `paused` goes false, but `currentTime` never leaves
0) reproduced identically in **both** Chrome and WebKit, on a
completely different track/album, including a plain direct page load
with no navigation at all -- scenarios that had been rock-solid all
session. Two engines with unrelated persistence architectures failing
identically rules out an app-code cause; it's the live file fetch
itself stalling, not a code path. Not something fixable in this repo.

1. **Fixed**: the FIRST play of a fresh session stopped on the next
   navigation in WebKit (later plays were unaffected). Root cause, found by
   instrumenting every audio event and the DOM directly (not guessed):
   `#player-audio` had its own `transition:persist`, nested inside the
   already-persisted `#player-bar` -- the parent kept itself fine, but the
   doubly-persisted child was dropped by Astro's WebKit fallback swap
   (no `Element.moveBefore()` there) instead of staying in place.

   First fix attempt was just removing the audio element's own persist
   directive. That fixed WebKit but broke Chrome: without its own persist,
   Astro's morph started resetting the live element's `src` on ordinary
   navigations there (confirmed by reverting to the pre-session baseline
   and reproducing the working behavior, then re-applying only the removal
   -- this was a real regression, not a pre-existing issue). Neither
   engine's failure mode changes `#player-bar`'s own `dataset.initialized`
   flag, so a fix gated on that flag can't catch either case.

   Real fix: `<audio>` keeps its `transition:persist` (restores Chrome's
   original, flawless behavior). Playback state (queue, index, elapsed
   time, playing-ness) and every function that reads or writes `audio` now
   live at module scope instead of inside the per-bar setup closure, so
   `initPlayerBar()` can detect a replaced element on *any* navigation, in
   either engine, re-attach its listeners, and resume -- regardless of why
   the old node went away. Two related races surfaced and got fixed along
   the way: `lastKnownPlaying` was only updated by the `play`/`pause`
   *events*, which lag the synchronous `.paused` flip (a nav landing in
   that gap resumed as paused); and a browser auto-pauses a disconnected
   `<audio>` element, which fired that same `pause` listener and overwrote
   the "should resume" signal moments before the next page could read it.
   Both fixed by sourcing the playing-state signal from multiple places
   (the call site, `timeupdate`) and ignoring `pause` events from an
   element no longer in the document.

   Net effect: all 5 WebKit failures that were already present in the
   baseline *before this session touched anything* (reported in an earlier
   round as a known, accepted limitation) are now also fixed, as a side
   effect of no longer depending on single-node identity. Full suite is
   28/28 in both Chrome and WebKit. Added a regression test
   (`player-test.mjs`: "fresh session: first play survives the first
   navigation").
2. **Fixed**: the desktop bar's transport overflowed the bar and sat
   stacked/right-aligned. Rebuilt as one vertically-centered row ([track
   info] [prev/play/next] [times + progress, flex:1] [expand]), bar height
   76px. The bar's progress display (desktop and mobile) is now read-only
   (`role="progressbar"`, `aria-valuenow`, `pointer-events: none`) --
   scrubbing exists only in the full-screen stage's seek bar (unchanged,
   still the 44px hit area).
3. **Fixed — intentional POC deviation**: a track row click only plays/toggles, never auto-opens the stage; the stage opens only via the bar's info area, expand button, or the mobile mini bar.

## Step 9c — iPhone/laptop round 2: split-second pause + dead visualizer

**Status: issue 2 (visualizer) fixed, reviewed, pushed. Issue 1 (pause
blip) investigated and root-caused; STOPPING at the human gate before
any further action -- see "open question" below.**

### Issue 2 — visualizer never reacted to the music

Context given: a CORS rule went live on the R2 bucket (allowed origins
sushibot.cloud, the staging workers.dev address, localhost:4321;
GET/HEAD; Range). Bucket is still on r2.dev, no custom domain yet.

**CORS probe, from the staging origin, against the real bucket** (`curl`
with `Origin: https://staging-sushibot-cloud.gfontan1.workers.dev`):
- `HEAD`: `200`, `Access-Control-Allow-Origin` echoes the staging
  origin, `Accept-Ranges: bytes`, `Access-Control-Expose-Headers:
  Content-Length,Content-Range,Accept-Ranges`.
- `OPTIONS` preflight (with `Access-Control-Request-Headers: range`):
  `204`, `Access-Control-Allow-Headers: range`, `Access-Control-Allow-
  Methods: GET, HEAD`.
- Range `GET` (`bytes=0-1023`): `206 Partial Content`, correct
  `Content-Range`, same ACAO. Also confirmed `localhost:4321` is
  allowed. **The CORS rule is live and correctly configured.** No
  stale-cache headers seen -- nothing to purge.

**But the real analyser still never activated, on staging or locally,
even against the production bucket with working CORS.** Found the
actual bug: `src/components/PlayerBar.astro`'s `checkCorsAsync()`
required both `res.ok` **and** `res.headers.has("access-control-allow-
origin")` before trusting a track's origin for CORS. The second check
was never true: browsers only expose a small safelisted set of
response headers to JS unless the server adds more to `Access-Control-
Expose-Headers`, and `Access-Control-Allow-Origin` was never in that
list (nor should it need to be -- a `mode:"cors"` fetch's promise only
resolves at all once the browser has already verified that header
permits the page's origin; if it didn't, the fetch would reject, which
was already handled). This made the gate permanently false regardless
of how the bucket's CORS was set up -- not a bucket/DNS/custom-domain
issue at all, a pure app bug. Fixed by trusting `res.ok` alone.

Verified the fix with a proper before/after: stood up a tiny local
Node CORS-fixture server (correct ACAO/Range/expose-headers) serving a
short generated tone, and pointed the app's real network request at it
via Playwright route interception. **Before the fix**: `crossOrigin`
stayed `null`, `createMediaElementSource` and `AnalyserNode.
getByteFrequencyData` were never called, even against this known-good
fixture -- confirming the bug was unconditional. **After the fix**:
`crossOrigin` becomes `"anonymous"`, `createMediaElementSource` fires,
and `getByteFrequencyData` is called ~60×/sec while the stage is open
-- confirmed both against the local fixture and against the real
production bucket. (The real analyser only activates from a track's
*second* play in a session -- the CORS probe for that origin is still
in flight during the first; this was already the designed behavior,
unchanged.) Reviewed `prepareAnalyser`/`ensureAudioGraph`/
`resumeAudioContextIfNeeded`: `AudioContext` is created lazily (first
real `loadTrack()` call, itself always a user-gesture-adjacent path),
resumed-if-suspended before every play, and `crossOrigin`/
`createMediaElementSource` are both still correctly gated on the
(now-correct) CORS result -- no other issues found there.

**Simulated-fallback fix**: the fallback already special-cased
`audio.paused`, but `.paused` flips to `false` the instant `.play()`
is called -- including while the element is still buffering and
producing no sound. Added a dedicated `isActuallyPlaying` flag, driven
by the `playing`/`waiting`/`stalled`/`pause`/`ended` events (the ones
that distinguish "audibly producing sound right now" from "play() was
requested"), and reset on every new track load. Verified by sampling
canvas pixel-activity variance while playing vs. paused: playing
≈137,000, paused ≈2,500 (~55× calmer) -- confirmed idle, not frozen,
not still pulsing.

**Large-file seeking + throttled time-to-first-sound** (files are
large WAVs per your note; everything I could directly inspect on the
live bucket right now -- `2012/progressive.mp3`, several other tracks
across years -- was still MP3, 1.2–9.8MB, not 14–17MB WAV; flagging
that discrepancy rather than guessing, in case the WAV upload hasn't
landed on this bucket yet or I'm missing something). Tested against a
locally-generated 15.9MB WAV (90s, matching your stated size) so the
result reflects the app's own streaming behavior independent of the
bucket's current real-network state (see below):
- Seeking: jumped to ~75% of a 90s file, landed at 68.2s (expected
  67.5s) -- correct, confirms Range-request seeking works on a large
  file.
- Time-to-first-sound under Chrome DevTools' "Slow 4G" profile (400
  Kbps, 400ms latency): **346ms** from click to audibly playing.
  `preload="none"` plus the browser's own partial-range fetching means
  it only needs the first chunk, not the whole 15.9MB, so size didn't
  meaningfully hurt startup time in this test.

No bucket/CORS/DNS/audioUrl changes made, as instructed. No files
converted.

### Issue 1 — split-second pause on first-play-then-navigate (WebKit)

Reproduced on a fresh WebKit load (play first track, then one client-
side navigation), instrumented with full audio-event timestamps,
tested against the local fixture to isolate this from the real
bucket's current network state. Full sequence:

```
[AUDIO pause]          t=2350  paused=true  ct=0.898  inDoc=false   <- original element auto-paused on disconnect
[AUDIO loadstart]       t=2350  (new, empty element)
[AUDIO abort/emptied/play] t=2361  ct=0.898  (resume logic: new src, seek to 0.898, .play())
[AUDIO waiting/loadstart]  t=2361-2362  (new network fetch starts)
[AUDIO loadedmetadata]  t=2481
[AUDIO canplay]         t=2489
[AUDIO playing]         t=2489  <- audibly playing again
```

**Root cause, confirmed**: `#player-audio`'s `transition:persist` gets
dropped by Astro's WebKit fallback swap (no `Element.moveBefore()`
there) on the first navigation of a session, same mechanism as the
full-outage bug fixed last round. The recovery logic added then (move
state to module scope, detect the replacement, resume) works
reliably, but a replacement element has no buffered network data --
resuming it means a real, if brief, re-fetch. Measured gap in this
run: **139ms** (disconnect to audibly-playing-again). Against the real
bucket this would likely run somewhat longer depending on network
conditions, but the mechanism is the same regardless of file size.

**Attempted to prevent the drop** (not just recover from it), within
the current DOM-persisted-node architecture: added `astro:before-swap`
/`astro:after-swap` handlers that manually detach the *same* live
`<audio>` node from the outgoing page and reinsert it into the
incoming one with plain same-document DOM calls, bypassing Astro's own
`transition:persist` for this element entirely. **This made things
worse, not better**: it conflicts with Astro's own persistence
handling for the parent `#player-bar` (which still uses
`transition:persist` normally) -- in testing, the audio element ended
up missing from the page entirely after navigation, a regression from
the current (recovering) behavior. Reverted cleanly; verified the
revert is back to the known-good, reliably-recovering state (full
suite: 28/28 Chrome; WebKit 26/28 with the 2 failures being the
already-identified real-bucket network degradation, not this bug --
the two tests this bug specifically targets both pass).

**Open question — stopping here per your instruction.** I don't see a
way to prevent the underlying drop without either (a) a deeper, riskier
rework of how `#player-bar` and `#player-audio` are persisted together
(no concrete design in hand, and the one concrete attempt I tried made
things worse), or (b) the detached `new Audio()` singleton, which
would eliminate the gap entirely by decoupling playback from any DOM
node Astro could touch -- but you asked me to stop and ask before
adopting that, so I'm asking. The current, already-shipped recovery
behavior is a large improvement over the original bug (full,
permanent silence) and is down to a ~140ms blip; whether that's
acceptable as the practical floor for this architecture, or whether
it's worth the singleton rework, is your call.

## Round: detached `Audio()` singleton (issue 1, architectural fix)

Approved: pursue the singleton. Implemented, tested, reviewed, this
entry written before push.

### Architecture

`PlayerBar.astro`'s nested `<audio id="player-audio">` element is
gone. In its place, the script creates one `HTMLAudioElement` at
module scope, the first time the script ever runs for this tab:

```ts
let audio: HTMLAudioElement | null = null
let audioUnavailable = false
try {
  audio = new Audio()
  audio.preload = "none"
} catch {
  audio = null
  audioUnavailable = true
}
```

This object is never inserted into the document at all. Astro only
ever evaluates a page's module `<script>` once per tab (ClientRouter
navigations don't re-run it), so this singleton -- and the
`AudioContext`/`AnalyserNode` graph built on it -- survives every
client-side navigation unconditionally, by construction. There is no
swap mechanism, Chrome's or WebKit's, that can find, move, or drop a
node that was never part of the DOM. This replaces *recovering* from
the WebKit drop (last round's fix) with *eliminating the condition
that caused it*.

`#player-bar` keeps its own `transition:persist` for the UI chrome
(title, buttons, progress display) -- unchanged, and still needed,
since that's real DOM that benefits from being carried across swaps
rather than rebuilt. Only the audio object itself moved out of the
DOM's reach.

Listener wiring (`wireAudio()`) now runs exactly once, right after the
singleton is created, instead of being re-attached per element on
every navigation -- there's only ever one element to attach to, so the
old "is this a new element, detect and rebind" logic is gone along
with the module-scope resume bookkeeping (`lastKnownTime`,
`lastKnownPlaying`, the `document.contains(audio)` guards) that last
round's recovery fix needed and this round makes unnecessary.

The `AnalyserNode`/`createMediaElementSource` graph is built at most
once, ever, for the whole tab session, behind the existing CORS probe
gate -- confirmed by instrumentation (below) that `createMediaElementSource`
is called exactly once across multiple tracks and multiple
navigations in a session.

### The 4 additions you asked for

**(1) `crossOrigin` ordering.** `crossOrigin` is decided in
`prepareAnalyser()`, called strictly before `audio.src` is assigned
for that track in `loadTrack()`, and never touched again for that
load:

```ts
function prepareAnalyser(url: string) {
  if (!audio) return
  try {
    const origin = originOf(url)
    if (!origin) return
    checkCorsAsync(origin, url)
    if (corsResolved.get(origin) === true && audio.crossOrigin !== "anonymous") {
      audio.crossOrigin = "anonymous"
      ensureAudioGraph()
    }
  } catch {
    analyserFailed = true
  }
}
```

**If the CORS probe hasn't resolved yet when the user taps play** --
realistically only possible on the very first track of the session,
right as the tap happens -- `crossOrigin` is simply left unset for
*that* track. The real analyser doesn't activate until a later track,
once the probe has resolved in the background; the simulated fallback
drives the visualizer in the meantime. `crossOrigin` is never flipped
retroactively on a load already in flight, because changing it after
the fact can force the browser to redo the fetch -- exactly the kind
of disruption this whole rework exists to avoid. In practice the probe
resolves well within the time it takes to tap play and for the track
to start loading, so this is a edge case that mostly matters on a
very slow connection.

**(2) UI resync on every `astro:page-load`.** `initPlayerBar()` no
longer relies on events having already fired by the time the new DOM
is wired up. Right after the required-elements guard, it resyncs every
piece of UI directly from the audio object's live state:

```ts
syncProgress()
updatePlayIcon()
updateNav()
if (index >= 0 && queue[index]) paintTrackUI(queue[index])
setErrorUI(playbackError)
```

`paintTrackUI()` is a new factored-out function (title, album, drawer
fields, decal, era CSS vars, button enabling, nav, Media Session
metadata) shared between a genuinely new track (`loadTrack()`) and
this resync path (existing track, new DOM).

**(3) iOS gesture safety + auto-advance.** Every `.play()` call site
is either directly inside a click handler (`togglePlayback()`,
row/drawer play buttons) or inside `loadTrack()`, which is itself only
ever invoked from a click handler or from `goToNext()`'s `ended`
listener -- never from `astro:page-load` or any other non-gesture
context. The `ended` → `goToNext()` → `loadTrack(..., autoplay=true)`
chain is unchanged from before and still fires correctly, since it
runs as a direct consequence of the browser's own `ended` event on an
already-playing (gesture-originated) element, which iOS permits.
Included in the manual iPhone test list below, including a
locked-screen run.

**(4) Media Session additions.** `setPositionState` is now called from
the `timeupdate` and `loadedmetadata` listeners:

```ts
function updatePositionState() {
  if (!("mediaSession" in navigator) || !audio) return
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(audio.currentTime, audio.duration),
    })
  } catch {}
}
```

The `error` event now drives a visible state, not just a console
failure -- a new `.np-error` element ("Playback error — try another
track") toggled by `setErrorUI()`, reset on every new track load and
on the `playing` event:

```ts
function setErrorUI(hasError: boolean) {
  playbackError = hasError
  if (npErrorEl) npErrorEl.hidden = !hasError
  bar?.classList.toggle("has-error", hasError)
}
```

Metadata (title/artist/artwork) is set via `updateMediaSessionMetadata()`
on every track load and resync; artwork uses the site's own brand
image (`/album-art/sushibot.jpg`) since there's no per-track artwork in
the content model.

### Test results

Full `player-test.mjs` suite (28 tests), migrated from
`document.getElementById("player-audio")` to `window.__playerAudio`
(a test-only reference set at singleton-creation time; nothing in
production code reads it back) since the element no longer has DOM
presence to query:

- Chrome: 28/28.
- WebKit: 28/28, run 4 times consecutively for consistency (one run
  incidentally hit the already-known, unrelated real-bucket network
  degradation on an unrelated earlier test; the navigation-continuity
  test itself passed every time).

The navigation-continuity assertions were tightened to match the
singleton's stronger guarantee -- no tolerance for `currentTime` going
backwards, since there's no replacement element anymore to introduce
any discontinuity at all.

**Event log, fresh WebKit session, real bucket, first play → first
navigation of the session** (the specific scenario that used to
produce the ~140ms pause-and-resume blip):

```
--- FIRST PLAY (fresh session, real R2 bucket) ---
[AUDIO play]           t=1140  paused=false ct=0.000 rs=0
[AUDIO waiting]        t=1140  paused=false ct=0.000 rs=0
[AUDIO loadstart]      t=1142  paused=false ct=0.000 rs=0
[AUDIO loadedmetadata] t=1574  paused=false ct=0.000 rs=1
[AUDIO canplay]        t=1620  paused=false ct=0.000 rs=4
[AUDIO playing]        t=1620  paused=false ct=0.000 rs=4
--- NAVIGATE (first navigation of session) ---
final state: {"paused":false,"currentTime":2.237,"readyState":4}
```

Zero events of any kind -- no `pause`, `emptied`, `abort`, `waiting`,
`stalled`, or `error` -- fire during or after the navigation.
`currentTime` keeps advancing through it. This is the target you set:
no pause event at all, not just a faster recovery.

**Analyser/graph continuity across navigation** (confirming the graph
is never rebuilt, only the UI around it): instrumented
`createMediaElementSource` and `getByteFrequencyData` call counts,
played two different tracks and navigated twice between them.
`createMediaElementSource` fired exactly **once** total across both
tracks and both navigations; `getByteFrequencyData` kept incrementing
normally throughout. (A full page reload, as expected, does reset this
-- that's a new module evaluation, not a client-side navigation, and
out of scope for what the singleton is meant to survive.)

**Reduced motion**: this code path (`targets()`/`draw()`/`kick()`,
gated on `matchMedia("(prefers-reduced-motion: reduce)")`) is
unchanged from before the singleton rework -- confirmed via diff.
Verified it still runs with no errors and no regression: with reduced
motion on, the stage renders one static frame at setup instead of a
continuous `requestAnimationFrame` loop, exactly as designed before
this round. Not a new behavior; just confirming the singleton change
didn't disturb it.

Sequential plays, seeking, queue advance (prev/next), stage open/
close, and Escape/focus are all exercised by the general suite above
and all pass; not called out individually since none of that logic
changed in this round beyond what the suite already covers.

No bucket/CORS/DNS/audioUrl changes made.

### Still to do, on your approval

The domain switch (all 151 track JSON files, `r2.dev` →
`audio.sushibot.cloud`, `R2_PUBLIC_BASE_URL` default/docs, 206-Range
verification script, no bucket/CORS/DNS touch) is planned but **not
started** -- per your instruction, it's a separate commit gated on
your approval of this singleton work.
