import { cameraKeyframes, worldConnections, worldNodes, worldSatellites } from "./world-data.js"

const mapSize = { width: 1440, height: 960 }
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const lerp = (from, to, amount) => from + (to - from) * amount
const smoothstep = (value) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}

// --- One-shot force-graph layout for satellites ------------------------------------------------
// The 7 hubs keep their authored positions. Each satellite is pushed outward from its parent hub
// along its authored direction until it clears the hub's label, then a short relaxation pass
// resolves any remaining overlaps with other satellites/hubs. Connecting lines are trimmed to
// stop at each box's edge instead of running center-to-center. The graph is tiny (7 hubs + 14
// satellites), so a few geometry helpers are plenty — no physics library needed.

const SMALL_SATELLITE_MAX = 112
const MEDIUM_SATELLITE_MAX = 168
const HUB_IMAGE_MAX = 120
const HUB_IMAGE_MAX_CORE = 168
const ANCHOR_GAP = 24
const PAIR_GAP = 16
const RELAXATION_ITERATIONS = 32
const YOUTUBE_THUMBNAIL_SIZE = { width: 480, height: 360 }
const PRELOAD_TIMEOUT_MS = 8000

function waitWithTimeout(promise, timeout = PRELOAD_TIMEOUT_MS) {
  return Promise.race([promise, new Promise((resolve) => window.setTimeout(resolve, timeout))])
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = resolve
    image.onerror = resolve
    image.src = src
    if (image.complete) resolve()
  })
}

function waitForMedia(element) {
  return new Promise((resolve) => {
    if (element instanceof HTMLImageElement && element.complete) {
      resolve()
      return
    }
    const finish = () => resolve()
    element.addEventListener("load", finish, { once: true })
    element.addEventListener("error", finish, { once: true })
  })
}

function youtubeVideoId(url) {
  try {
    return new URL(url).searchParams.get("v")
  } catch {
    return null
  }
}

function mapVideoUrl(satellite) {
  const videoId = youtubeVideoId(satellite.href)
  if (!videoId) return null
  const safeId = encodeURIComponent(videoId)
  return `https://www.youtube-nocookie.com/embed/${safeId}?autoplay=1&mute=1&loop=1&playlist=${safeId}&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&enablejsapi=1`
}

/** Distance from a box's center to its edge along a (normalized) direction. */
function distanceToBoxEdge(fullWidth, fullHeight, dirX, dirY) {
  const ax = Math.abs(dirX)
  const ay = Math.abs(dirY)
  const byX = ax > 1e-6 ? fullWidth / 2 / ax : Infinity
  const byY = ay > 1e-6 ? fullHeight / 2 / ay : Infinity
  return Math.min(byX, byY)
}

/** Deterministic fallback angle, only used if a satellite is ever authored on top of its parent. */
function hashToAngle(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 360
  return (hash / 360) * Math.PI * 2
}

function resolveImageSize(url, imageDimensions) {
  if (/^https:\/\/i\.ytimg\.com\//.test(url)) return YOUTUBE_THUMBNAIL_SIZE
  const known = imageDimensions[url]
  return known?.width && known?.height ? known : { width: 4, height: 3 }
}

function satelliteBoxSize(satellite, imageDimensions) {
  const { width, height } = resolveImageSize(satellite.image, imageDimensions)
  const maxDim = satellite.size === "medium" ? MEDIUM_SATELLITE_MAX : SMALL_SATELLITE_MAX
  const aspect = width / height
  return aspect >= 1
    ? { width: maxDim, height: maxDim / aspect }
    : { width: maxDim * aspect, height: maxDim }
}

function hubImageBoxSize(node, imageDimensions) {
  const { width, height } = resolveImageSize(node.image, imageDimensions)
  const maxDim = node.kind === "core" ? HUB_IMAGE_MAX_CORE : HUB_IMAGE_MAX
  const aspect = width / height
  return aspect >= 1
    ? { width: maxDim, height: maxDim / aspect }
    : { width: maxDim * aspect, height: maxDim }
}

/** Pushes two boxes apart along whichever axis has less overlap. weightA/weightB split the
 * correction between them — pass (0, 1) to keep `a` immovable (used for hub anchors). */
function separate(a, b, boxA, boxB, gap, weightA, weightB) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const overlapX = boxA.width / 2 + boxB.width / 2 + gap - Math.abs(dx)
  const overlapY = boxA.height / 2 + boxB.height / 2 + gap - Math.abs(dy)
  if (overlapX <= 0 || overlapY <= 0) return
  if (overlapX < overlapY) {
    const push = overlapX * (dx < 0 ? -1 : 1)
    a.x -= push * weightA
    b.x += push * weightB
  } else {
    const push = overlapY * (dy < 0 ? -1 : 1)
    a.y -= push * weightA
    b.y += push * weightB
  }
}

