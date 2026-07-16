import fs from "fs"
import path from "path"
import { FilePath, joinSegments, slugifyFilePath } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"

const portfolioSource = "portfolio-src"
const staticFiles = ["styles.css", "world-data.js", "app.js"] as const
const audioExtensions = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"])

type TrackerDay = {
  count: number
}

type TrackerSummary = {
  habitCount: number
  days: TrackerDay[]
}

function getBackgroundSongs(): string[] {
  const songsDirectory = path.join(process.cwd(), "content", "songs")
  if (!fs.existsSync(songsDirectory)) return []

  return fs
    .readdirSync(songsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => audioExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => `/${slugifyFilePath(`songs/${fileName}` as FilePath)}`)
}

function getTrackerSummary(): TrackerSummary {
  const habitsDirectory = path.join(process.cwd(), "content", "habits")
  if (!fs.existsSync(habitsDirectory)) return { habitCount: 0, days: [] }

  const files = fs
    .readdirSync(habitsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".md")

  const countsByDate = new Map<string, number>()
  for (const file of files) {
    const content = fs.readFileSync(path.join(habitsDirectory, file.name), "utf8")
    for (const match of content.matchAll(/^\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/gm)) {
      const date = match[1]
      countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1)
    }
  }

  const latestDate = [...countsByDate.keys()].sort().at(-1)
  if (!latestDate) return { habitCount: files.length, days: [] }

  const cursor = new Date(`${latestDate}T00:00:00Z`)
  const days: TrackerDay[] = []
  for (let index = 0; index < 28; index++) {
    const date = cursor.toISOString().slice(0, 10)
    days.unshift({ count: countsByDate.get(date) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return { habitCount: files.length, days }
}

/** Emits the standalone, map-based portfolio homepage at the site root. */
export const PortfolioRoot: QuartzEmitterPlugin = () => ({
  name: "PortfolioRoot",
  async *emit({ argv }) {
    for (const file of staticFiles) {
      const source = joinSegments(portfolioSource, file) as FilePath
      const destination = joinSegments(argv.output, file) as FilePath
      await fs.promises.copyFile(source, destination)
      yield destination
    }

    const source = joinSegments(portfolioSource, "index.html") as FilePath
    const destination = joinSegments(argv.output, "index.html") as FilePath
    const sourceHtml = await fs.promises.readFile(source, "utf-8")
    const songData = JSON.stringify(getBackgroundSongs()).replaceAll("'", "&#39;")
    const trackerData = JSON.stringify(getTrackerSummary()).replaceAll("'", "&#39;")
    const html = sourceHtml.replace(
      "<body>",
      `<body data-background-songs='${songData}' data-tracker-summary='${trackerData}'>`,
    )
    await fs.promises.writeFile(destination, html, "utf-8")
    yield destination
  },
  async *partialEmit() {},
})
