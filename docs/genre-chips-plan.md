# Album page: pinned header with genre chips (phones)

Status: **planned, waiting on genre data.** Mockup: [genre-chips-mockup.html](genre-chips-mockup.html)
(open it in a browser).

## What it looks like

On phones (under 900px wide), the album page header stays pinned and
never collapses:

- **Top row:** `‹` back to Archives, a small era-colored square, the year
  (e.g. `2025`), and the track count on the right (`15 TRACKS`).
- **Chip row:** one row of genre chips underneath that scrolls sideways
  (never wraps, so the header height never changes), fading out at the
  right edge. Chips are flat dark fills with the site's chamfered
  corners, modeled on Spotify's filter chips. Labels follow the brand's
  UI-label style: uppercase Chakra Petch 600 like archive stamps
  ("LIQUID DNB").
- **Nothing selected:** only the genre chips show. There is no "All"
  chip.
- **A genre selected:** a square `✕` chip appears first, then the
  selected genre in the light (cream) fill, then the other genres. Tapping
  `✕`, or the selected chip again, clears the filter.

Why pinned instead of collapsing: the wheel is centered and loops, so the
area under the header only ever shows faded repeat rows, and a fixed
header can't cause the scroll glitch the collapsing one had.

## Behavior

- Selecting a genre filters the track wheel to only that genre's tracks.
  The wheel still loops and stays centered, just through the matching
  tracks.
- Tracks keep their original numbers (02, 05, 11, 14) so their place in
  the album stays clear.
- The count changes to `4 OF 15` while filtered.
- Desktop (900px and up) keeps its current full header for now.

## Data

The track schema already has an optional field in
`src/content.config.ts`:

```ts
genre: z.string().optional(),
```

As of 2026-11-03, **0 of 151 tracks** set it. Add it to each track's JSON
in `src/content/tracks/<year>/`, e.g.:

```json
{
  "title": "chords",
  "displayTitle": "Contemplating",
  "album": "2025",
  "genre": "Liquid DnB",
  ...
}
```

The chip list for an album is the distinct `genre` values of its
displayed tracks. Decide before tagging: one genre per track (the
current schema) or several (would need `z.array(z.string())`).

## Build steps

1. **Pin the slim bar (no data needed).** On phones, replace the
   collapsing header with the pinned top row, reserve the chip row's
   space, and remove the collapse logic (`syncHeader`/`setCollapsed` and
   the `.is-collapsed` styles in `src/pages/albums/[id].astro`).
2. **Chips and filtering (after genres are tagged).** Render chips from
   the album's track genres, then filter the wheel. `createWheel` in
   `src/lib/wheel.ts` builds its clones once from the list's rows, so
   filtering needs a way to rebuild it with only the matching rows (or
   recreate the wheel); the album queue sent to the player should
   probably stay the full album.
