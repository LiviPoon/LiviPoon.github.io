const track = document.querySelector("[data-story-track]")
const panels = [...document.querySelectorAll(".story-panel")]
const nextButton = document.querySelector("[data-story-next]")
const progress = document.querySelector("[data-story-progress]")
const listenButton = document.querySelector("[data-story-listen]")
const listenLabel = document.querySelector("[data-listen-label]")
const storyAudio = document.querySelector("[data-story-audio]")
const audioRail = document.querySelector("[data-audio-rail]")
const audioControl = document.querySelector("[data-audio-control]")
const audioSymbol = document.querySelector("[data-audio-symbol]")
const wave = document.querySelector("[data-story-wave]")
const mobile = window.matchMedia("(max-width: 760px)")
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

const maxPosition = Math.max(0, panels.length - 1)
let position = 0
let target = 0
const panelRevealItems = new Map()
let autoPlaying = false
let audioPlaying = false
let frame
let previousTime = performance.now()
let manualNavigationUntil = 0
let manualNavigationActive = false
let resumeAfterNavigation = false
let seekRequestId = 0
let seekPending = false
let playbackAnchorTime = 0
let playbackAnchorTimestamp = 0
let audioContext
let analyser
let frequencyData
let visualizerFrame
let visualizerLevels = new Array(28).fill(0)

const clamp = (value) => Math.max(0, Math.min(maxPosition, value))
const clampUnit = (value) => Math.max(0, Math.min(1, value))
const smoothstep = (value) => {
  const progress = clampUnit(value)
  return progress * progress * (3 - 2 * progress)
}
const revealMovements = [
  { x: -0.12, y: 0.16, rotate: -7, scale: 0.86, origin: "0% 100%" },
  { x: 0.14, y: -0.12, rotate: 6, scale: 1.12, origin: "100% 0%" },
  { x: -0.07, y: 0.22, rotate: 4, scale: 0.9, origin: "20% 100%" },
  { x: 0.1, y: 0.08, rotate: -5, scale: 1.08, origin: "100% 80%" },
]

const preparePanelReveals = () => {
  if (!track || mobile.matches || reducedMotion.matches) return

  track.classList.add("is-reveal-ready")
  panels.forEach((panel, panelIndex) => {
    const items = [...panel.querySelectorAll(
      ":scope > :not(.story-opening__inner), :scope > .story-opening__inner > *",
    )].map((item, itemIndex) => ({
      item,
      movement: revealMovements[(panelIndex * 2 + itemIndex) % revealMovements.length],
    }))
    panelRevealItems.set(panel, items)
  })
}

const updatePanelReveals = () => {
  if (!track?.classList.contains("is-reveal-ready")) return

  panels.forEach((panel, panelIndex) => {
    const panelProgress = 1 - Math.min(Math.abs(panelIndex - position), 1)
    const items = panelRevealItems.get(panel) ?? []
    const finalItemDelay = Math.min(0.48, Math.max(0, items.length - 1) * 0.12)

    items.forEach(({ item, movement }, itemIndex) => {
      const itemDelay = items.length > 1 ? (itemIndex / (items.length - 1)) * finalItemDelay : 0
      const itemProgress = smoothstep((panelProgress - itemDelay) / (1 - itemDelay))
      const remaining = 1 - itemProgress

      item.style.setProperty("--story-item-progress", itemProgress.toFixed(3))
      item.style.setProperty(
        "--story-item-translate-x",
        `${(window.innerWidth * movement.x * remaining).toFixed(1)}px`,
      )
      item.style.setProperty(
        "--story-item-translate-y",
        `${(window.innerHeight * movement.y * remaining).toFixed(1)}px`,
      )
      item.style.setProperty("--story-item-rotate", `${(movement.rotate * remaining).toFixed(2)}deg`)
      item.style.setProperty(
        "--story-item-scale",
        (1 - (1 - movement.scale) * remaining).toFixed(3),
      )
      item.style.setProperty("--story-item-blur", `${(remaining * 7).toFixed(2)}px`)
      item.style.setProperty("--story-item-origin", movement.origin)
    })
  })
}

const hasAudioTimeline = () => Boolean(
  storyAudio
  && Number.isFinite(storyAudio.duration)
  && storyAudio.duration > 0
  && maxPosition > 0
)

const audioTimeForPosition = (panelPosition) => (
  (clamp(panelPosition) / maxPosition) * storyAudio.duration
)

const anchorPlaybackClock = (timestamp = performance.now()) => {
  if (!storyAudio) return
  playbackAnchorTime = storyAudio.currentTime
  playbackAnchorTimestamp = timestamp
}