/** Captures each satellite's authored direction/distance from its parent hub exactly once, before
 * anything mutates satellite.x/y. placeSatellites reads from this rather than from live satellite
 * coordinates, so it can be re-run later (e.g. once webfonts load and hub boxes change size)
 * without the seed itself having drifted from a previous run. */
function buildSatelliteSeeds(itemsById) {
  const seeds = new Map()
  for (const satellite of worldSatellites) {
    const parent = itemsById.get(satellite.parentId)
    if (!parent) continue
    const dx = satellite.x - parent.x
    const dy = satellite.y - parent.y
    const distance = Math.hypot(dx, dy)
    const angle = distance > 1e-3 ? Math.atan2(dy, dx) : hashToAngle(satellite.id)
    seeds.set(satellite.id, { distance, dirX: Math.cos(angle), dirY: Math.sin(angle) })
  }
  return seeds
}

/** Push each satellite outward from its parent hub along its authored direction, just far enough
 * to clear the hub's label box. Distance only ever grows from the authored seed, never shrinks. */
function placeSatellites(satelliteSeeds, itemsById, hubBoxes, imageDimensions) {
  for (const satellite of worldSatellites) {
    const parent = itemsById.get(satellite.parentId)
    const seed = satelliteSeeds.get(satellite.id)
    if (!parent || !seed) continue
    const { distance: seedDistance, dirX, dirY } = seed

    const satelliteBox = satelliteBoxSize(satellite, imageDimensions)
    const hubBox = hubBoxes.get(satellite.parentId) ?? { width: 0, height: 0 }
    const minDistance =
      distanceToBoxEdge(satelliteBox.width, satelliteBox.height, dirX, dirY) +
      distanceToBoxEdge(hubBox.width, hubBox.height, dirX, dirY) +
      ANCHOR_GAP

    const distance = Math.max(seedDistance, minDistance)
    satellite.x = parent.x + dirX * distance
    satellite.y = parent.y + dirY * distance
  }
}

/** A handful of relaxation passes so satellites never overlap each other or any hub's label. */
function relaxLayout(hubBoxes, imageDimensions) {
  for (let iteration = 0; iteration < RELAXATION_ITERATIONS; iteration++) {
    for (let i = 0; i < worldSatellites.length; i++) {
      const satellite = worldSatellites[i]
      const satelliteBox = satelliteBoxSize(satellite, imageDimensions)
      for (let j = i + 1; j < worldSatellites.length; j++) {
        const other = worldSatellites[j]
        separate(
          satellite,
          other,
          satelliteBox,
          satelliteBoxSize(other, imageDimensions),
          PAIR_GAP,
          0.5,
          0.5,
        )
      }
      for (const hub of worldNodes) {
        const hubBox = hubBoxes.get(hub.id) ?? { width: 0, height: 0 }
        separate(hub, satellite, hubBox, satelliteBox, ANCHOR_GAP, 0, 1)
      }
    }
  }
}

function getTrackerSummary() {
  const raw = document.body.dataset.trackerSummary
  if (!raw) return { habitCount: 0, days: [] }

  try {
    const parsed = JSON.parse(raw)
    const habitCount = Number.isFinite(parsed.habitCount) ? parsed.habitCount : 0
    const days = Array.isArray(parsed.days)
      ? parsed.days.map(({ count }) => ({ count: Number.isFinite(count) ? count : 0 }))
      : []
    return { habitCount, days }
  } catch {
    return { habitCount: 0, days: [] }
  }
}

