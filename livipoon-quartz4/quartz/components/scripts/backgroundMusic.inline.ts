interface BackgroundMusicState {
  audio: HTMLAudioElement
  audioContext: AudioContext | null
  sourceNode: MediaElementAudioSourceNode | null
  convolverNode: ConvolverNode | null
  dryGainNode: GainNode | null
  wetGainNode: GainNode | null
  hasReverb: boolean
  reverbUnavailable: boolean
  controls: HTMLDivElement
  licenseCluster: HTMLDivElement
  button: HTMLButtonElement
  licenseLink: HTMLAnchorElement
  playlist: string[]
  currentTrackSrc: string | null
  playQueue: string[]
  lastPlayedTrackSrc: string | null
  baseVolume: number
  duckedVolume: number
  isDucked: boolean
  volumeAnimationFrame: number | null
  hasUnlockListeners: boolean
  hasVisibilityListeners: boolean
}

type BackgroundMusicWindow = Window &
  typeof globalThis & {
    __backgroundMusicState?: BackgroundMusicState
    __backgroundMusicDucked?: boolean
    webkitAudioContext?: {
      new (): AudioContext
    }
  }

const backgroundWindow = window as BackgroundMusicWindow

const MUTED_STORAGE_KEY = "backgroundMusicMuted"
const MUTE_EVENT_NAME = "background-mute-changed"
const DUCK_EVENT_NAME = "background-music-duck-changed"
const BASE_VOLUME = 1
const DUCKED_VOLUME = 0.15
const VOLUME_RAMP_DURATION_MS = 260
const REVERB_DRY_MIX = 0.72
const REVERB_WET_MIX = 0.58
const REVERB_DURATION_SECONDS = 4.6
const REVERB_DECAY_POWER = 2.7
const REVERB_EARLY_REFLECTION_SECONDS = 0.08
const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/"
const LICENSE_LABEL = "CC BY-NC-ND 4.0"
const LICENSE_CREDIT_PREFIX = "music from"
const LICENSE_CREDITS = [
  {
    name: "Mae Lee",
    url: "https://www.youtube.com/@unemecheblanche",
    ariaLabel: "Mae Lee YouTube channel",
  },
  {
    name: "Bea Laus",
    url: "https://www.beabadoobee.com/",
    ariaLabel: "Bea Laus official website",
  },
  {
    name: "Sally Kim",
    url: "https://www.youtube.com/@sallykimmmm",
    ariaLabel: "Sally Kim YouTube channel",
  },
] as const

function emitMuteChange(muted: boolean) {
  document.dispatchEvent(
    new CustomEvent(MUTE_EVENT_NAME, {
      detail: { muted },
    }),
  )
}

function normalizePlaylist(rawPlaylist: unknown[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const value of rawPlaylist) {
    if (typeof value !== "string" || value.length === 0) continue
    if (seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function parsePlaylist(): string[] {
  const host = document.getElementById("quartz-body") as HTMLElement | null
  const raw = host?.dataset.backgroundSongs
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return normalizePlaylist(parsed)
  } catch {
    return []
  }
}

function playlistsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function updateButton(state: BackgroundMusicState) {
  state.button.textContent = state.audio.muted ? "unmute" : "mute"
  state.button.classList.toggle("is-muted", state.audio.muted)
  state.button.setAttribute("aria-pressed", String(state.audio.muted))
}

function createConcertHallImpulse(context: AudioContext): AudioBuffer {
  const sampleRate = context.sampleRate
  const length = Math.floor(sampleRate * REVERB_DURATION_SECONDS)
  const buffer = context.createBuffer(2, length, sampleRate)
  const earlySamples = Math.floor(sampleRate * REVERB_EARLY_REFLECTION_SECONDS)

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const normalizedPosition = i / length
      const amplitude = Math.pow(1 - normalizedPosition, REVERB_DECAY_POWER)
      const earlyReflectionBoost = i < earlySamples ? 1.25 : 1
      const stereoSpread =
        channel === 0 ? 1 - normalizedPosition * 0.08 : 1 + normalizedPosition * 0.08
      data[i] = (Math.random() * 2 - 1) * amplitude * earlyReflectionBoost * stereoSpread
    }
  }

  return buffer
}

async function tryEnableConcertHallReverb(state: BackgroundMusicState) {
  if (state.hasReverb || state.reverbUnavailable) return

  const AudioContextCtor = window.AudioContext ?? backgroundWindow.webkitAudioContext
  if (!AudioContextCtor) {
    state.reverbUnavailable = true
    return
  }

  try {
    const context = new AudioContextCtor()
    if (context.state !== "running") {
      try {
        await context.resume()
      } catch {
        // If autoplay policy blocks the context, keep plain audio and retry later.
      }
    }
    if (context.state !== "running") {
      await context.close().catch(() => {})
      return
    }

    const source = context.createMediaElementSource(state.audio)
    const convolver = context.createConvolver()
    const dryGain = context.createGain()
    const wetGain = context.createGain()

    convolver.normalize = true
    convolver.buffer = createConcertHallImpulse(context)
    dryGain.gain.value = REVERB_DRY_MIX
    wetGain.gain.value = REVERB_WET_MIX

    source.connect(dryGain)
    source.connect(convolver)
    convolver.connect(wetGain)
    dryGain.connect(context.destination)
    wetGain.connect(context.destination)

    state.audioContext = context
    state.sourceNode = source
    state.convolverNode = convolver
    state.dryGainNode = dryGain
    state.wetGainNode = wetGain
    state.hasReverb = true
  } catch {
    state.reverbUnavailable = true
  }
}

