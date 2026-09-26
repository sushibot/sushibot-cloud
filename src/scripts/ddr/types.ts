import type {
  AggregateStats,
  JacketSeed,
  TrackStats,
} from "../../lib/track-stats"

// Shapes embedded by select-music.astro as <script id="wheel-data">.

export type DdrTrack = {
  kind: "track"
  id: string
  slug: string
  title: string
  yearId: string
  year: string
  audioUrl: string
  // 1-based position within its year, for "TRACK 03 / 12"
  position: number
  duration: string | null
  durationSeconds: number
  stats: TrackStats
  jacket: string | null
  jacketSeed: JacketSeed
}

export type DdrYear = {
  kind: "year"
  id: string
  title: string
  trackIds: string[]
  totalDuration: string | null
  agg: AggregateStats
  category: number
  jacketSeed: JacketSeed
}

export type DdrData = {
  years: DdrYear[]
  tracks: Record<string, DdrTrack>
  totalTracks: number
}

export type DdrItem = DdrYear | DdrTrack
