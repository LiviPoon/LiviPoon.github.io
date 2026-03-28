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

type HabitTimelineWindow = Window &
  typeof globalThis & {
    __habitTimelineAnimated?: boolean
    __habitDetailAnimated?: boolean
    spaNavigate?: (url: URL, isBack?: boolean) => Promise<void> | void
  }

const habitTimelineWindow = window as HabitTimelineWindow
const chartSelector = "[data-habit-timeline-chart]"
const statsSelector = "[data-habit-timeline-stats]"
const detailChartSelector = "[data-habit-detail-chart]"
const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
})
let indexChartResizeObserver: ResizeObserver | null = null
let detailChartResizeObserver: ResizeObserver | null = null

function registerCleanup(cleanup: () => void) {
  if (typeof window.addCleanup === "function") {
    window.addCleanup(cleanup)
  }
}

function normalizeHabitDate(rawDate: unknown): string | null {
  if (typeof rawDate !== "string") {
    return null
  }

  const value = rawDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const time = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(time)) {
    return null
  }

  return value
}

function normalizeHabitLabel(rawLabel: unknown): string {
  if (typeof rawLabel !== "string") {
    return "habit"
  }

  const trimmed = rawLabel.trim()
  return trimmed.length > 0 ? trimmed : "habit"
}

function formatShortDate(isoDate: string): string {
  const time = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(time)) {
    return isoDate
  }

  return shortDateFormatter.format(time)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function clearIndexResizeObserver() {
  if (!indexChartResizeObserver) {
    return
  }

  indexChartResizeObserver.disconnect()
  indexChartResizeObserver = null
}

function clearDetailResizeObserver() {
  if (!detailChartResizeObserver) {
    return
  }

  detailChartResizeObserver.disconnect()
  detailChartResizeObserver = null
}

function polylineLength(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) {
    return 1
  }

  let total = 0
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]
    if (!previous || !current) continue
    total += Math.hypot(current.x - previous.x, current.y - previous.y)
  }

  return Math.max(1, total)
}

function getHabitTimeline(): HabitTimelinePoint[] {
  const body = document.getElementById("quartz-body")
  const serializedTimeline = body?.dataset.habitTimeline
  if (!serializedTimeline) {
    return []
  }

  try {
    const parsed = JSON.parse(serializedTimeline) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    const byDate = new Map<string, number>()

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        continue
      }

      const maybeDate = normalizeHabitDate((entry as { date?: unknown }).date)
      const maybeCount = Number((entry as { count?: unknown }).count)
      if (!maybeDate || !Number.isFinite(maybeCount)) {
        continue
      }

      byDate.set(maybeDate, Math.max(0, Math.round(maybeCount)))
    }

    return [...byDate.entries()]
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([date, count]) => ({ date, count }))
  } catch {
    return []
  }
}

function getHabitWeeklySeries(): HabitWeeklySeries[] {
  const body = document.getElementById("quartz-body")
  const serializedSeries = body?.dataset.habitWeeklySeries
  if (!serializedSeries) {
    return []
  }

  try {
    const parsed = JSON.parse(serializedSeries) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    const output: HabitWeeklySeries[] = []
    for (const seriesEntry of parsed) {
      if (!seriesEntry || typeof seriesEntry !== "object") {
        continue
      }

      const habit = normalizeHabitLabel((seriesEntry as { habit?: unknown }).habit)
      const averagePerWeek = Number((seriesEntry as { averagePerWeek?: unknown }).averagePerWeek)
      const rawWeekly = (seriesEntry as { weekly?: unknown }).weekly
      if (!Array.isArray(rawWeekly)) {
        continue
      }

      const weeklyMap = new Map<string, number>()
      for (const weeklyEntry of rawWeekly) {
        if (!weeklyEntry || typeof weeklyEntry !== "object") {
          continue
        }

        const maybeWeekStart = normalizeHabitDate(
          (weeklyEntry as { weekStart?: unknown }).weekStart,
        )
        const maybeCount = Number((weeklyEntry as { count?: unknown }).count)
        if (!maybeWeekStart || !Number.isFinite(maybeCount)) {
          continue
        }

        weeklyMap.set(maybeWeekStart, Math.max(0, Math.round(maybeCount)))
      }

      const weekly = [...weeklyMap.entries()]
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([weekStart, count]) => ({ weekStart, count }))

      if (weekly.length === 0) {
        continue
      }

      output.push({
        habit,
        averagePerWeek: Number.isFinite(averagePerWeek) ? Math.max(0, averagePerWeek) : 0,
        weekly,
      })
    }

    return output
  } catch {
    return []
  }
}