function getTargetVolume(state: BackgroundMusicState): number {
  return state.isDucked ? state.duckedVolume : state.baseVolume
}

function rampVolume(state: BackgroundMusicState) {
  const fromVolume = state.audio.volume
  const toVolume = getTargetVolume(state)
  if (Math.abs(toVolume - fromVolume) < 0.001) {
    state.audio.volume = toVolume
    return
  }

  if (state.volumeAnimationFrame !== null) {
    window.cancelAnimationFrame(state.volumeAnimationFrame)
    state.volumeAnimationFrame = null
  }

  const startMs = performance.now()
  const animate = (nowMs: number) => {
    const progress = Math.min(1, (nowMs - startMs) / VOLUME_RAMP_DURATION_MS)
    const eased = 1 - Math.pow(1 - progress, 3)
    state.audio.volume = fromVolume + (toVolume - fromVolume) * eased

    if (progress < 1) {
      state.volumeAnimationFrame = window.requestAnimationFrame(animate)
      return
    }

    state.volumeAnimationFrame = null
    state.audio.volume = toVolume
  }

  state.volumeAnimationFrame = window.requestAnimationFrame(animate)
}

function loadTrack(state: BackgroundMusicState, src: string) {
  if (!src) return
  state.currentTrackSrc = src
  state.lastPlayedTrackSrc = src
  state.audio.src = src
  state.audio.load()
}

function refillPlayQueue(state: BackgroundMusicState) {
  if (state.playlist.length === 0) {
    state.playQueue = []
    return
  }

  const shuffled = shuffle(state.playlist)
  if (
    shuffled.length > 1 &&
    state.lastPlayedTrackSrc &&
    shuffled[0] === state.lastPlayedTrackSrc
  ) {
    const swapIndex = shuffled.findIndex((track) => track !== state.lastPlayedTrackSrc)
    if (swapIndex > 0) {
      ;[shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]]
    }
  }

  state.playQueue = shuffled
}

function queueNextTrack(state: BackgroundMusicState): boolean {
  if (state.playlist.length === 0) return false
  if (state.playQueue.length === 0) {
    refillPlayQueue(state)
  }

  const nextTrack = state.playQueue.shift()
  if (!nextTrack) return false

  loadTrack(state, nextTrack)
  return true
}

function addUnlockListeners(state: BackgroundMusicState) {
  if (state.hasUnlockListeners) return
  state.hasUnlockListeners = true

  const unlock = () => {
    state.hasUnlockListeners = false
    window.removeEventListener("pointerdown", unlock)
    window.removeEventListener("keydown", unlock)
    window.removeEventListener("touchstart", unlock)
    void attemptPlay(state)
  }

  window.addEventListener("pointerdown", unlock, { once: true })
  window.addEventListener("keydown", unlock, { once: true })
  window.addEventListener("touchstart", unlock, { once: true })
}

async function attemptPlay(state: BackgroundMusicState) {
  if (state.playlist.length === 0) return
  if (document.visibilityState === "hidden") return
  if (!state.audio.src || !state.currentTrackSrc) {
    const loaded = queueNextTrack(state)
    if (!loaded) return
  }

  await tryEnableConcertHallReverb(state)

  try {
    await state.audio.play()
    void tryEnableConcertHallReverb(state)
  } catch {
    addUnlockListeners(state)
  }
}

function syncVisibilityPlayback(state: BackgroundMusicState) {
  if (document.visibilityState === "hidden") {
    state.audio.pause()
    return
  }

  void attemptPlay(state)
}

function addVisibilityListeners(state: BackgroundMusicState) {
  if (state.hasVisibilityListeners) return
  state.hasVisibilityListeners = true

  document.addEventListener("visibilitychange", () => {
    syncVisibilityPlayback(state)
  })

  window.addEventListener("focus", () => {
    syncVisibilityPlayback(state)
  })

  window.addEventListener("blur", () => {
    syncVisibilityPlayback(state)
  })
}

