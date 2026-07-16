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
  hasPersistenceListeners: boolean
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
const PLAYBACK_STORAGE_KEY = "backgroundMusicPlaybackState"
const MUTE_EVENT_NAME = "background-mute-changed"
const DUCK_EVENT_NAME = "background-music-duck-changed"
const FORCE_MUTE_EVENT_NAME = "background-music-force-mute"
const BASE_VOLUME = 0.35
const DUCKED_VOLUME = 0.15
const VOLUME_RAMP_DURATION_MS = 260
const REVERB_DRY_MIX = 1
const REVERB_WET_MIX = 0
const REVERB_DURATION_SECONDS = 4.6
const REVERB_DECAY_POWER = 2.7
const REVERB_EARLY_REFLECTION_SECONDS = 0.08
const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/"
const LICENSE_LABEL = "CC BY-NC-ND 4.0"
const LICENSE_CREDIT_PREFIX = "music from"
const LICENSE_CREDITS = [
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

type StoredPlaybackState = {
  src: string
  currentTime: number
  savedAt: number
  muted: boolean
  paused: boolean
}

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
  const volOn = state.button.querySelector<SVGElement>(".vol-on")
  const volOff = state.button.querySelector<SVGElement>(".vol-off")
  if (volOn) volOn.style.display = state.audio.muted ? "none" : ""
  if (volOff) volOff.style.display = state.audio.muted ? "" : "none"
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

function savePlaybackState(state: BackgroundMusicState) {
  if (!state.currentTrackSrc) return

  try {
    const playbackState: StoredPlaybackState = {
      src: state.currentTrackSrc,
      currentTime: Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0,
      savedAt: Date.now(),
      muted: localStorage.getItem(MUTED_STORAGE_KEY) === "true",
      paused: false,
    }
    localStorage.setItem(PLAYBACK_STORAGE_KEY, JSON.stringify(playbackState))
  } catch {}
}

function readPlaybackState(): StoredPlaybackState | null {
  try {
    const raw = localStorage.getItem(PLAYBACK_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredPlaybackState>
    if (typeof parsed.src !== "string" || parsed.src.length === 0) return null
    if (typeof parsed.currentTime !== "number" || !Number.isFinite(parsed.currentTime)) return null

    return {
      src: parsed.src,
      currentTime: Math.max(0, parsed.currentTime),
      savedAt:
        typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : Date.now(),
      muted: parsed.muted === true,
      paused: parsed.paused === true,
    }
  } catch {
    return null
  }
}

function restorePlaybackState(state: BackgroundMusicState): boolean {
  const stored = readPlaybackState()
  if (!stored || !state.playlist.includes(stored.src)) return false

  loadTrack(state, stored.src)
  state.audio.muted = stored.muted

  const restoreTime = () => {
    const elapsedSeconds = stored.paused ? 0 : Math.max(0, (Date.now() - stored.savedAt) / 1000)
    const targetTime = stored.currentTime + elapsedSeconds
    if (Number.isFinite(state.audio.duration) && state.audio.duration > 0) {
      state.audio.currentTime = Math.min(
        Math.max(0, targetTime),
        Math.max(0, state.audio.duration - 0.2),
      )
      return
    }
    state.audio.currentTime = Math.max(0, targetTime)
  }

  if (state.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    restoreTime()
  } else {
    state.audio.addEventListener("loadedmetadata", restoreTime, { once: true })
  }

  return true
}

function refillPlayQueue(state: BackgroundMusicState) {
  if (state.playlist.length === 0) {
    state.playQueue = []
    return
  }

  const shuffled = shuffle(state.playlist)
  if (shuffled.length > 1 && state.lastPlayedTrackSrc && shuffled[0] === state.lastPlayedTrackSrc) {
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

  const preferredMuted = state.audio.muted

  try {
    await state.audio.play()
    void tryEnableConcertHallReverb(state)
    return
  } catch {
    // Some browsers block autoplay when audio is audible on initial load.
    // Retry with a temporary muted bootstrap, then restore preferred mute state.
    if (!preferredMuted) {
      state.audio.muted = true
      try {
        await state.audio.play()
        // Set volume to 0 before unmuting so there's no pop when audio becomes audible.
        state.audio.volume = 0
        state.audio.muted = preferredMuted
        rampVolume(state)
        void tryEnableConcertHallReverb(state)
        return
      } catch {
        state.audio.muted = preferredMuted
      }
    }

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

function addPersistenceListeners(state: BackgroundMusicState) {
  if (state.hasPersistenceListeners) return
  state.hasPersistenceListeners = true

  const save = () => savePlaybackState(state)
  window.addEventListener("pagehide", save)
  window.addEventListener("beforeunload", save)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save()
  })
  state.audio.addEventListener("pause", save)
  state.audio.addEventListener("timeupdate", () => {
    if (!state.audio.paused) savePlaybackState(state)
  })
}

function createState(playlist: string[]): BackgroundMusicState {
  const audio = new Audio()
  audio.autoplay = true
  audio.preload = "auto"
  audio.setAttribute("playsinline", "")
  audio.volume = 0

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
  button.innerHTML =
    `<svg class="vol-on" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M19.2478 4.75181C21.1027 6.6067 22.25 9.1692 22.25 11.9997C22.25 14.8301 21.1027 17.3926 19.2478 19.2475M15.8891 8.11119C16.8844 9.10649 17.5 10.4815 17.5 12.0003C17.5 13.5191 16.8844 14.8941 15.8891 15.8894M3.75 7.74986H5.35491C5.77433 7.74986 6.18314 7.618 6.52352 7.37293L11.4578 3.82021C11.7886 3.58208 12.25 3.81843 12.25 4.22598V19.7738C12.25 20.1813 11.7886 20.4177 11.4578 20.1795L6.52352 16.6268C6.18314 16.3817 5.77433 16.2499 5.35491 16.2499H3.75C2.64543 16.2499 1.75 15.3545 1.75 14.2499V9.74987C1.75 8.6453 2.64543 7.74986 3.75 7.74986Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `<svg class="vol-off" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style="display:none"><path fill-rule="evenodd" clip-rule="evenodd" d="M17 5.93934V4.22585C17 3.20697 15.8465 2.6161 15.0196 3.21143L10.0853 6.76415C9.87255 6.91732 9.61705 6.99973 9.35491 6.99973H7.75C6.23122 6.99973 5 8.23095 5 9.74973V14.2497C5 15.25 5.53405 16.1255 6.33257 16.6068L3.21967 19.7197C2.92678 20.0126 2.92678 20.4874 3.21967 20.7803C3.51256 21.0732 3.98744 21.0732 4.28033 20.7803L20.7803 4.28033C21.0732 3.98744 21.0732 3.51256 20.7803 3.21967C20.4874 2.92678 20.0126 2.92678 19.7197 3.21967L17 5.93934ZM7.47089 15.4685C6.91489 15.3416 6.5 14.8441 6.5 14.2497V9.74973C6.5 9.05938 7.05964 8.49973 7.75 8.49973H9.35491C9.93161 8.49973 10.4937 8.31842 10.9617 7.98145L15.5 4.71391V7.43934L7.47089 15.4685Z" fill="currentColor"/><path d="M15.5003 19.2857L11.0785 16.102L10.001 17.1795C10.0298 17.197 10.0581 17.2156 10.0856 17.2354L15.0199 20.7881C15.8468 21.3835 17.0003 20.7926 17.0003 19.7737V10.1802L15.5003 11.6802V19.2857Z" fill="currentColor"/></svg>`

  const licenseLink = document.createElement("a")
  licenseLink.className = "background-music-license"
  licenseLink.href = LICENSE_URL
  licenseLink.target = "_blank"
  licenseLink.rel = "noopener noreferrer"
  licenseLink.textContent = LICENSE_LABEL
  licenseLink.setAttribute("aria-label", "Creative Commons BY-NC-ND 4.0 license")

  licenseCluster.append(licenseLink)
  controls.append(button)

  // Dark mode toggle button
  const themeBtn = document.createElement("button")
  themeBtn.type = "button"
  themeBtn.className = "background-music-theme"
  themeBtn.setAttribute("aria-label", "Toggle dark mode")
  themeBtn.addEventListener("click", () => {
    const newTheme =
      document.documentElement.getAttribute("saved-theme") === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("saved-theme", newTheme)
    localStorage.setItem("theme", newTheme)
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: newTheme } }))
  })
  themeBtn.innerHTML =
    `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M11.9982 3.29083V1.76758M5.83985 18.1586L4.76275 19.2357M11.9982 22.2327V20.7094M19.2334 4.76468L18.1562 5.84179M20.707 12.0001H22.2303M18.1562 18.1586L19.2334 19.2357M1.76562 12.0001H3.28888M4.76267 4.76462L5.83977 5.84173M15.7104 8.28781C17.7606 10.3381 17.7606 13.6622 15.7104 15.7124C13.6601 17.7627 10.336 17.7627 8.28574 15.7124C6.23548 13.6622 6.23548 10.3381 8.28574 8.28781C10.336 6.23756 13.6601 6.23756 15.7104 8.28781Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M21.2481 11.8112C20.1889 12.56 18.8958 13 17.5 13C13.9101 13 11 10.0899 11 6.5C11 5.10416 11.44 3.81108 12.1888 2.75189C12.126 2.75063 12.0631 2.75 12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 11.9369 21.2494 11.874 21.2481 11.8112Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  controls.append(themeBtn)

  // Themed background video swap
  function applyVideoTheme() {
    const video = document.querySelector<HTMLVideoElement>(".pilcrow-bg-video--themed")
    if (!video) return
    const isDark = document.documentElement.getAttribute("saved-theme") === "dark"
    const src = isDark ? video.dataset.darkSrc : video.dataset.lightSrc
    if (!src || video.getAttribute("src") === src) return
    video.setAttribute("src", src)
    video.load()
    void video.play()
  }

  document.addEventListener("themechange", applyVideoTheme)
  applyVideoTheme()

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
    hasPersistenceListeners: false,
  }

  const onDuckChanged = (event: Event) => {
    const detail = (event as CustomEvent<{ ducked?: boolean; volume?: number }>).detail
    const ducked = detail?.ducked === true
    const requestedVolume =
      typeof detail?.volume === "number" && Number.isFinite(detail.volume)
        ? detail.volume
        : DUCKED_VOLUME
    backgroundWindow.__backgroundMusicDucked = ducked
    state.duckedVolume = ducked ? Math.min(1, Math.max(0, requestedVolume)) : DUCKED_VOLUME
    if (ducked === state.isDucked) {
      rampVolume(state)
      return
    }
    state.isDucked = ducked
    rampVolume(state)
  }
  document.addEventListener(DUCK_EVENT_NAME, onDuckChanged as EventListener)

  const onForceMute = (event: Event) => {
    const muted = (event as CustomEvent<{ muted?: boolean }>).detail?.muted === true
    if (muted === state.audio.muted) return
    state.audio.muted = muted
    localStorage.setItem(MUTED_STORAGE_KEY, String(muted))
    updateButton(state)
    emitMuteChange(muted)
    if (!muted) {
      void attemptPlay(state)
    }
  }
  document.addEventListener(FORCE_MUTE_EVENT_NAME, onForceMute as EventListener)

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
  state.audio.volume = 0
  updateButton(state)
  emitMuteChange(state.audio.muted)
  addVisibilityListeners(state)
  addPersistenceListeners(state)

  return state
}

function isMusicPage(): boolean {
  // Music is a site-wide player. Keeping it active on every route lets Quartz's SPA
  // navigation retain the same Audio element instead of pausing between screens.
  return true
}

function syncBackgroundMusicForPage() {
  const playlist = parsePlaylist()
  if (playlist.length === 0) return

  let state = backgroundWindow.__backgroundMusicState
  if (!state) {
    state = createState(playlist)
    backgroundWindow.__backgroundMusicState = state
    const restored = restorePlaybackState(state)
    if (!restored) {
      queueNextTrack(state)
    }
    if (isMusicPage()) {
      rampVolume(state)
      void attemptPlay(state)
    } else {
      state.audio.muted = true
      updateButton(state)
    }
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

  if (!isMusicPage()) {
    state.audio.muted = true
    updateButton(state)
    emitMuteChange(true)
    state.audio.pause()
    return
  }

  // Restore user's stored mute preference on landing page
  const storedMuted = localStorage.getItem(MUTED_STORAGE_KEY) === "true"
  state.audio.muted = storedMuted
  updateButton(state)
  emitMuteChange(state.audio.muted)
  rampVolume(state)
  syncVisibilityPlayback(state)
}

// The map homepage is emitted as a standalone document rather than a Quartz SPA route.
// Fade across that one unavoidable document boundary while preserving the exact playback state.
document.addEventListener(
  "click",
  (event) => {
    if (
      event.defaultPrevented ||
      !(event instanceof MouseEvent) ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      !(event.target instanceof Element)
    ) {
      return
    }

    const link = event.target.closest<HTMLAnchorElement>("a[href]")
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return

    const destination = new URL(link.href, window.location.href)
    if (destination.origin !== window.location.origin || destination.pathname !== "/") return

    const state = backgroundWindow.__backgroundMusicState
    if (!state) return

    event.preventDefault()
    event.stopImmediatePropagation()
    savePlaybackState(state)
    state.baseVolume = 0
    rampVolume(state)
    window.setTimeout(() => window.location.assign(destination.href), VOLUME_RAMP_DURATION_MS)
  },
  { capture: true },
)

document.addEventListener("nav", syncBackgroundMusicForPage)
window.addEventListener("load", syncBackgroundMusicForPage)
window.addEventListener("pageshow", syncBackgroundMusicForPage)
syncBackgroundMusicForPage()