function getTickIndices(length: number, maxTicks: number): number[] {
  if (length <= 0) {
    return []
  }

  if (length === 1) {
    return [0]
  }

  const tickCount = Math.max(2, maxTicks)
  const indices = new Set<number>([0, length - 1])
  const denominator = Math.max(1, tickCount - 1)
  for (let i = 1; i < tickCount - 1; i++) {
    indices.add(Math.round((i / denominator) * (length - 1)))
  }

  return [...indices].sort((left, right) => left - right)
}

function getSeriesPalette(seriesCount: number): string[] {
  const rootStyles = getComputedStyle(document.documentElement)
  const themeColors = [
    rootStyles.getPropertyValue("--tertiary").trim(),
    rootStyles.getPropertyValue("--secondary").trim(),
    rootStyles.getPropertyValue("--lightgray").trim(),
  ].filter((color) => color.length > 0)

  const fallbackColors = [
    "#648de5",
    "#4ea5d9",
    "#fcb0ba",
    "#2a9d8f",
    "#e76f51",
    "#7b6fd0",
    "#f4a261",
    "#43aa8b",
    "#d96c9d",
    "#3f8efc",
  ]

  const basePalette = [...themeColors, ...fallbackColors].filter(
    (color, index, list) => list.indexOf(color) === index,
  )
  return Array.from({ length: Math.max(0, seriesCount) }, (_, index) => {
    return basePalette[index % basePalette.length] ?? fallbackColors[index % fallbackColors.length]!
  })
}

function renderStats(timeline: HabitTimelinePoint[]): string {
  const counts = timeline.map((point) => point.count)
  const totalCompleted = counts.reduce((sum, count) => sum + count, 0)
  const trackedDays = timeline.length
  const latestCount = timeline[timeline.length - 1]?.count ?? 0
  const rangeStart = formatShortDate(timeline[0]?.date ?? "")
  const rangeEnd = formatShortDate(timeline[timeline.length - 1]?.date ?? "")
  const rangeLabel = trackedDays > 1 ? `${rangeStart} - ${rangeEnd}` : rangeStart

  return `
    <div class="habit-timeline-meta">
      <span>${trackedDays} days tracked</span>
      <span>${totalCompleted} completed</span>
      <span>latest: ${latestCount}</span>
      <span>${rangeLabel}</span>
      <a class="internal alias habit-timeline-title-inline" data-slug="tracked-habits/index" data-habit-tracked-link href="./tracked-habits/">tracked habits</a>
    </div>
  `
}

function wireTrackedHabitsLink(root: ParentNode) {
  const link = root.querySelector("[data-habit-tracked-link]") as HTMLAnchorElement | null
  if (!link || link.dataset.habitSpaBound === "true") {
    return
  }

  const onClick = (event: MouseEvent) => {
    // Respect modified clicks and non-primary buttons for normal browser behavior.
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (typeof habitTimelineWindow.spaNavigate !== "function") return

    event.preventDefault()
    const targetUrl = new URL(link.href, window.location.href)
    void habitTimelineWindow.spaNavigate(targetUrl, false)
  }

  link.addEventListener("click", onClick)
  link.dataset.habitSpaBound = "true"
  registerCleanup(() => {
    link.removeEventListener("click", onClick)
    delete link.dataset.habitSpaBound
  })
}