function getImageDimensions() {
  const raw = document.body.dataset.imageDimensions
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function renderTrackerMarkup(summary) {
  const cells = summary.days
    .map(
      ({ count }) =>
        `<i class="world-tracker__cell world-tracker__cell--${Math.min(count, 3)}"></i>`,
    )
    .join("")
  const label = summary.habitCount === 1 ? "1 tracker" : `${summary.habitCount} trackers`
  return `<span class="world-tracker" aria-hidden="true"><span class="world-tracker__grid">${cells}</span><small>${label}</small></span>`
}

function initCursor() {
  const cursor = document.querySelector("[data-world-cursor]")
  const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)")
  if (!cursor || !supportsFinePointer.matches || reducedMotion.matches) return

  document.documentElement.classList.add("has-world-cursor")
  window.addEventListener(
    "pointermove",
    (event) => {
      cursor.style.transform = `translate3d(${event.clientX - 3.5}px, ${event.clientY - 3.5}px, 0)`
      cursor.classList.add("is-visible")
    },
    { passive: true },
  )
  document.addEventListener("mouseleave", () => cursor.classList.remove("is-visible"))
}

function initTheme() {
  const button = document.querySelector("#btn-theme")
  const themeColor = document.querySelector('meta[name="theme-color"]')
  const stored = localStorage.getItem("livi-theme")
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme
    themeColor?.setAttribute("content", theme === "dark" ? "#141413" : "#faf9f5")
  }

  setTheme(stored === "light" || stored === "dark" ? stored : preferred)
  button?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
    localStorage.setItem("livi-theme", next)
    setTheme(next)
  })
}

function initAudio() {
  const button = document.querySelector("#btn-mute")
  const label = document.querySelector("#mute-label")
  const muteMark = document.querySelector("#mute-x")
  const rawSongs = document.body.dataset.backgroundSongs
  if (!button || !label || !rawSongs) return

  let songs
  try {
    songs = JSON.parse(rawSongs)
  } catch {
    return
  }
  if (!Array.isArray(songs) || songs.length === 0) {
    button.disabled = true
    return
  }

  const PLAYBACK_STORAGE_KEY = "backgroundMusicPlaybackState"
  const MUSIC_VOLUME = 0.35
  const PAGE_FADE_MS = 220
  const audio = new Audio()
  audio.autoplay = true
  audio.preload = "auto"
  audio.setAttribute("playsinline", "")
  audio.volume = 0
  let muted = localStorage.getItem("backgroundMusicMuted") === "true"
  let track = 0

  try {
    const stored = JSON.parse(localStorage.getItem(PLAYBACK_STORAGE_KEY) || "null")
    if (stored && songs.includes(stored.src)) {
      track = songs.indexOf(stored.src)
      const restorePosition = () => {
        const elapsed = stored.paused
          ? 0
          : Math.max(0, (Date.now() - (stored.savedAt || Date.now())) / 1000)
        audio.currentTime = Math.max(0, stored.currentTime + elapsed)
      }
      audio.addEventListener("loadedmetadata", restorePosition, { once: true })
    }
  } catch {
    // A bad saved value should never stop the player from starting fresh.
  }

  audio.src = songs[track]

  function savePlayback() {
    if (!audio.src) return
    try {
      localStorage.setItem(
        PLAYBACK_STORAGE_KEY,
        JSON.stringify({
          src: songs[track],
          currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
          savedAt: Date.now(),
          muted,
          paused: false,
        }),
      )
    } catch {}
  }

  function updateButton() {
    label.textContent = muted ? "unmute" : "mute"
    muteMark?.classList.toggle("is-hidden", !muted)
  }

  function rampVolume(toVolume, duration = PAGE_FADE_MS) {
    const fromVolume = audio.volume
    const startedAt = performance.now()

    function animate(now) {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = progress * progress * (3 - 2 * progress)
      audio.volume = fromVolume + (toVolume - fromVolume) * eased
      if (progress < 1) window.requestAnimationFrame(animate)
    }

    window.requestAnimationFrame(animate)
  }

  async function play() {
    audio.muted = muted
    try {
      await audio.play()
      rampVolume(MUSIC_VOLUME)
    } catch {
      // A muted bootstrap is permitted by more browsers. Once it is playing, restore the
      // visitor's preference; a first interaction remains a fallback for stricter browsers.
      if (!muted) {
        audio.muted = true
        try {
          await audio.play()
          audio.muted = false
          rampVolume(MUSIC_VOLUME)
          return
        } catch {}
      }
    }
  }

  audio.addEventListener("ended", () => {
    track = (track + 1) % songs.length
    audio.src = songs[track]
    void play()
  })
  button.addEventListener("click", () => {
    muted = !muted
    localStorage.setItem("backgroundMusicMuted", String(muted))
    updateButton()
    void play()
  })
  audio.addEventListener("timeupdate", savePlayback)
  window.addEventListener("pagehide", savePlayback)
  window.addEventListener("beforeunload", savePlayback)
  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return
      if (!(event.target instanceof Element)) return
      const link = event.target.closest("a[href]")
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        new URL(link.href, window.location.href).origin !== window.location.origin
      ) {
        return
      }

      event.preventDefault()
      savePlayback()
      rampVolume(0)
      window.setTimeout(() => window.location.assign(link.href), PAGE_FADE_MS)
    },
    { capture: true },
  )
  window.addEventListener("pointerdown", () => void play(), { once: true, passive: true })
  updateButton()
  void play()
}

