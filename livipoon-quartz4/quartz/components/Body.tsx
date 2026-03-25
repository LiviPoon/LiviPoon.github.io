import fs from "fs"
import path from "path"
import matter from "gray-matter"
// @ts-ignore
import clipboardScript from "./scripts/clipboard.inline"
// @ts-ignore
import backgroundMusicScript from "./scripts/backgroundMusic.inline"
// @ts-ignore
import siteVisitCounterScript from "./scripts/siteVisitCounter.inline"
// @ts-ignore
import habitTimelineScript from "./scripts/habitTimeline.inline"
// @ts-ignore
import customCursorScript from "./scripts/customCursor.inline"
// @ts-ignore
import cvPdfScript from "./scripts/cvPdf.inline"
import clipboardStyle from "./styles/clipboard.scss"
import backgroundMusicStyle from "./styles/backgroundMusic.scss"
import siteVisitCounterStyle from "./styles/siteVisitCounter.scss"
import customCursorStyle from "./styles/customCursor.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"
import { FilePath, slugifyFilePath } from "../util/path"

const audioExtensions = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"])
const preferredFirstTrack = "reality piano cover for lovers.mp3"

function getBackgroundSongs(): string[] {
  const songsDir = path.join(process.cwd(), "content", "songs")
  if (!fs.existsSync(songsDir)) {
    return []
  }

  const files = fs.readdirSync(songsDir, { withFileTypes: true })
  return files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => audioExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((a, b) => {
      const aPreferred = a.toLowerCase() === preferredFirstTrack
      const bPreferred = b.toLowerCase() === preferredFirstTrack
      if (aPreferred && !bPreferred) return -1
      if (!aPreferred && bPreferred) return 1
      return a.localeCompare(b)
    })
    .map((fileName) => `/${slugifyFilePath(`songs/${fileName}` as FilePath)}`)
}

const backgroundSongs = getBackgroundSongs()

type HabitTimelinePoint = {
  date: string
  count: number
}

type HabitWeeklyPoint = {
  weekStart: string
  count: number
}

type HabitWeeklySeries = {
  habit: string
  averagePerWeek: number
  weekly: HabitWeeklyPoint[]
}

type HabitTrackingData = {
  timeline: HabitTimelinePoint[]
  weeklySeries: HabitWeeklySeries[]
}

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
  if (value.length === 0) {
    return false
  }

  const numericValue = Number(value)
  if (!Number.isNaN(numericValue)) {
    return numericValue > 0
  }

  return habitCompletionTokens.has(value)
}

function normalizeHabitDate(rawValue: unknown): string | null {
  if (rawValue instanceof Date) {
    if (Number.isNaN(rawValue.getTime())) {
      return null
    }

    return rawValue.toISOString().slice(0, 10)
  }

  if (typeof rawValue !== "string") {
    return null
  }

  const value = rawValue.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return value
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcWeek(date: Date): Date {
  const weekStart = new Date(date)
  const dayOfWeek = weekStart.getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday)
  weekStart.setUTCHours(0, 0, 0, 0)
  return weekStart
}

function collectHabitDates(fileContent: string): Set<string> {
  const completedDates = new Set<string>()
  const parsed = matter(fileContent)
  const frontmatterEntries = (parsed.data as { entries?: unknown }).entries

  if (Array.isArray(frontmatterEntries)) {
    for (const entry of frontmatterEntries) {
      const date = normalizeHabitDate(entry)
      if (date) {
        completedDates.add(date)
      }
    }
  }

  // Backwards compatibility with line-based formats:
  // - YYYY-MM-DD, value
  // - - YYYY-MM-DD
  // - YYYY-MM-DD
  for (const line of parsed.content.split(/\r?\n/)) {
    const csvMatch = line.match(/^(\d{4}-\d{2}-\d{2})\s*,\s*(.+)$/)
    if (csvMatch) {
      const [, rawDate, value] = csvMatch
      const date = normalizeHabitDate(rawDate)
      if (date && isCompletedHabit(value)) {
        completedDates.add(date)
      }
      continue
    }

    const bulletMatch = line.match(/^\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/)
    if (bulletMatch) {
      const date = normalizeHabitDate(bulletMatch[1])
      if (date) {
        completedDates.add(date)
      }
      continue
    }

    const plainMatch = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*$/)
    if (plainMatch) {
      const date = normalizeHabitDate(plainMatch[1])
      if (date) {
        completedDates.add(date)
      }
    }
  }

  return completedDates
}

function getHabitTrackingData(): HabitTrackingData {
  const habitsDir = path.join(process.cwd(), "content", "habits")
  if (!fs.existsSync(habitsDir)) {
    return { timeline: [], weeklySeries: [] }
  }

  const dailyCounts = new Map<string, number>()
  const habits: Array<{ habit: string; completedDates: Set<string> }> = []
  const files = fs.readdirSync(habitsDir, { withFileTypes: true })

  for (const entry of files) {
    if (!entry.isFile()) {
      continue
    }

    if (path.extname(entry.name).toLowerCase() !== ".md") {
      continue
    }

    const filePath = path.join(habitsDir, entry.name)
    const fileContent = fs.readFileSync(filePath, "utf8")
    const completedDates = collectHabitDates(fileContent)
    const habitName = path.basename(entry.name, path.extname(entry.name))

    habits.push({
      habit: habitName,
      completedDates,
    })

    for (const date of completedDates) {
      dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1)
    }
  }

  if (dailyCounts.size === 0) {
    return { timeline: [], weeklySeries: [] }
  }

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
    timeline.push({
      date,
      count: dailyCounts.get(date) ?? 0,
    })
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
    .sort((left, right) => left.habit.localeCompare(right.habit))
    .map(({ habit, completedDates }) => {
      const countsByWeek = new Map<string, number>()

      for (const date of completedDates) {
        const parsedDate = new Date(`${date}T00:00:00Z`)
        if (Number.isNaN(parsedDate.getTime())) {
          continue
        }

        const weekStart = toIsoDate(startOfUtcWeek(parsedDate))
        countsByWeek.set(weekStart, (countsByWeek.get(weekStart) ?? 0) + 1)
      }

      return {
        habit,
        averagePerWeek: completedDates.size / totalWeeks,
        weekly: weekStarts.map((weekStart) => ({
          weekStart,
          count: countsByWeek.get(weekStart) ?? 0,
        })),
      }
    })

  return { timeline, weeklySeries }
}

const habitTrackingData = getHabitTrackingData()
const habitTimeline = habitTrackingData.timeline
const habitWeeklySeries = habitTrackingData.weeklySeries

const Body: QuartzComponent = ({ children }: QuartzComponentProps) => {
  return (
    <div
      id="quartz-body"
      data-background-songs={JSON.stringify(backgroundSongs)}
      data-habit-timeline={JSON.stringify(habitTimeline)}
      data-habit-weekly-series={JSON.stringify(habitWeeklySeries)}
    >
      {children}
    </div>
  )
}

Body.afterDOMLoaded = concatenateResources(
  customCursorScript,
  clipboardScript,
  backgroundMusicScript,
  siteVisitCounterScript,
  habitTimelineScript,
  cvPdfScript,
)
Body.css = concatenateResources(
  clipboardStyle,
  backgroundMusicStyle,
  siteVisitCounterStyle,
  customCursorStyle,
)

export default (() => Body) satisfies QuartzComponentConstructor