function renderIndexChart(container: HTMLElement, timeline: HabitTimelinePoint[]) {
  const statsContainer = document.querySelector(statsSelector) as HTMLElement | null

  if (timeline.length === 0) {
    container.innerHTML = `<p class="habit-timeline-empty">No habits tracked yet.</p>`
    if (statsContainer) {
      statsContainer.innerHTML = ""
    }
    return
  }

  const measuredWidth = container.clientWidth
  const measuredHeight = container.clientHeight
  const hasRenderableArea = measuredWidth > 0 && measuredHeight > 0

  const width = Math.max(measuredWidth, 42)
  const height = Math.max(measuredHeight, 220)
  const padding = { top: 0, right: 2, bottom: 0, left: 0.5 }
  const axisX = padding.left
  const chartDepth = Math.max(1, width - padding.right - axisX)
  const chartHeight = Math.max(1, height - padding.top - padding.bottom)

  const times = timeline.map((point) => Date.parse(`${point.date}T00:00:00Z`))
  const counts = timeline.map((point) => point.count)
  const minTime = times[0] ?? 0
  const maxTime = times[times.length - 1] ?? minTime
  const hasTimeSpan = maxTime > minTime
  const timeSpan = Math.max(1, maxTime - minTime)
  const maxCount = Math.max(1, ...counts)

  const points = timeline.map((point, index) => {
    const pointTime = times[index] ?? minTime
    const y = hasTimeSpan
      ? padding.top + ((pointTime - minTime) / timeSpan) * chartHeight
      : padding.top + chartHeight / 2
    const x = axisX + (point.count / maxCount) * chartDepth
    return { x, y, count: point.count }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")
  const shouldAnimate = hasRenderableArea && habitTimelineWindow.__habitTimelineAnimated !== true
  const lineLength = polylineLength(points)
  const firstPoint = points[0] ?? { x: axisX, y: padding.top + chartHeight / 2, count: 0 }
  const lastPoint = points[points.length - 1] ?? firstPoint
  const singlePoint = points.length === 1 ? firstPoint : null
  const statsMarkup = renderStats(timeline)
  if (statsContainer) {
    statsContainer.innerHTML = statsMarkup
    wireTrackedHabitsLink(statsContainer)
  }

  container.innerHTML = `
    <svg class="habit-timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Habits completed per day over time">
      <path class="habit-timeline-line${shouldAnimate ? " is-animating" : ""}" style="--habit-line-length:${lineLength.toFixed(2)}" d="${linePath}" />
      ${
        singlePoint
          ? `<circle class="habit-timeline-point${shouldAnimate ? " is-animating" : ""}" cx="${singlePoint.x.toFixed(2)}" cy="${singlePoint.y.toFixed(2)}" r="1.8" />`
          : ""
      }
      <circle class="habit-timeline-point${shouldAnimate ? " is-animating" : ""}" cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="1.8" />
    </svg>
    ${statsContainer ? "" : statsMarkup}
  `
  if (!statsContainer) {
    wireTrackedHabitsLink(container)
  }

  if (shouldAnimate) {
    const animatedLine = container.querySelector(".habit-timeline-line.is-animating")
    if (animatedLine) {
      const onAnimationEnd = () => {
        habitTimelineWindow.__habitTimelineAnimated = true
      }

      animatedLine.addEventListener("animationend", onAnimationEnd, { once: true })
      registerCleanup(() => {
        animatedLine.removeEventListener("animationend", onAnimationEnd)
      })

      // Fallback if animationend doesn't fire (tab hidden, browser quirks, etc.).
      const fallbackTimer = window.setTimeout(() => {
        habitTimelineWindow.__habitTimelineAnimated = true
      }, 13000)
      registerCleanup(() => window.clearTimeout(fallbackTimer))
    } else {
      habitTimelineWindow.__habitTimelineAnimated = true
    }
  }
}

function renderHabitDetailChart(container: HTMLElement, allSeries: HabitWeeklySeries[]) {
  if (allSeries.length === 0) {
    container.innerHTML = `<p class="habit-detail-empty">No habit data yet.</p>`
    return
  }

  const weekStarts = [
    ...new Set(allSeries.flatMap((series) => series.weekly.map((point) => point.weekStart))),
  ]
    .filter((weekStart) => normalizeHabitDate(weekStart))
    .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate))

  if (weekStarts.length === 0) {
    container.innerHTML = `<p class="habit-detail-empty">No habit data yet.</p>`
    return
  }

  const normalizedSeries = allSeries
    .map((series) => {
      const byWeek = new Map<string, number>()
      for (const point of series.weekly) {
        const weekStart = normalizeHabitDate(point.weekStart)
        if (!weekStart) continue
        byWeek.set(weekStart, Math.max(0, Math.round(point.count)))
      }

      const weekly = weekStarts.map((weekStart) => ({
        weekStart,
        count: byWeek.get(weekStart) ?? 0,
      }))
      const fallbackAverage =
        weekly.reduce((sum, point) => sum + point.count, 0) / Math.max(1, weekly.length)
      const averagePerWeek = Number.isFinite(series.averagePerWeek)
        ? Math.max(0, Number(series.averagePerWeek))
        : fallbackAverage

      return {
        habit: normalizeHabitLabel(series.habit),
        averagePerWeek,
        weekly,
      }
    })
    .filter((series) => series.weekly.length > 0)

  if (normalizedSeries.length === 0) {
    container.innerHTML = `<p class="habit-detail-empty">No habit data yet.</p>`
    return
  }

  const containerWidth = Math.max(container.clientWidth, 640)
  const legendColumnWidth = containerWidth < 780 ? 170 : 236
  const width = Math.max(320, containerWidth - legendColumnWidth - 16)
  const height = containerWidth < 780 ? 300 : 360
  const padding = { top: 16, right: 20, bottom: 34, left: 32 }
  const chartWidth = Math.max(1, width - padding.left - padding.right)
  const chartHeight = Math.max(1, height - padding.top - padding.bottom)
  const maxWeeklyCount = Math.max(
    1,
    ...normalizedSeries.flatMap((series) => series.weekly.map((point) => point.count)),
  )
  const palette = getSeriesPalette(normalizedSeries.length)
  const shouldAnimateAll = habitTimelineWindow.__habitDetailAnimated !== true

  const getX = (weekIndex: number): number => {
    if (weekStarts.length <= 1) {
      return padding.left + chartWidth / 2
    }
    return padding.left + (weekIndex / (weekStarts.length - 1)) * chartWidth
  }

  const getY = (count: number): number => {
    return padding.top + (1 - count / maxWeeklyCount) * chartHeight
  }

  const yTickValues = [...new Set([0, Math.round(maxWeeklyCount / 2), maxWeeklyCount])]
    .filter((tick) => tick >= 0)
    .sort((left, right) => left - right)
  const yTicksMarkup = yTickValues
    .map((tick) => {
      const y = getY(tick)
      return `
        <line class="habit-detail-grid" x1="${padding.left.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(padding.left + chartWidth).toFixed(2)}" y2="${y.toFixed(2)}" />
        <text class="habit-detail-ytick" x="${(padding.left - 6).toFixed(2)}" y="${(y + 3).toFixed(2)}">${tick}</text>
      `
    })
    .join("")

  const xTickIndices = getTickIndices(weekStarts.length, 4)
  const xTicksMarkup = xTickIndices
    .map((weekIndex) => {
      const weekStart = weekStarts[weekIndex]
      if (!weekStart) return ""
      const x = getX(weekIndex)
      return `
        <line class="habit-detail-tick" x1="${x.toFixed(2)}" y1="${(padding.top + chartHeight).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(padding.top + chartHeight + 4).toFixed(2)}" />
        <text class="habit-detail-xtick" x="${x.toFixed(2)}" y="${(padding.top + chartHeight + 14).toFixed(2)}">${escapeHtml(formatShortDate(weekStart))}</text>
      `
    })
    .join("")

  const seriesMarkup = normalizedSeries
    .map((series, seriesIndex) => {
      const color = palette[seriesIndex] ?? "#648de5"
      const points = series.weekly.map((point, weekIndex) => ({
        x: getX(weekIndex),
        y: getY(point.count),
      }))
      const lineLength = polylineLength(points)
      const path = points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        )
        .join(" ")
      const lastPoint = points[points.length - 1]
      const endpointMarkup = lastPoint
        ? `<circle class="habit-detail-endpoint${shouldAnimateAll ? " is-animating" : ""}" data-series-index="${seriesIndex}" cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="2.8" fill="${color}" />`
        : ""

      return `
        <path class="habit-detail-line${shouldAnimateAll ? " is-animating" : ""}" data-series-index="${seriesIndex}" style="--habit-line-length:${lineLength.toFixed(2)}" d="${path}" stroke="${color}" />
        ${endpointMarkup}
      `
    })
    .join("")

  const legendMarkup = normalizedSeries
    .map((series, seriesIndex) => {
      const color = palette[seriesIndex] ?? "#648de5"
      return `
        <button type="button" class="habit-detail-legend-item" data-series-index="${seriesIndex}" aria-pressed="false">
          <span class="habit-detail-legend-swatch" style="background:${color}"></span>
          <span class="habit-detail-legend-name">${escapeHtml(series.habit)}</span>
          <span class="habit-detail-legend-value">${series.averagePerWeek.toFixed(2)}/wk</span>
        </button>
      `
    })
    .join("")

  container.innerHTML = `
    <div class="habit-detail-shell">
      <div class="habit-detail-layout">
        <aside class="habit-detail-legend-panel">
          <div class="habit-detail-legend">${legendMarkup}</div>
          <button type="button" class="habit-detail-reset" data-habit-detail-reset disabled>reset</button>
        </aside>
        <div class="habit-detail-plot">
          <svg class="habit-detail-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly averages for tracked habits">
            ${yTicksMarkup}
            <line class="habit-detail-axis" x1="${padding.left.toFixed(2)}" y1="${padding.top.toFixed(2)}" x2="${padding.left.toFixed(2)}" y2="${(padding.top + chartHeight).toFixed(2)}" />
            ${seriesMarkup}
            <line class="habit-detail-axis" x1="${padding.left.toFixed(2)}" y1="${(padding.top + chartHeight).toFixed(2)}" x2="${(padding.left + chartWidth).toFixed(2)}" y2="${(padding.top + chartHeight).toFixed(2)}" />
            ${xTicksMarkup}
          </svg>
        </div>
      </div>
    </div>
  `

  const legendItems = [...container.querySelectorAll<HTMLElement>(".habit-detail-legend-item")]
  const seriesEls = [
    ...container.querySelectorAll<SVGElement>(".habit-detail-line, .habit-detail-endpoint"),
  ]
  const resetButton = container.querySelector<HTMLButtonElement>("[data-habit-detail-reset]")
  const storedSelected = Number.parseInt(container.dataset.habitDetailSelected ?? "", 10)
  let selectedIndex =
    Number.isInteger(storedSelected) &&
    storedSelected >= 0 &&
    storedSelected < normalizedSeries.length
      ? storedSelected
      : null
  let hoverIndex: number | null = null

  const triggerSeriesAnimation = (seriesIndex: number) => {
    const line = container.querySelector<SVGPathElement>(
      `.habit-detail-line[data-series-index="${seriesIndex}"]`,
    )
    const endpoint = container.querySelector<SVGCircleElement>(
      `.habit-detail-endpoint[data-series-index="${seriesIndex}"]`,
    )

    if (line) {
      const lineLength = Math.max(1, line.getTotalLength())
      line.style.setProperty("--habit-line-length", `${lineLength.toFixed(2)}`)
      line.classList.remove("is-animating", "is-reanimating")
      void line.getBoundingClientRect()
      line.classList.add("is-reanimating")
      const onLineAnimationEnd = () => {
        line.classList.remove("is-reanimating")
        line.removeEventListener("animationend", onLineAnimationEnd)
      }
      line.addEventListener("animationend", onLineAnimationEnd)
    }

    if (endpoint) {
      endpoint.classList.remove("is-animating", "is-reanimating")
      void endpoint.getBoundingClientRect()
      endpoint.classList.add("is-reanimating")
      const onPointAnimationEnd = () => {
        endpoint.classList.remove("is-reanimating")
        endpoint.removeEventListener("animationend", onPointAnimationEnd)
      }
      endpoint.addEventListener("animationend", onPointAnimationEnd)
    }
  }

  const applyFocusState = () => {
    const focusIndex = selectedIndex ?? hoverIndex

    for (const legendItem of legendItems) {
      const seriesIndex = Number.parseInt(legendItem.dataset.seriesIndex ?? "", 10)
      const isActive = focusIndex !== null && seriesIndex === focusIndex
      const isDim = focusIndex !== null && seriesIndex !== focusIndex
      const isSelected = selectedIndex !== null && seriesIndex === selectedIndex
      legendItem.classList.toggle("is-active", isActive)
      legendItem.classList.toggle("is-dim", isDim)
      legendItem.classList.toggle("is-selected", isSelected)
      legendItem.setAttribute("aria-pressed", isSelected ? "true" : "false")
    }

    for (const seriesEl of seriesEls) {
      const seriesIndex = Number.parseInt(seriesEl.dataset.seriesIndex ?? "", 10)
      const isActive = focusIndex !== null && seriesIndex === focusIndex
      const isDim = focusIndex !== null && seriesIndex !== focusIndex
      seriesEl.classList.toggle("is-active", isActive)
      seriesEl.classList.toggle("is-dim", isDim)
    }

    if (selectedIndex === null) {
      delete container.dataset.habitDetailSelected
    } else {
      container.dataset.habitDetailSelected = `${selectedIndex}`
    }

    if (resetButton) {
      resetButton.disabled = selectedIndex === null
    }
  }

  for (const legendItem of legendItems) {
    const seriesIndex = Number.parseInt(legendItem.dataset.seriesIndex ?? "", 10)
    if (!Number.isInteger(seriesIndex)) continue

    legendItem.addEventListener("mouseenter", () => {
      if (selectedIndex !== null) return
      hoverIndex = seriesIndex
      applyFocusState()
    })
    legendItem.addEventListener("mouseleave", () => {
      if (selectedIndex !== null) return
      hoverIndex = null
      applyFocusState()
    })
    legendItem.addEventListener("focus", () => {
      if (selectedIndex !== null) return
      hoverIndex = seriesIndex
      applyFocusState()
    })
    legendItem.addEventListener("blur", () => {
      if (selectedIndex !== null) return
      hoverIndex = null
      applyFocusState()
    })
    legendItem.addEventListener("click", () => {
      selectedIndex = selectedIndex === seriesIndex ? null : seriesIndex
      hoverIndex = null
      applyFocusState()
      triggerSeriesAnimation(seriesIndex)
    })
  }

  resetButton?.addEventListener("click", () => {
    selectedIndex = null
    hoverIndex = null
    applyFocusState()
  })

  applyFocusState()
  if (shouldAnimateAll) {
    habitTimelineWindow.__habitDetailAnimated = true
  }
}

