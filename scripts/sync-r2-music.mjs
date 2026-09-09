#!/usr/bin/env node
// Syncs Sushibot's R2 music bucket (albums/<year>/<file>.wav) into the Astro
// content collections (src/content/albums, src/content/tracks). Run with:
//   npm run sync:r2 -- [--year=2020,2021] [--force] [--dry-run]
//
// Originals in R2 are never modified. For each track, a 192kbps MP3 is
// transcoded and uploaded back to R2 under web/<year>/<slug>.mp3, and that
// public URL becomes the track's audioUrl.

import {
	S3Client,
	HeadObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	paginateListObjectsV2,
} from "@aws-sdk/client-s3"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, rm, mkdir, readdir, unlink, writeFile, readFile } from "node:fs/promises"
import { createWriteStream } from "node:fs"
import { pipeline } from "node:stream/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const execFileAsync = promisify(execFile)

const BUCKET = "sushibucket"
const SOURCE_PREFIX = "albums/"
const WEB_PREFIX = "web/"
const ARTIST = "Sushibot"
const REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL"]

const REPO_ROOT = path.resolve(import.meta.dirname, "..")

function parseArgs(argv) {
	const args = { years: null, force: false, dryRun: false }
	for (const arg of argv) {
		if (arg.startsWith("--year=")) {
			args.years = new Set(arg.slice("--year=".length).split(",").map((y) => y.trim()))
		} else if (arg === "--force") {
			args.force = true
		} else if (arg === "--dry-run") {
			args.dryRun = true
		} else {
			console.warn(`Ignoring unrecognized argument: ${arg}`)
		}
	}
	return args
}

async function preflight() {
	const missing = REQUIRED_ENV.filter((key) => !process.env[key])
	if (missing.length > 0) {
		console.error(`Missing required environment variable(s): ${missing.join(", ")}`)
		console.error("Set them in .env and run via: npm run sync:r2")
		process.exit(1)
	}

	for (const bin of ["ffmpeg", "ffprobe"]) {
		try {
			await execFileAsync(bin, ["-version"])
		} catch {
			console.error(`Required binary "${bin}" not found on PATH. Install it (e.g. \`mise use -g ffmpeg\`) and try again.`)
			process.exit(1)
		}
	}
}

function trimTrailingSlash(url) {
	return url.replace(/\/+$/, "")
}

function trackTitleFromFilename(filename) {
	return path.parse(filename).name.trim().replace(/\s+/g, " ")
}

function slugify(title) {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
}

function dedupeSlug(baseSlug, usedSlugs) {
	let slug = baseSlug || "track"
	let counter = 2
	while (usedSlugs.has(slug)) {
		slug = `${baseSlug}-${counter}`
		counter += 1
	}
	usedSlugs.add(slug)
	return slug
}

function formatDuration(seconds) {
	const total = Math.round(seconds)
	const m = Math.floor(total / 60)
	const s = String(total % 60).padStart(2, "0")
	return `${m}:${s}`
}

async function listYearGroups(s3, yearFilter) {
	const groups = new Map()
	const paginator = paginateListObjectsV2({ client: s3, pageSize: 1000 }, { Bucket: BUCKET, Prefix: SOURCE_PREFIX })

	for await (const page of paginator) {
		for (const obj of page.Contents ?? []) {
			if (!obj.Key || obj.Key.endsWith("/") || !obj.Size) continue // folder-marker objects

			const match = obj.Key.match(/^albums\/(\d{4})\/(.+)$/)
			if (!match) {
				console.warn(`Skipping unexpected key shape: ${obj.Key}`)
				continue
			}
			const [, year, filename] = match
			if (yearFilter && !yearFilter.has(year)) continue

			if (!groups.has(year)) groups.set(year, [])
			groups.get(year).push({ key: obj.Key, filename, lastModified: obj.LastModified })
		}
	}

	for (const objects of groups.values()) {
		objects.sort((a, b) => a.lastModified - b.lastModified)
	}

	return groups
}

async function headObjectExists(s3, key) {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
		return true
	} catch (err) {
		if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return false
		throw err
	}
}

async function downloadToFile(s3, key, destPath) {
	const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
	await pipeline(Body, createWriteStream(destPath))
}

async function transcodeToMp3(inputPath, outputPath) {
	await execFileAsync("ffmpeg", [
		"-y",
		"-hide_banner",
		"-loglevel", "error",
		"-nostdin",
		"-i", inputPath,
		"-vn",
		"-map_metadata", "-1",
		"-c:a", "libmp3lame",
		"-b:a", "192k",
		"-ar", "44100",
		"-ac", "2",
		outputPath,
	])
}

async function probeDurationSeconds(filePath) {
	const { stdout } = await execFileAsync("ffprobe", [
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filePath,
	])
	return Number(stdout.trim())
}

async function uploadFile(s3, key, filePath) {
	const body = await readFile(filePath)
	await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "audio/mpeg" }))
}