function counterTarget(counter) {
  if (counter.dataset.baseDate && counter.dataset.dailyRate) {
    const baseDate = new Date(`${counter.dataset.baseDate}T00:00:00Z`)
    const days = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / 86400000))
    return Math.round(
      Number(counter.dataset.baseValue || 0) + days * Number(counter.dataset.dailyRate),
    )
  }
  return Number(counter.dataset.end || 0)
}

function initBottomCounters() {
  if (reducedMotion.matches) return
  document.querySelectorAll("[data-world-counter]").forEach((counter, index) => {
    const value = counter.querySelector(".world-flip-counter__value")
    const target = counterTarget(counter)
    if (!value || !Number.isFinite(target) || target <= 0) return

    const duration = 980 + index * 190
    const startedAt = performance.now() + 140 + index * 100
    let lastValue = -1
    let lastFlipAt = 0

    function animate(now) {
      const progress = clamp((now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = Math.round(target * eased)
      if (nextValue !== lastValue) {
        value.textContent = nextValue.toLocaleString()
        if (now - lastFlipAt >= 75 || progress === 1) {
          counter.classList.remove("is-flipping")
          void counter.offsetWidth
          counter.classList.add("is-flipping")
          lastFlipAt = now
        }
        lastValue = nextValue
      }
      if (progress < 1) window.requestAnimationFrame(animate)
    }

    window.requestAnimationFrame(animate)
  })
}

function initMenu() {
  const menu = document.querySelector("#world-menu")
  const trigger = document.querySelector("#btn-menu")
  const close = menu?.querySelector("[data-menu-close]")
  if (!menu || !trigger) return

  function setOpen(isOpen) {
    menu.classList.toggle("is-open", isOpen)
    menu.setAttribute("aria-hidden", String(!isOpen))
    trigger.setAttribute("aria-expanded", String(isOpen))
    if (isOpen) close?.focus()
    else trigger.focus()
  }

  trigger.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")))
  close?.addEventListener("click", () => setOpen(false))
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) setOpen(false)
  })
}

function interpolateCamera(progress) {
  const upperIndex = cameraKeyframes.findIndex((frame) => frame.at >= progress)
  if (upperIndex <= 0) return cameraKeyframes[0]
  if (upperIndex === -1) return cameraKeyframes[cameraKeyframes.length - 1]

  const before = cameraKeyframes[upperIndex - 1]
  const after = cameraKeyframes[upperIndex]
  // Keep velocity continuous through authored waypoints. Easing every segment independently
  // makes the camera stop and restart at each keyframe, which reads as a scroll hitch.
  const amount = clamp((progress - before.at) / (after.at - before.at))
  return {
    x: lerp(before.x, after.x, amount),
    y: lerp(before.y, after.y, amount),
    scale: lerp(before.scale, after.scale, amount),
  }
}

