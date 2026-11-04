import { FilePath, joinSegments } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { transform as transpile } from "esbuild"

// @ts-ignore
import habitTimelineScript from "../../components/scripts/habitTimeline.inline"
// @ts-ignore
import rollCounterScript from "../../components/scripts/rollCounter.inline"

const PORTFOLIO_SRC = "portfolio-src"

type HabitTimelinePoint = { date: string; count: number }
type HabitWeeklyPoint = { weekStart: string; count: number }
type HabitWeeklySeries = { habit: string; averagePerWeek: number; weekly: HabitWeeklyPoint[] }
type MirrorQuote = { text: string; speaker: string; role: string }

const habitCompletionTokens = new Set([
  "1",
  "true",
  "yes",
  "y",
  "x",
  "done",
  "complete",
  "completed",
  "checked",
])

function isCompletedHabit(rawValue: string): boolean {
  const value = rawValue.trim().toLowerCase()
  if (!value.length) return false
  const n = Number(value)
  if (!Number.isNaN(n)) return n > 0
  return habitCompletionTokens.has(value)
}

function normalizeHabitDate(rawValue: unknown): string | null {
  if (rawValue instanceof Date) {
    if (Number.isNaN(rawValue.getTime())) return null
    return rawValue.toISOString().slice(0, 10)
  }
  if (typeof rawValue !== "string") return null
  const value = rawValue.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return value
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcWeek(date: Date): Date {
  const s = new Date(date)
  s.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7))
  s.setUTCHours(0, 0, 0, 0)
  return s
}

function collectHabitDates(fileContent: string): Set<string> {
  const completedDates = new Set<string>()
  const parsed = matter(fileContent)
  const entries = (parsed.data as { entries?: unknown }).entries
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const date = normalizeHabitDate(entry)
      if (date) completedDates.add(date)
    }
  }
  for (const line of parsed.content.split(/\r?\n/)) {
    const csvMatch = line.match(/^(\d{4}-\d{2}-\d{2})\s*,\s*(.+)$/)
    if (csvMatch) {
      const [, rawDate, value] = csvMatch
      const date = normalizeHabitDate(rawDate)
      if (date && value && isCompletedHabit(value)) completedDates.add(date)
      continue
    }
    const bulletMatch = line.match(/^\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/)
    if (bulletMatch) {
      const date = normalizeHabitDate(bulletMatch[1])
      if (date) completedDates.add(date)
      continue
    }
    const plainMatch = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*$/)
    if (plainMatch) {
      const date = normalizeHabitDate(plainMatch[1])
      if (date) completedDates.add(date)
    }
  }
  return completedDates
}