async function processTrack(s3, { year, filename, key }, trackNumber, usedSlugs, force) {
	const title = trackTitleFromFilename(filename)
	const slug = dedupeSlug(slugify(title), usedSlugs)
	const targetKey = `${WEB_PREFIX}${year}/${slug}.mp3`
	const audioUrl = `${trimTrailingSlash(process.env.R2_PUBLIC_BASE_URL)}/${targetKey}`

	const alreadyExists = force ? false : await headObjectExists(s3, targetKey)

	let tmpDir
	try {
		let durationSeconds
		if (alreadyExists) {
			tmpDir = await mkdtemp(path.join(tmpdir(), "sync-r2-music-"))
			const existingPath = path.join(tmpDir, `${slug}.mp3`)
			await downloadToFile(s3, targetKey, existingPath)
			durationSeconds = await probeDurationSeconds(existingPath)
		} else {
			tmpDir = await mkdtemp(path.join(tmpdir(), "sync-r2-music-"))
			const inputPath = path.join(tmpDir, filename)
			const outputPath = path.join(tmpDir, `${slug}.mp3`)
			await downloadToFile(s3, key, inputPath)
			await transcodeToMp3(inputPath, outputPath)
			durationSeconds = await probeDurationSeconds(outputPath)
			await uploadFile(s3, targetKey, outputPath)
		}

		return {
			ok: true,
			skipped: alreadyExists,
			track: { title, slug, trackNumber, audioUrl, duration: formatDuration(durationSeconds) },
		}
	} finally {
		if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
	}
}

async function writeYearContent(year, tracks) {
	await writeFile(
		path.join(REPO_ROOT, "src/content/albums", `${year}.json`),
		JSON.stringify({ title: year, artist: ARTIST, releaseDate: `${year}-01-01` }, null, 2) + "\n",
	)

	const tracksDir = path.join(REPO_ROOT, "src/content/tracks", year)
	await mkdir(tracksDir, { recursive: true })
	const existing = await readdir(tracksDir).catch(() => [])
	const existingJson = existing.filter((f) => f.endsWith(".json"))

	const displayTitlesBySlug = new Map()
	for (const f of existingJson) {
		try {
			const parsed = JSON.parse(await readFile(path.join(tracksDir, f), "utf8"))
			if (parsed.displayTitle) {
				displayTitlesBySlug.set(path.basename(f, ".json"), parsed.displayTitle)
			}
		} catch {
			// ignore unreadable/malformed existing file, it'll just be overwritten below
		}
	}

	await Promise.all(existingJson.map((f) => unlink(path.join(tracksDir, f))))

	for (const t of tracks) {
		const displayTitle = displayTitlesBySlug.get(t.slug)
		await writeFile(
			path.join(tracksDir, `${t.slug}.json`),
			JSON.stringify(
				{
					title: t.title,
					...(displayTitle ? { displayTitle } : {}),
					album: String(year),
					trackNumber: t.trackNumber,
					...(t.duration ? { duration: t.duration } : {}),
					...(t.audioUrl ? { audioUrl: t.audioUrl } : {}),
				},
				null,
				2,
			) + "\n",
		)
	}
}

async function main() {
	const { years: yearFilter, force, dryRun } = parseArgs(process.argv.slice(2))

	await preflight()

	const s3 = new S3Client({
		region: "auto",
		endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: process.env.R2_ACCESS_KEY_ID,
			secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
		},
		forcePathStyle: true,
	})

	const groups = await listYearGroups(s3, yearFilter)
	if (groups.size === 0) {
		console.error("No matching year folders found in R2 (check --year filter and bucket contents).")
		process.exit(1)
	}

	const summary = { yearsProcessed: 0, written: 0, skipped: 0, transcoded: 0, failures: [] }

	for (const [year, objects] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		console.log(`\n=== ${year}: ${objects.length} track(s) ===`)

		if (dryRun) {
			const usedSlugs = new Set()
			objects.forEach((obj, i) => {
				const title = trackTitleFromFilename(obj.filename)
				const slug = dedupeSlug(slugify(title), usedSlugs)
				console.log(`  [dry-run] #${i + 1} "${title}" -> web/${year}/${slug}.mp3`)
			})
			continue
		}

		const usedSlugs = new Set()
		const yearTracks = []

		for (const [index, obj] of objects.entries()) {
			const trackNumber = index + 1
			process.stdout.write(`  #${trackNumber} ${obj.filename} ... `)
			try {
				const result = await processTrack(s3, { year, ...obj }, trackNumber, usedSlugs, force)
				yearTracks.push(result.track)
				if (result.skipped) {
					summary.skipped += 1
					console.log("skipped (already synced)")
				} else {
					summary.transcoded += 1
					console.log("done")
				}
			} catch (err) {
				summary.failures.push({ key: obj.key, error: err.message })
				console.log(`FAILED: ${err.message}`)
			}
		}

		await writeYearContent(year, yearTracks)
		summary.written += yearTracks.length
		summary.yearsProcessed += 1
	}

	console.log("\n=== Summary ===")
	if (dryRun) {
		console.log("Dry run complete, no files were changed.")
	} else {
		console.log(`Years processed: ${summary.yearsProcessed}`)
		console.log(`Tracks written: ${summary.written}`)
		console.log(`  transcoded+uploaded: ${summary.transcoded}`)
		console.log(`  skipped (already synced): ${summary.skipped}`)
		if (summary.failures.length > 0) {
			console.log(`Failures: ${summary.failures.length}`)
			for (const f of summary.failures) console.log(`  ${f.key}: ${f.error}`)
			process.exit(1)
		}
	}
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