function createState(playlist: string[]): BackgroundMusicState {
  const audio = new Audio()
  audio.autoplay = true
  audio.preload = "auto"
  audio.setAttribute("playsinline", "")
  audio.volume = BASE_VOLUME

  const muted = localStorage.getItem(MUTED_STORAGE_KEY) === "true"
  audio.muted = muted

  const controls = document.createElement("div")
  controls.className = "background-music-controls"

  const licenseCluster = document.createElement("div")
  licenseCluster.className = "background-music-license-cluster"

  const button = document.createElement("button")
  button.type = "button"
  button.className = "background-music-mute"
  button.setAttribute("aria-label", "Toggle background music mute")

  const licenseLink = document.createElement("a")
  licenseLink.className = "background-music-license"
  licenseLink.href = LICENSE_URL
  licenseLink.target = "_blank"
  licenseLink.rel = "noopener noreferrer"
  licenseLink.textContent = LICENSE_LABEL
  licenseLink.setAttribute("aria-label", "Creative Commons BY-NC-ND 4.0 license")

  const creditPrefix = document.createElement("span")
  creditPrefix.className = "background-music-credit"
  creditPrefix.textContent = LICENSE_CREDIT_PREFIX

  const creditLinks = document.createElement("span")
  LICENSE_CREDITS.forEach((credit, index) => {
    if (index > 0) {
      const separator = document.createElement("span")
      separator.className = "background-music-credit"
      separator.textContent = ", "
      creditLinks.append(separator)
    }

    const creditLink = document.createElement("a")
    creditLink.className = "background-music-credit-link"
    creditLink.href = credit.url
    creditLink.target = "_blank"
    creditLink.rel = "noopener noreferrer"
    creditLink.textContent = credit.name
    creditLink.setAttribute("aria-label", credit.ariaLabel)
    creditLinks.append(creditLink)
  })

  licenseCluster.append(licenseLink, creditPrefix, creditLinks)
  controls.append(button)

  const state: BackgroundMusicState = {
    audio,
    audioContext: null,
    sourceNode: null,
    convolverNode: null,
    dryGainNode: null,
    wetGainNode: null,
    hasReverb: false,
    reverbUnavailable: false,
    controls,
    licenseCluster,
    button,
    licenseLink,
    playlist: [...playlist],
    currentTrackSrc: null,
    playQueue: [],
    lastPlayedTrackSrc: null,
    baseVolume: BASE_VOLUME,
    duckedVolume: DUCKED_VOLUME,
    isDucked: backgroundWindow.__backgroundMusicDucked === true,
    volumeAnimationFrame: null,
    hasUnlockListeners: false,
    hasVisibilityListeners: false,
  }

  const onDuckChanged = (event: Event) => {
    const ducked = (event as CustomEvent<{ ducked?: boolean }>).detail?.ducked === true
    backgroundWindow.__backgroundMusicDucked = ducked
    if (ducked === state.isDucked) return
    state.isDucked = ducked
    rampVolume(state)
  }
  document.addEventListener(DUCK_EVENT_NAME, onDuckChanged as EventListener)

  button.addEventListener("click", () => {
    state.audio.muted = !state.audio.muted
    localStorage.setItem(MUTED_STORAGE_KEY, String(state.audio.muted))
    updateButton(state)
    emitMuteChange(state.audio.muted)

    if (!state.audio.muted) {
      void attemptPlay(state)
    }
  })

  audio.addEventListener("ended", () => {
    const loaded = queueNextTrack(state)
    if (!loaded) {
      state.audio.pause()
      return
    }
    void attemptPlay(state)
  })

  document.body.appendChild(controls)
  document.body.appendChild(licenseCluster)
  state.audio.volume = getTargetVolume(state)
  updateButton(state)
  emitMuteChange(state.audio.muted)
  addVisibilityListeners(state)

  return state
}

function syncBackgroundMusicForPage() {
  const playlist = parsePlaylist()
  if (playlist.length === 0) return

  let state = backgroundWindow.__backgroundMusicState
  if (!state) {
    state = createState(playlist)
    backgroundWindow.__backgroundMusicState = state
    queueNextTrack(state)
    void attemptPlay(state)
    return
  }

  if (!document.body.contains(state.controls)) {
    document.body.appendChild(state.controls)
  }
  if (!document.body.contains(state.licenseCluster)) {
    document.body.appendChild(state.licenseCluster)
  }

  if (!playlistsEqual(state.playlist, playlist)) {
    const currentSrc = state.currentTrackSrc
    state.playlist = [...playlist]
    const playlistSet = new Set(state.playlist)
    state.playQueue = state.playQueue.filter(
      (track) => track !== state.currentTrackSrc && playlistSet.has(track),
    )

    if (currentSrc && !playlistSet.has(currentSrc)) {
      state.currentTrackSrc = null
      state.audio.removeAttribute("src")
      state.audio.load()
    }

    if (!state.currentTrackSrc) {
      queueNextTrack(state)
    }
  }

  updateButton(state)
  emitMuteChange(state.audio.muted)
  rampVolume(state)
  syncVisibilityPlayback(state)
}

document.addEventListener("nav", syncBackgroundMusicForPage)
syncBackgroundMusicForPage()