const waitForSeek = (requestedTime, requestId) => new Promise((resolve) => {
  if (!storyAudio) {
    resolve(false)
    return
  }

  const tolerance = 0.12
  if (Math.abs(storyAudio.currentTime - requestedTime) <= tolerance) {
    resolve(true)
    return
  }

  let timeout
  const finish = (successful) => {
    window.clearTimeout(timeout)
    storyAudio.removeEventListener("seeked", onSeeked)
    storyAudio.removeEventListener("error", onError)
    resolve(successful && requestId === seekRequestId)
  }
  const onSeeked = () => finish(Math.abs(storyAudio.currentTime - requestedTime) <= tolerance)
  const onError = () => finish(false)

  storyAudio.addEventListener("seeked", onSeeked, { once: true })
  storyAudio.addEventListener("error", onError, { once: true })
  timeout = window.setTimeout(() => {
    finish(Math.abs(storyAudio.currentTime - requestedTime) <= tolerance)
  }, 3000)

  storyAudio.currentTime = requestedTime
})

const finishManualNavigation = async (panelPosition, requestId) => {
  if (!hasAudioTimeline() || !storyAudio) return
  const requestedTime = audioTimeForPosition(panelPosition)
  seekPending = true
  const seekSucceeded = await waitForSeek(requestedTime, requestId)

  if (requestId === seekRequestId) seekPending = false

  if (!seekSucceeded || requestId !== seekRequestId) {
    if (requestId === seekRequestId) {
      resumeAfterNavigation = false
      console.warn(`Research audio could not seek to ${requestedTime.toFixed(2)} seconds.`)
    }
    return
  }

  // Anchor only after the media element confirms the requested timestamp.
  // Resuming earlier allows a pending seek to fall back to the beginning.
  anchorPlaybackClock()
  if (!resumeAfterNavigation) return

  try {
    await storyAudio.play()
    if (requestId === seekRequestId) resumeAfterNavigation = false
  } catch (error) {
    resumeAfterNavigation = false
    setAudioButton(false)
    console.warn("Research audio could not resume after seeking:", error)
  }
}

const navigateManually = (amount) => {
  const now = performance.now()

  // Freeze playback while the user moves through the story. Once the movement
  // settles, one seek is performed and playback continues from that point.
  if (!manualNavigationActive) {
    target = position
    manualNavigationActive = true
    resumeAfterNavigation ||= Boolean(storyAudio && !storyAudio.paused && !storyAudio.ended)
    seekRequestId += 1
    seekPending = false
    if (resumeAfterNavigation) storyAudio.pause()
  }
  target = clamp(target + amount)
  manualNavigationUntil = now + 180
}

const setAudioButton = (playing) => {
  audioPlaying = playing
  if (audioSymbol) audioSymbol.textContent = playing ? "Ⅱ" : "▷"
  audioControl?.setAttribute("aria-pressed", String(playing))
  audioControl?.setAttribute("aria-label", playing ? "Pause" : "Play")
}

const prepareVisualizer = () => {
  if (!storyAudio || !wave || audioContext) return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  audioContext = new AudioContextClass()
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 128
  analyser.smoothingTimeConstant = 0.88
  frequencyData = new Uint8Array(analyser.frequencyBinCount)
  const source = audioContext.createMediaElementSource(storyAudio)
  source.connect(analyser)
  analyser.connect(audioContext.destination)
}

const drawVisualizer = () => {
  if (!wave) return
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = wave.clientWidth
  const height = wave.clientHeight
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  if (wave.width !== pixelWidth || wave.height !== pixelHeight) {
    wave.width = pixelWidth
    wave.height = pixelHeight
  }

  const context = wave.getContext("2d")
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  if (analyser && frequencyData) analyser.getByteFrequencyData(frequencyData)

  const baseline = height
  const points = visualizerLevels.map((level, index) => {
    const bin = frequencyData ? Math.min(frequencyData.length - 1, 2 + index * 2) : 0
    const energy = frequencyData ? frequencyData[bin] / 255 : 0
    const magneticBias = Math.pow(Math.sin((index / (visualizerLevels.length - 1)) * Math.PI), 1.4)
    const target = audioPlaying ? 3 + energy * height * 0.94 * magneticBias : 2
    visualizerLevels[index] += (target - visualizerLevels[index]) * (target > visualizerLevels[index] ? 0.16 : 0.055)
    return { x: (index / (visualizerLevels.length - 1)) * width, y: baseline - visualizerLevels[index] }
  })

  const visualizerColor = getComputedStyle(wave).color
  context.beginPath()
  context.moveTo(0, baseline)
  context.lineTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    const midpoint = (previous.x + point.x) / 2
    context.bezierCurveTo(midpoint, previous.y, midpoint, point.y, point.x, point.y)
  }
  context.lineTo(width, baseline)
  context.closePath()
  context.fillStyle = visualizerColor
  context.globalAlpha = 0.82
  context.fill()

  context.globalAlpha = 0.16
  context.strokeStyle = visualizerColor
  context.lineWidth = 0.7
  context.stroke()
  context.globalAlpha = 1
  visualizerFrame = requestAnimationFrame(drawVisualizer)
}

