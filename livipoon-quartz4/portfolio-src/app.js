import { cameraKeyframes, worldConnections, worldNodes, worldSatellites } from "./world-data.js"

const mapSize = { width: 1440, height: 960 }
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const lerp = (from, to, amount) => from + (to - from) * amount
const smoothstep = (value) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
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

function renderTrackerMarkup(summary) {
  const cells = summary.days
    .map(({ count }) => `<i class="world-tracker__cell world-tracker__cell--${Math.min(count, 3)}"></i>`)
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

  const audio = new Audio()
  audio.preload = "none"
  audio.volume = 0.35
  let track = 0
  let started = false
  let muted = localStorage.getItem("backgroundMusicMuted") === "true"

  function updateButton() {
    label.textContent = muted ? "unmute" : "mute"
    muteMark?.classList.toggle("is-hidden", !muted)
  }

  async function play() {
    if (!started) {
      audio.src = songs[track]
      started = true
    }
    audio.muted = muted
    try {
      await audio.play()
    } catch {
      // Browsers may require another explicit user gesture before playback.
    }
  }

  audio.addEventListener("ended", () => {
    track = (track + 1) % songs.length
    audio.src = songs[track]
    void play()
  })
  button.addEventListener("click", () => {
    if (!started) muted = false
    else muted = !muted
    localStorage.setItem("backgroundMusicMuted", String(muted))
    updateButton()
    void play()
  })
  updateButton()
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
  const amount = smoothstep((progress - before.at) / (after.at - before.at))
  return {
    x: lerp(before.x, after.x, amount),
    y: lerp(before.y, after.y, amount),
    scale: lerp(before.scale, after.scale, amount),
  }
}