async function initWorld() {
  const scrollHost = document.querySelector("[data-world-scroll-host]")
  const stage = document.querySelector("[data-world-stage]")
  const camera = document.querySelector("[data-world-camera]")
  const nodeLayer = document.querySelector("[data-world-nodes]")
  const lineLayer = document.querySelector("[data-world-lines]")
  const opening = document.querySelector("[data-world-opening]")
  const title = document.querySelector("[data-world-title]")
  const firstTitleWord = document.querySelector('[data-world-title-word="first"]')
  const secondTitleWord = document.querySelector('[data-world-title-word="second"]')
  const navigation = document.querySelector(".world-nav")
  const paper = document.querySelector("[data-world-paper]")
  const closePaper = document.querySelectorAll("[data-world-paper-close]")
  const paperMedia = document.querySelector("[data-world-paper-media]")
  const paperEyebrow = document.querySelector("[data-world-paper-eyebrow]")
  const paperTitle = document.querySelector("[data-world-paper-title]")
  const paperSummary = document.querySelector("[data-world-paper-summary]")
  const paperLink = document.querySelector("[data-world-paper-link]")

  if (
    !scrollHost ||
    !stage ||
    !camera ||
    !nodeLayer ||
    !lineLayer ||
    !opening ||
    !title ||
    !firstTitleWord ||
    !secondTitleWord ||
    !paper ||
    !paperMedia ||
    !paperEyebrow ||
    !paperTitle ||
    !paperSummary ||
    !paperLink
  ) {
    return
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  document.documentElement.classList.add("world-enhanced")
  const trackerSummary = getTrackerSummary()
  const imageDimensions = getImageDimensions()
  const allItems = [...worldNodes, ...worldSatellites]
  const itemsById = new Map(allItems.map((item) => [item.id, item]))
  const nodeElements = new Map()
  const satelliteElements = new Map()
  const lineElements = []
  let targetProgress = reducedMotion.matches ? 1 : 0
  let renderedProgress = targetProgress
  let frame = 0
  let lastRenderTime = 0
  let scrollIdleTimer = 0
  let lastFocusedNode = null
  let scrollStart = 0
  let scrollDistance = 1
  let viewportWidth = stage.clientWidth
  let viewportHeight = stage.clientHeight
  let firstTitleWidth = firstTitleWord.offsetWidth
  let firstTitleHeight = firstTitleWord.offsetHeight
  let secondTitleWidth = secondTitleWord.offsetWidth

  function measureViewport() {
    scrollStart = scrollHost.offsetTop
    scrollDistance = Math.max(1, scrollHost.offsetHeight - window.innerHeight)
    viewportWidth = stage.clientWidth
    viewportHeight = stage.clientHeight
    firstTitleWidth = firstTitleWord.offsetWidth
    firstTitleHeight = firstTitleWord.offsetHeight
    secondTitleWidth = secondTitleWord.offsetWidth
  }

  // Measures each hub's true label box (position + size, in local 1440×960 space) exactly once
  // at a known scale, so line-trimming never has to read a live rect that might be mid-reveal-
  // animation (--node-scale/--satellite-scale animate between ~0.84–1 while scrolling, which
  // would otherwise bake whatever scale happened to be active at measurement time into the trim).
  function measureHubBoxes() {
    const cameraRect = camera.getBoundingClientRect()
    const effScale = cameraRect.width / mapSize.width
    const boxes = new Map()
    for (const [id, element] of nodeElements) {
      const previousScale = element.style.getPropertyValue("--node-scale")
      element.style.setProperty("--node-scale", "1")
      const copy = element.querySelector(".world-node__copy")
      const rect = (copy ?? element).getBoundingClientRect()
      boxes.set(id, {
        x: (rect.left + rect.width / 2 - cameraRect.left) / effScale,
        y: (rect.top + rect.height / 2 - cameraRect.top) / effScale,
        width: rect.width / effScale,
        height: rect.height / effScale,
      })
      if (previousScale) element.style.setProperty("--node-scale", previousScale)
      else element.style.removeProperty("--node-scale")
    }
    return boxes
  }

  /** A connection endpoint's box in local space — from the cached hub measurement, or computed
   * directly from a satellite's own (already-placed) position and known size. Never reads the
   * live DOM, so it's unaffected by the reveal animation's current scale. */
  function getConnectionEndpointBox(id) {
    const hubBox = hubBoxes.get(id)
    if (hubBox) return hubBox
    const satellite = itemsById.get(id)
    if (!satellite) return null
    const size = satelliteBoxSize(satellite, imageDimensions)
    return { x: satellite.x, y: satellite.y, width: size.width, height: size.height }
  }

  function computeTrimmedEndpoints(connection) {
    const from = getConnectionEndpointBox(connection.from)
    const to = getConnectionEndpointBox(connection.to)
    if (!from || !to) return null

    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1e-3) return null
    const dirX = dx / distance
    const dirY = dy / distance

    const trimFrom = distanceToBoxEdge(from.width, from.height, dirX, dirY)
    const trimTo = distanceToBoxEdge(to.width, to.height, dirX, dirY)
    if (trimFrom + trimTo >= distance) return null

    return {
      x1: from.x + dirX * trimFrom,
      y1: from.y + dirY * trimFrom,
      x2: to.x - dirX * trimTo,
      y2: to.y - dirY * trimTo,
    }
  }

  function layoutLines() {
    for (const { connection, element } of lineElements) {
      const trimmed = computeTrimmedEndpoints(connection)
      if (!trimmed) continue
      element.setAttribute("x1", String(trimmed.x1))
      element.setAttribute("y1", String(trimmed.y1))
      element.setAttribute("x2", String(trimmed.x2))
      element.setAttribute("y2", String(trimmed.y2))
    }
  }

  const imageSources = [
    ...worldNodes.map((node) => node.image),
    ...worldSatellites.map((satellite) => satellite.image),
  ].filter(Boolean)
  await waitWithTimeout(
    Promise.allSettled([
      document.fonts?.ready ?? Promise.resolve(),
      ...[...new Set(imageSources)].map(preloadImage),
    ]),
  )

  for (const node of worldNodes) {
    const link = document.createElement("a")
    link.href = node.href
    link.className = `world-node world-node--${node.kind}${node.image ? " world-node--has-image" : ""}`
    link.style.setProperty("--node-x", node.x)
    link.style.setProperty("--node-y", node.y)
    link.setAttribute("aria-label", `Visit ${node.label}`)
    const imageBox = node.image ? hubImageBoxSize(node, imageDimensions) : null
    link.innerHTML = `
      ${node.tracker ? renderTrackerMarkup(trackerSummary) : ""}
      ${node.image ? `<span class="world-node__image" style="width:${imageBox.width}px;height:${imageBox.height}px"><img src="${node.image}" alt="" /></span>` : ""}
      <span class="world-node__copy"><span>${node.label}</span><small>${node.summary}</small></span>
    `
    link.classList.add("is-alive")
    link.style.setProperty("--drift-x", `${((node.x % 7) - 3) * 1.1}px`)
    link.style.setProperty("--drift-y", `${-2 - (node.y % 5)}px`)
    link.style.setProperty("--drift-duration", `${5.2 + (node.x % 4) * 0.55}s`)
    link.style.setProperty("--drift-delay", `${-(node.y % 6) * 0.45}s`)
    nodeLayer.append(link)
    nodeElements.set(node.id, link)
  }

  const satelliteSeeds = buildSatelliteSeeds(itemsById)
  let hubBoxes = measureHubBoxes()
  placeSatellites(satelliteSeeds, itemsById, hubBoxes, imageDimensions)
  relaxLayout(hubBoxes, imageDimensions)

  const mediaReady = []
  for (const satellite of worldSatellites) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `world-satellite world-satellite--${satellite.size}${satellite.video ? " world-satellite--video" : ""}`
    const satelliteBox = satelliteBoxSize(satellite, imageDimensions)
    button.style.width = `${satelliteBox.width}px`
    button.style.height = `${satelliteBox.height}px`
    button.style.setProperty("--satellite-x", satellite.x)
    button.style.setProperty("--satellite-y", satellite.y)
    if (satellite.video && satellite.image) {
      button.style.backgroundImage = `url("${satellite.image}")`
    }
    if (satellite.mobileHidden) button.dataset.mobileHidden = "true"
    button.setAttribute("aria-label", `Explore ${satellite.label}`)
    const videoUrl = satellite.video ? mapVideoUrl(satellite) : null
    button.innerHTML = videoUrl
      ? `<iframe src="${videoUrl}" title="${satellite.label}" tabindex="-1" loading="eager" allow="autoplay; encrypted-media; picture-in-picture"></iframe>`
      : `<img src="${satellite.image}" alt="" loading="eager" decoding="async" />`
    const media = button.querySelector("iframe, img")
    if (media) mediaReady.push(waitForMedia(media))
    button.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      openItem(satellite.id, button)
    })
    button.classList.add("is-alive")
    button.style.setProperty("--drift-x", `${((satellite.x % 5) - 2) * 1.35}px`)
    button.style.setProperty("--drift-y", `${-2 - (satellite.y % 4)}px`)
    button.style.setProperty("--drift-duration", `${4.4 + (satellite.y % 5) * 0.48}s`)
    button.style.setProperty("--drift-delay", `${-(satellite.x % 7) * 0.31}s`)
    nodeLayer.append(button)
    satelliteElements.set(satellite.id, button)
  }

  for (const connection of worldConnections) {
    const from = itemsById.get(connection.from)
    const to = itemsById.get(connection.to)
    if (!from || !to) continue
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
    line.setAttribute("pathLength", "1")
    lineLayer.append(line)
    lineElements.push({ connection, element: line })
  }
  layoutLines()
  await waitWithTimeout(Promise.allSettled(mediaReady))

  function getScrollProgress() {
    if (reducedMotion.matches) return 1
    return clamp((window.scrollY - scrollStart) / scrollDistance)
  }

  function requestRender() {
    if (!frame) frame = window.requestAnimationFrame(render)
  }

  function render(timestamp = performance.now()) {
    frame = 0
    const elapsed = lastRenderTime ? Math.min(48, timestamp - lastRenderTime) : 16
    lastRenderTime = timestamp
    const progressDelta = targetProgress - renderedProgress
    const settleAmount = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 72)
    renderedProgress =
      Math.abs(progressDelta) < 0.0002
        ? targetProgress
        : renderedProgress + progressDelta * settleAmount

    const state = interpolateCamera(renderedProgress)
    const baseScale = Math.max(viewportWidth / mapSize.width, viewportHeight / mapSize.height)
    camera.style.transform = `translate3d(${viewportWidth / 2}px, ${viewportHeight / 2}px, 0) scale(${baseScale * state.scale}) translate3d(${-state.x}px, ${-state.y}px, 0)`

    const openingVisibility = 1 - smoothstep((renderedProgress - 0.07) / 0.13)
    opening.style.setProperty("--opening-visibility", String(openingVisibility))
    opening.style.setProperty("--opening-y", `${(1 - openingVisibility) * -24}px`)

    const portraitVisibility = 1 - smoothstep((renderedProgress - 0.025) / 0.14)
    title.style.setProperty("--portrait-opacity", String(portraitVisibility))

    const titleSeparation = smoothstep((renderedProgress - 0.18) / 0.3)
    const titleGap = Math.min(viewportWidth * 0.15, 188)
    const initialY = viewportHeight * 0.47
    const titleCenterCorrection = (firstTitleWidth - secondTitleWidth) / 4
    const firstStart = {
      x: viewportWidth / 2 - titleGap + titleCenterCorrection,
      y: initialY,
    }
    const secondStart = {
      x: viewportWidth / 2 + titleGap + titleCenterCorrection,
      y: initialY,
    }
    const titleEdgeMargin = Math.max(20, Math.min(34, viewportWidth * 0.025))
    const firstEnd = {
      x: Math.max(viewportWidth * 0.08, titleEdgeMargin + firstTitleWidth * 0.46),
      y: Math.max(viewportHeight * 0.1, titleEdgeMargin + firstTitleHeight * 0.46),
    }
    const secondEnd = { x: viewportWidth * 0.84, y: viewportHeight * 0.87 }

    title.style.setProperty("--title-opacity", "1")
    firstTitleWord.style.setProperty(
      "--title-word-x",
      `${lerp(firstStart.x, firstEnd.x, titleSeparation)}px`,
    )
    firstTitleWord.style.setProperty(
      "--title-word-y",
      `${lerp(firstStart.y, firstEnd.y, titleSeparation)}px`,
    )
    firstTitleWord.style.setProperty("--title-word-scale", String(lerp(1, 0.92, titleSeparation)))
    secondTitleWord.style.setProperty(
      "--title-word-x",
      `${lerp(secondStart.x, secondEnd.x, titleSeparation)}px`,
    )
    secondTitleWord.style.setProperty(
      "--title-word-y",
      `${lerp(secondStart.y, secondEnd.y, titleSeparation)}px`,
    )
    secondTitleWord.style.setProperty("--title-word-scale", String(lerp(1, 0.92, titleSeparation)))

    if (navigation) {
      const navigationVisibility = 1 - smoothstep((renderedProgress - 0.04) / 0.12)
      navigation.style.setProperty("--navigation-visibility", String(navigationVisibility))
    }

    for (const node of worldNodes) {
      const start = node.stage - 0.12
      const visibility = smoothstep((renderedProgress - start) / 0.2)
      const element = nodeElements.get(node.id)
      element?.style.setProperty("--node-reveal", String(visibility))
      element?.style.setProperty("--node-scale", String(0.84 + visibility * 0.16))
    }

    for (const satellite of worldSatellites) {
      const visibility = smoothstep((renderedProgress - (satellite.stage - 0.1)) / 0.16)
      const element = satelliteElements.get(satellite.id)
      const origin = itemsById.get(satellite.parentId)
      const originX = origin?.x ?? satellite.x
      const originY = origin?.y ?? satellite.y
      element?.style.setProperty("--satellite-reveal", String(visibility))
      element?.style.setProperty("--satellite-scale", String(0.9 + visibility * 0.1))
      element?.style.setProperty(
        "--satellite-offset-x",
        `${(originX - satellite.x) * (1 - visibility)}px`,
      )
      element?.style.setProperty(
        "--satellite-offset-y",
        `${(originY - satellite.y) * (1 - visibility)}px`,
      )
    }

    for (const { connection, element } of lineElements) {
      element.style.setProperty(
        "--line-reveal",
        String(smoothstep((renderedProgress - (connection.stage - 0.06)) / 0.18)),
      )
    }

    if (renderedProgress !== targetProgress) requestRender()
  }

  function scrollToProgress(progress) {
    const distance = scrollHost.offsetHeight - window.innerHeight
    const top = window.scrollY + scrollHost.getBoundingClientRect().top + clamp(progress) * distance
    window.scrollTo({ top, behavior: reducedMotion.matches ? "auto" : "smooth" })
  }

  function closeDetails(returnFocus = false) {
    if (paper.hidden) return
    paper.hidden = true
    stage.classList.remove("is-paper-open")
    paperMedia.replaceChildren()
    if (returnFocus) lastFocusedNode?.focus()
  }

  function openItem(id, trigger) {
    const item = itemsById.get(id)
    if (!item) return
    lastFocusedNode = trigger
    paperEyebrow.textContent = item.eyebrow
    paperTitle.textContent = item.label
    paperSummary.textContent = item.summary
    paperLink.href = item.href
    paperLink.target = item.external ? "_blank" : ""
    paperLink.rel = item.external ? "noopener noreferrer" : ""
    paperLink.replaceChildren(
      `${item.linkLabel ?? "Go there"} `,
      Object.assign(document.createElement("span"), { textContent: "↗", ariaHidden: "true" }),
    )
    paperLink.setAttribute("aria-label", `Visit ${item.label}`)

    paperMedia.replaceChildren()
    if (item.video) {
      try {
        const videoId = new URL(item.href).searchParams.get("v")
        if (videoId) {
          const iframe = document.createElement("iframe")
          iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=0&playsinline=1&rel=0`
          iframe.title = item.label
          iframe.allow = "autoplay; encrypted-media; picture-in-picture"
          iframe.allowFullscreen = true
          paperMedia.replaceChildren(iframe)
        }
      } catch {
        // Leave the paper media area empty if a malformed video URL ever slips into the map data.
      }
    } else if (item.image) {
      const image = document.createElement("img")
      image.src = item.image
      image.alt = item.label
      paperMedia.replaceChildren(image)
    }

    paper.hidden = false
    stage.classList.add("is-paper-open")
    paper.querySelector("[data-world-paper-close]")?.focus()
  }

  function updateFromScroll() {
    targetProgress = getScrollProgress()
    stage.classList.add("is-scrolling")
    window.clearTimeout(scrollIdleTimer)
    scrollIdleTimer = window.setTimeout(() => {
      stage.classList.remove("is-scrolling")
    }, 160)
    requestRender()
  }

  window.addEventListener("scroll", updateFromScroll, { passive: true })
  window.addEventListener(
    "resize",
    () => {
      measureViewport()
      updateFromScroll()
    },
    { passive: true },
  )
  reducedMotion.addEventListener("change", updateFromScroll)
  document.querySelector("[data-world-home]")?.addEventListener("click", (event) => {
    event.preventDefault()
    closeDetails()
    scrollToProgress(0)
  })
  closePaper.forEach((button) => button.addEventListener("click", () => closeDetails(true)))
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDetails(true)
    }
  })

  measureViewport()
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      render()
      camera.style.visibility = "visible"
      updateFromScroll()
      window.requestAnimationFrame(resolve)
    })
  })
}

initTheme()
initCursor()
initAudio()
initMenu()
void initWorld().finally(() => {
  document.documentElement.classList.remove("is-preloading")
  initBottomCounters()
})