const render = (time) => {
  if (!track || mobile.matches) return
  const elapsed = Math.min(40, Math.max(0, time - previousTime))
  previousTime = time

  if (manualNavigationActive) {
    const difference = target - position
    position = reducedMotion.matches || Math.abs(difference) < 0.0001
      ? target
      : position + difference * (1 - Math.pow(0.86, elapsed / 16.67))

    const gestureEnded = time >= manualNavigationUntil
    const movementSettled = Math.abs(target - position) < 0.001
    if (gestureEnded && movementSettled) {
      position = target
      manualNavigationActive = false
      void finishManualNavigation(position, seekRequestId)
    }
  } else if (audioPlaying && hasAudioTimeline()) {
    // The audio clock is sampled when playback begins, then advanced with the
    // high-resolution animation clock. This preserves exact average timing
    // without inheriting the media element's coarse, uneven currentTime ticks.
    const elapsedSinceAnchor = Math.max(0, (time - playbackAnchorTimestamp) / 1000)
    const smoothAudioTime = Math.min(
      storyAudio.duration,
      playbackAnchorTime + elapsedSinceAnchor * storyAudio.playbackRate,
    )
    target = clamp((smoothAudioTime / storyAudio.duration) * maxPosition)
    position = target
  }

  // Keep every panel boundary on a physical pixel. Fractional transforms can
  // expose a one-pixel antialiasing seam between otherwise identical panels.
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
  const trackOffset = Math.round(-position * window.innerWidth * pixelRatio) / pixelRatio
  track.style.transform = `translate3d(${trackOffset}px, 0, 0)`
  panels.forEach((panel, index) => {
    const distance = Math.min(Math.abs(index - position), 1)
    panel.style.setProperty("--panel-distance", String(distance))
  })
  updatePanelReveals()
  if (progress) progress.style.width = `${maxPosition ? (position / maxPosition) * 100 : 0}%`
  frame = requestAnimationFrame(render)
}

const startExperience = async () => {
  if (mobile.matches || reducedMotion.matches || autoPlaying || !storyAudio) return
  listenButton?.setAttribute("aria-pressed", "true")
  prepareVisualizer()
  void audioContext?.resume()
  if (listenLabel) listenLabel.textContent = "Listening"
  audioRail?.classList.add("is-listening")

  try {
    await storyAudio.play()
    autoPlaying = true
    anchorPlaybackClock()
    setAudioButton(true)
  } catch (error) {
    listenButton?.setAttribute("aria-pressed", "false")
    if (listenLabel) listenLabel.textContent = "Listen"
    audioRail?.classList.remove("is-listening")
    setAudioButton(false)
    console.warn("Research audio could not start:", error)
  }
}

const toggleAudio = async () => {
  if (!storyAudio || seekPending) return
  prepareVisualizer()
  await audioContext?.resume()
  if (!storyAudio.paused) {
    storyAudio.pause()
    autoPlaying = false
    return
  }

  try {
    await storyAudio.play()
    autoPlaying = true
    audioRail?.classList.add("is-listening")
  } catch (error) {
    console.warn("Research audio could not resume:", error)
  }
}

listenButton?.addEventListener("click", startExperience)
audioControl?.addEventListener("click", toggleAudio)
nextButton?.addEventListener("click", () => {
  navigateManually(0.65)
})

window.addEventListener("wheel", (event) => {
  if (mobile.matches) return
  event.preventDefault()
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  navigateManually(delta * 0.0009)
}, { passive: false })

window.addEventListener("keydown", (event) => {
  if (mobile.matches || document.querySelector(".native-menu.is-open")) return
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
    event.preventDefault()
    navigateManually(0.55)
  }
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
    event.preventDefault()
    navigateManually(-0.55)
  }
})

storyAudio?.addEventListener("ended", () => {
  autoPlaying = false
  target = maxPosition
  position = maxPosition
  setAudioButton(false)
})

storyAudio?.addEventListener("play", () => {
  anchorPlaybackClock()
  setAudioButton(true)
})

storyAudio?.addEventListener("playing", () => {
  anchorPlaybackClock()
  setAudioButton(true)
})

storyAudio?.addEventListener("waiting", () => {
  audioPlaying = false
})

storyAudio?.addEventListener("pause", () => {
  if (!storyAudio.ended) setAudioButton(false)
})

storyAudio?.addEventListener("seeked", () => anchorPlaybackClock())
storyAudio?.addEventListener("ratechange", () => anchorPlaybackClock())

storyAudio?.addEventListener("loadedmetadata", () => {
  if (position <= 0 || manualNavigationActive || audioPlaying) return
  seekRequestId += 1
  void finishManualNavigation(position, seekRequestId)
})

preparePanelReveals()
updatePanelReveals()
cancelAnimationFrame(frame)
frame = requestAnimationFrame(render)
cancelAnimationFrame(visualizerFrame)
visualizerFrame = requestAnimationFrame(drawVisualizer)