function initWorld() {
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
  const card = document.querySelector("[data-world-card]")
  const closeCard = document.querySelector("[data-world-card-close]")
  const cardEyebrow = document.querySelector("[data-world-card-eyebrow]")
  const cardTitle = document.querySelector("[data-world-card-title]")
  const cardSummary = document.querySelector("[data-world-card-summary]")
  const cardLink = document.querySelector("[data-world-card-link]")

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
    !card ||
    !cardEyebrow ||
    !cardTitle ||
    !cardSummary ||
    !cardLink
  ) {
    return
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  document.documentElement.classList.add("world-enhanced")
  const trackerSummary = getTrackerSummary()
  const allItems = [...worldNodes, ...worldSatellites]
  const itemsById = new Map(allItems.map((item) => [item.id, item]))
  const nodeElements = new Map()
  const satelliteElements = new Map()
  const lineElements = []
  let targetProgress = reducedMotion.matches ? 1 : 0
  let renderedProgress = targetProgress
  let frame = 0
  let previousFrameTime = 0
  let lastFocusedNode = null

  for (const node of worldNodes) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `world-node world-node--${node.kind}${node.image ? " world-node--has-image" : ""}`
    button.style.setProperty("--node-x", node.x)
    button.style.setProperty("--node-y", node.y)
    button.setAttribute("aria-label", `Explore ${node.label}`)
    button.innerHTML = `
      ${node.tracker ? renderTrackerMarkup(trackerSummary) : ""}
      ${node.image ? `<span class="world-node__image"><img src="${node.image}" alt="" /></span>` : ""}
      <span class="world-node__copy"><span>${node.label}</span><small>${node.eyebrow}</small></span>
    `
    button.addEventListener("click", () => openItem(node.id, button))
    nodeLayer.append(button)
    nodeElements.set(node.id, button)
  }

  for (const satellite of worldSatellites) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `world-satellite world-satellite--${satellite.size}${satellite.video ? " world-satellite--video" : ""}`
    button.style.setProperty("--satellite-x", satellite.x)
    button.style.setProperty("--satellite-y", satellite.y)
    if (satellite.mobileHidden) button.dataset.mobileHidden = "true"
    button.setAttribute("aria-label", `Explore ${satellite.label}`)
    button.innerHTML = `<img src="${satellite.image}" alt="" />${satellite.video ? '<span class="world-satellite__play" aria-hidden="true">▶</span>' : ""}`
    button.addEventListener("click", () => openItem(satellite.id, button))
    nodeLayer.append(button)
    satelliteElements.set(satellite.id, button)
  }

  for (const connection of worldConnections) {
    const from = itemsById.get(connection.from)
    const to = itemsById.get(connection.to)
    if (!from || !to) continue
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
    line.setAttribute("x1", String(from.x))
    line.setAttribute("y1", String(from.y))
    line.setAttribute("x2", String(to.x))
    line.setAttribute("y2", String(to.y))
    line.setAttribute("pathLength", "1")
    lineLayer.append(line)
    lineElements.push({ connection, element: line })
  }

  function getScrollProgress() {
    if (reducedMotion.matches) return 1
    const rect = scrollHost.getBoundingClientRect()
    const distance = Math.max(1, scrollHost.offsetHeight - window.innerHeight)
    return clamp(-rect.top / distance)
  }

  function requestRender() {
    if (!frame) frame = window.requestAnimationFrame(render)
  }

  function render(timestamp) {
    frame = 0
    const elapsed = previousFrameTime
      ? Math.min((timestamp - previousFrameTime) / 1000, 0.05)
      : 1 / 60
    previousFrameTime = timestamp
    const catchUp = reducedMotion.matches ? 1 : 1 - Math.exp(-16 * elapsed)
    renderedProgress += (targetProgress - renderedProgress) * catchUp
    if (Math.abs(targetProgress - renderedProgress) < 0.0002) renderedProgress = targetProgress

    const state = interpolateCamera(renderedProgress)
    const baseScale = Math.max(
      stage.clientWidth / mapSize.width,
      stage.clientHeight / mapSize.height,
    )
    camera.style.transform = `translate3d(${stage.clientWidth / 2}px, ${stage.clientHeight / 2}px, 0) scale(${baseScale * state.scale}) translate3d(${-state.x}px, ${-state.y}px, 0)`

    const openingVisibility = 1 - smoothstep((renderedProgress - 0.07) / 0.13)
    opening.style.setProperty("--opening-visibility", String(openingVisibility))
    opening.style.setProperty("--opening-y", `${(1 - openingVisibility) * -24}px`)

    const titleSeparation = smoothstep((renderedProgress - 0.18) / 0.3)
    const titleGap = Math.min(stage.clientWidth * 0.15, 188)
    const initialY = stage.clientHeight * 0.47
    const firstStart = { x: stage.clientWidth / 2 - titleGap, y: initialY }
    const secondStart = { x: stage.clientWidth / 2 + titleGap, y: initialY }
    const firstEnd = { x: stage.clientWidth * 0.13, y: stage.clientHeight * 0.17 }
    const secondEnd = { x: stage.clientWidth * 0.78, y: stage.clientHeight * 0.79 }

    title.style.setProperty("--title-opacity", "1")
    firstTitleWord.style.setProperty("--title-word-x", `${lerp(firstStart.x, firstEnd.x, titleSeparation)}px`)
    firstTitleWord.style.setProperty("--title-word-y", `${lerp(firstStart.y, firstEnd.y, titleSeparation)}px`)
    firstTitleWord.style.setProperty("--title-word-scale", String(lerp(1, 0.92, titleSeparation)))
    secondTitleWord.style.setProperty("--title-word-x", `${lerp(secondStart.x, secondEnd.x, titleSeparation)}px`)
    secondTitleWord.style.setProperty("--title-word-y", `${lerp(secondStart.y, secondEnd.y, titleSeparation)}px`)
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
      element?.style.setProperty("--satellite-offset-x", `${(originX - satellite.x) * (1 - visibility)}px`)
      element?.style.setProperty("--satellite-offset-y", `${(originY - satellite.y) * (1 - visibility)}px`)
    }

    for (const { connection, element } of lineElements) {
      element.style.setProperty(
        "--line-reveal",
        String(smoothstep((renderedProgress - (connection.stage - 0.06)) / 0.18)),
      )
    }

    if (renderedProgress !== targetProgress) requestRender()
    else previousFrameTime = 0
  }

  function scrollToProgress(progress) {
    const distance = scrollHost.offsetHeight - window.innerHeight
    const top = window.scrollY + scrollHost.getBoundingClientRect().top + clamp(progress) * distance
    window.scrollTo({ top, behavior: reducedMotion.matches ? "auto" : "smooth" })
  }

  function closeDetails(returnFocus = false) {
    if (card.hidden) return
    card.hidden = true
    if (returnFocus) lastFocusedNode?.focus()
  }

  function openItem(id, trigger) {
    const item = itemsById.get(id)
    if (!item) return
    lastFocusedNode = trigger
    cardEyebrow.textContent = item.eyebrow
    cardTitle.textContent = item.label
    cardSummary.textContent = item.summary
    cardLink.href = item.href
    cardLink.target = item.external ? "_blank" : ""
    cardLink.rel = item.external ? "noopener noreferrer" : ""
    cardLink.replaceChildren(`${item.linkLabel ?? "Go there"} `, Object.assign(document.createElement("span"), { textContent: "↗", ariaHidden: "true" }))
    cardLink.setAttribute("aria-label", `Visit ${item.label}`)
    card.hidden = false
    scrollToProgress(Math.min(1, item.stage + 0.13))
    closeCard?.focus()
  }

  function updateFromScroll() {
    targetProgress = getScrollProgress()
    requestRender()
  }

  window.addEventListener("scroll", updateFromScroll, { passive: true })
  window.addEventListener("resize", updateFromScroll, { passive: true })
  reducedMotion.addEventListener("change", updateFromScroll)
  document.querySelectorAll("[data-world-enter]").forEach((button) => {
    button.addEventListener("click", () => scrollToProgress(0.22))
  })
  document.querySelector("[data-world-home]")?.addEventListener("click", (event) => {
    event.preventDefault()
    closeDetails()
    scrollToProgress(0)
  })
  closeCard?.addEventListener("click", () => closeDetails(true))
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDetails(true)
  })

  window.requestAnimationFrame((timestamp) => {
    render(timestamp)
    camera.style.visibility = "visible"
    updateFromScroll()
  })
}

initTheme()
initCursor()
initAudio()
initMenu()
initWorld()