function mountHabitTimelineChart() {
  clearIndexResizeObserver()

  const container = document.querySelector(chartSelector) as HTMLElement | null
  if (!container) {
    return
  }

  const row = container.closest(".index-profile-habit-row") as HTMLElement | null
  const photo = row?.querySelector(".index-profile-photo") as HTMLImageElement | null

  const syncHeightToPhoto = (): boolean => {
    if (!photo) return false
    const targetHeight = Math.round(photo.getBoundingClientRect().height)
    if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
      return false
    }

    const targetHeightPx = `${targetHeight}px`
    const block = container.closest(".habit-timeline-block") as HTMLElement | null

    if (container.style.height !== targetHeightPx) {
      container.style.height = targetHeightPx
    }

    if (block && block.style.height !== targetHeightPx) {
      block.style.height = targetHeightPx
    }

    return true
  }

  const timeline = getHabitTimeline()
  const render = () => {
    syncHeightToPhoto()
    renderIndexChart(container, timeline)
  }
  render()

  if (photo && !photo.complete) {
    const onPhotoLoad = () => {
      render()
    }
    photo.addEventListener("load", onPhotoLoad, { once: true })
    registerCleanup(() => photo.removeEventListener("load", onPhotoLoad))
  }

  let lastWidth = container.clientWidth
  let lastHeight = container.clientHeight

  if (typeof ResizeObserver !== "undefined") {
    indexChartResizeObserver = new ResizeObserver(() => {
      const nextWidth = container.clientWidth
      const nextHeight = container.clientHeight
      if (nextWidth === lastWidth && nextHeight === lastHeight) {
        return
      }

      lastWidth = nextWidth
      lastHeight = nextHeight
      render()
    })
    indexChartResizeObserver.observe(container)
    if (photo) {
      indexChartResizeObserver.observe(photo)
    }
    registerCleanup(clearIndexResizeObserver)
  }
}

function mountHabitDetailChart() {
  clearDetailResizeObserver()

  const container = document.querySelector(detailChartSelector) as HTMLElement | null
  if (!container) {
    return
  }

  const allSeries = getHabitWeeklySeries()
  const render = () => renderHabitDetailChart(container, allSeries)
  render()

  let lastWidth = container.clientWidth
  let lastHeight = container.clientHeight

  if (typeof ResizeObserver !== "undefined") {
    detailChartResizeObserver = new ResizeObserver(() => {
      const nextWidth = container.clientWidth
      const nextHeight = container.clientHeight
      if (nextWidth === lastWidth && nextHeight === lastHeight) {
        return
      }

      lastWidth = nextWidth
      lastHeight = nextHeight
      render()
    })
    detailChartResizeObserver.observe(container)
    registerCleanup(clearDetailResizeObserver)
  }
}

function mountHabitCharts() {
  mountHabitTimelineChart()
  mountHabitDetailChart()
}

document.addEventListener("nav", () => {
  mountHabitCharts()
})

mountHabitCharts()
