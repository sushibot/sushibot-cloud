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
		album: reference("albums"),
		trackNumber: z.number().int().positive(),
		duration: z.string().optional(),
		audioUrl: z.string().optional(),
	}),
})

export const collections = { albums, tracks }