function getHabitTrackingData(): {
  timeline: HabitTimelinePoint[]
  weeklySeries: HabitWeeklySeries[]
} {
  const habitsDir = path.join(process.cwd(), "content", "habits")
  if (!fs.existsSync(habitsDir)) return { timeline: [], weeklySeries: [] }

  const dailyCounts = new Map<string, number>()
  const habits: Array<{ habit: string; completedDates: Set<string> }> = []
  const files = fs.readdirSync(habitsDir, { withFileTypes: true })

  for (const entry of files) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue
    const content = fs.readFileSync(path.join(habitsDir, entry.name), "utf8")
    const completedDates = collectHabitDates(content)
    const habitName = path.basename(entry.name, path.extname(entry.name))
    habits.push({ habit: habitName, completedDates })
    for (const date of completedDates) {
      dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1)
    }
  }

  if (dailyCounts.size === 0) return { timeline: [], weeklySeries: [] }

  const dates = [...dailyCounts.keys()].sort()
  const firstDate = new Date(`${dates[0]}T00:00:00Z`)
  const lastDate = new Date(`${dates[dates.length - 1]}T00:00:00Z`)
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastDate.getTime())) {
    return { timeline: [], weeklySeries: [] }
  }

  const timeline: HabitTimelinePoint[] = []
  const cursor = new Date(firstDate)
  while (cursor <= lastDate) {
    const date = toIsoDate(cursor)
    timeline.push({ date, count: dailyCounts.get(date) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const firstWeekStart = startOfUtcWeek(firstDate)
  const lastWeekStart = startOfUtcWeek(lastDate)
  const weekStarts: string[] = []
  const weekCursor = new Date(firstWeekStart)
  while (weekCursor <= lastWeekStart) {
    weekStarts.push(toIsoDate(weekCursor))
    weekCursor.setUTCDate(weekCursor.getUTCDate() + 7)
  }

  const totalWeeks = Math.max(1, weekStarts.length)
  const weeklySeries: HabitWeeklySeries[] = habits
    .sort((a, b) => a.habit.localeCompare(b.habit))
    .map(({ habit, completedDates }) => {
      const countsByWeek = new Map<string, number>()
      for (const date of completedDates) {
        const parsedDate = new Date(`${date}T00:00:00Z`)
        if (Number.isNaN(parsedDate.getTime())) continue
        const weekStart = toIsoDate(startOfUtcWeek(parsedDate))
        countsByWeek.set(weekStart, (countsByWeek.get(weekStart) ?? 0) + 1)
      }
      return {
        habit,
        averagePerWeek: completedDates.size / totalWeeks,
        weekly: weekStarts.map((ws) => ({ weekStart: ws, count: countsByWeek.get(ws) ?? 0 })),
      }
    })

  return { timeline, weeklySeries }
}

function getMirrorBoldQuotes(): MirrorQuote[] {
  const jsonPath = path.join(process.cwd(), "content", "mirror", "mirror-quotes.json")
  if (!fs.existsSync(jsonPath)) return []

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Array<Record<string, unknown>>
  return raw
    .filter((quote) => quote["make-bold"] === true)
    .map((quote) => ({
      text: String(quote.text ?? ""),
      speaker: String(quote.speaker ?? ""),
      role: String(quote.role ?? ""),
    }))
}

export const PortfolioRoot: QuartzEmitterPlugin = () => ({
  name: "PortfolioRoot",
  async *emit({ argv }) {
    // Copy static files verbatim
    for (const file of ["styles.css", "app.js", "redwood.js", "soundscape.js"] as const) {
      const src = joinSegments(PORTFOLIO_SRC, file) as FilePath
      if (!fs.existsSync(src)) continue
      const dest = joinSegments(argv.output, file) as FilePath
      await fs.promises.copyFile(src, dest)
      yield dest
    }

    // Redwood point-cloud data (portfolio-src/redwood/*.bin + redwood.json)
    const redwoodSrc = joinSegments(PORTFOLIO_SRC, "redwood")
    if (fs.existsSync(redwoodSrc)) {
      const redwoodDest = joinSegments(argv.output, "redwood")
      await fs.promises.mkdir(redwoodDest, { recursive: true })
      for (const entry of await fs.promises.readdir(redwoodSrc, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.(bin|json)$/.test(entry.name)) continue
        const dest = joinSegments(redwoodDest, entry.name) as FilePath
        await fs.promises.copyFile(joinSegments(redwoodSrc, entry.name), dest)
        yield dest
      }
    }

    // Redwood soundscape clips (portfolio-src/soundscape/*.m4a + credits.json)
    const soundSrc = joinSegments(PORTFOLIO_SRC, "soundscape")
    if (fs.existsSync(soundSrc)) {
      const soundDest = joinSegments(argv.output, "soundscape")
      await fs.promises.mkdir(soundDest, { recursive: true })
      for (const entry of await fs.promises.readdir(soundSrc, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.(m4a|json)$/.test(entry.name)) continue
        const dest = joinSegments(soundDest, entry.name) as FilePath
        await fs.promises.copyFile(joinSegments(soundSrc, entry.name), dest)
        yield dest
      }
    }

    // Bundle habit + counter scripts into portfolio-extensions.js
    const combined = [
      `(function(){try{\n${habitTimelineScript}\n}catch(e){console.error("portfolio-habit",e)}})();`,
      `(function(){try{\n${rollCounterScript}\n}catch(e){console.error("portfolio-counters",e)}})();`,
    ].join("\n")
    const { code: extCode } = await transpile(combined, { minify: true })
    const extDest = joinSegments(argv.output, "portfolio-extensions.js") as FilePath
    await fs.promises.writeFile(extDest, extCode, "utf-8")
    yield extDest

    // Compute data
    const { timeline, weeklySeries } = getHabitTrackingData()
    const mirrorBoldQuotes = getMirrorBoldQuotes()

    // Inject hidden #quartz-body with data attributes into index.html
    let html = await fs.promises.readFile(
      joinSegments(PORTFOLIO_SRC, "index.html") as FilePath,
      "utf-8",
    )
    const quartzBodyDiv = `<div id="quartz-body" hidden aria-hidden="true" data-habit-timeline='${JSON.stringify(timeline)}' data-habit-weekly-series='${JSON.stringify(weeklySeries)}' data-mirror-bold-quotes='${JSON.stringify(mirrorBoldQuotes)}'></div>`
    html = html.replace("</body>", `${quartzBodyDiv}\n</body>`)

    const htmlDest = joinSegments(argv.output, "index.html") as FilePath
    await fs.promises.writeFile(htmlDest, html, "utf-8")
    yield htmlDest
  },
  async *partialEmit() {},
})
