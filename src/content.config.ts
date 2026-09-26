import { defineCollection, reference } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

const albums = defineCollection({
	loader: glob({
		base: "./src/content/albums",
		pattern: "**/*.json",
	}),
	schema: z.object({
		title: z.string(),
		artist: z.string(),
		releaseDate: z.coerce.date().optional(),
		cover: z.string().optional(),
	}),
})

const tracks = defineCollection({
	loader: glob({
		base: "./src/content/tracks",
		pattern: "**/*.json",
	}),

	schema: z.object({
		title: z.string(),
		displayTitle: z.string().optional(),
		display: z.boolean().default(true),
		album: reference("albums"),
		trackNumber: z.number().int().positive(),
		duration: z.string().optional(),
		audioUrl: z.string().optional(),
		// Hand overrides for the DDR concept page's groove radar. Every
		// field is optional; anything left out is seeded from the slug
		// (see src/lib/track-stats.ts). Preserved by scripts/sync-r2-music.mjs.
		stats: z
			.object({
				stream: z.number().min(0).max(100),
				voltage: z.number().min(0).max(100),
				chaos: z.number().min(0).max(100),
				air: z.number().min(0).max(100),
				freeze: z.number().min(0).max(100),
			})
			.partial()
			.optional(),
		bpm: z.number().int().min(40).max(300).optional(),
		feet: z.number().int().min(1).max(10).optional(),
		// 16:9 jacket art URL; a generated placeholder is used when absent.
		jacket: z.string().optional(),
	}),
})

export const collections = { albums, tracks }
