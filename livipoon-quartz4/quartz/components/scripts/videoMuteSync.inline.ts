type VideoMuteSyncWindow = Window &
  typeof globalThis & {
    __backgroundMusicState?: {
      audio: HTMLAudioElement
      button: HTMLButtonElement
    }
    YT?: {
      Player: new (
        el: string | HTMLIFrameElement,
        opts: {
          events?: {
            onReady?: (e: { target: YTPlayer }) => void
          }
        },
      ) => YTPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }

interface YTPlayer {
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  getPlayerState: () => number
}

const FORCE_MUTE_EVENT = "background-music-force-mute"
const w = window as VideoMuteSyncWindow

let ytPlayer: YTPlayer | null = null
let ytAPIReady = false
const onAPIReadyCallbacks: Array<() => void> = []

function flushAPIReadyCallbacks() {
  for (const cb of onAPIReadyCallbacks) cb()
  onAPIReadyCallbacks.length = 0
}

function ensureYouTubeAPI() {
  const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]')

  // If the API is already available (e.g. after an SPA navigation), mark ready immediately.
  if (w.YT?.Player) {
    ytAPIReady = true
    flushAPIReadyCallbacks()
    return
  }

  const prev = w.onYouTubeIframeAPIReady
  w.onYouTubeIframeAPIReady = () => {
    prev?.()
    ytAPIReady = true
    flushAPIReadyCallbacks()
  }

  if (existingScript) return

  const tag = document.createElement("script")
  tag.src = "https://www.youtube.com/iframe_api"
  document.head.appendChild(tag)
}

function whenAPIReady(cb: () => void) {
  if (ytAPIReady && w.YT?.Player) {
    cb()
  } else {
    onAPIReadyCallbacks.push(cb)
  }
}

function ensureIframeAPIParams(iframe: HTMLIFrameElement) {
  try {
    const src = iframe.getAttribute("src")
    if (!src) return

    const url = new URL(src, window.location.href)
    let changed = false

    if (url.searchParams.get("enablejsapi") !== "1") {
      url.searchParams.set("enablejsapi", "1")
      changed = true
    }

    const origin = window.location.origin
    if (origin && origin !== "null" && url.searchParams.get("origin") !== origin) {
      url.searchParams.set("origin", origin)
      changed = true
    }

    if (origin && origin !== "null" && url.searchParams.get("widget_referrer") !== origin) {
      url.searchParams.set("widget_referrer", origin)
      changed = true
    }

    if (changed) {
      iframe.src = url.toString()
    }
  } catch {
    // Ignore malformed URLs and fall back to current src behavior.
  }
}

function initPlayerEarly(iframe: HTMLIFrameElement) {
  if (ytPlayer) return

  ensureIframeAPIParams(iframe)
  ensureYouTubeAPI()
  whenAPIReady(() => {
    if (ytPlayer) return
    new w.YT!.Player(iframe, {
      events: {
        onReady: (e) => {
          ytPlayer = e.target
        },
      },
    })
  })
}

let abortController: AbortController | null = null

function setupVideoMuteSync() {
  abortController?.abort()
  abortController = new AbortController()
  const signal = abortController.signal

  const btn = document.querySelector<HTMLButtonElement>(".pilcrow-video-unmute-btn")
  const iframe = document.getElementById("pilcrow-video-iframe") as HTMLIFrameElement | null
  if (!btn || !iframe) return
  const unmuteBtn = btn

  // Initialize player immediately so iframe swap happens before user clicks
  initPlayerEarly(iframe)

  let videoMuted = true
  let bgMusicWasMutedBeforeVideo = false

  const muteX1 = unmuteBtn.querySelector<SVGLineElement>(".pilcrow-video-mute-x1")
  const muteX2 = unmuteBtn.querySelector<SVGLineElement>(".pilcrow-video-mute-x2")
  const wave1 = unmuteBtn.querySelector<SVGPathElement>(".pilcrow-video-sound-wave1")
  const wave2 = unmuteBtn.querySelector<SVGPathElement>(".pilcrow-video-sound-wave2")

  function updateIcon() {
    if (muteX1) muteX1.style.display = videoMuted ? "" : "none"
    if (muteX2) muteX2.style.display = videoMuted ? "" : "none"
    if (wave1) wave1.style.display = videoMuted ? "none" : ""
    if (wave2) wave2.style.display = videoMuted ? "none" : ""
    unmuteBtn.setAttribute("data-video-muted", String(videoMuted))
    unmuteBtn.setAttribute("aria-label", videoMuted ? "Unmute video" : "Mute video")
  }

  function forceMuteBackgroundMusic(muted: boolean) {
    document.dispatchEvent(new CustomEvent(FORCE_MUTE_EVENT, { detail: { muted } }))
  }

  function toggleVideoMute() {
    if (!ytPlayer) return

    videoMuted = !videoMuted
    updateIcon()

    if (videoMuted) {
      ytPlayer.mute()
      if (!bgMusicWasMutedBeforeVideo) {
        forceMuteBackgroundMusic(false)
      }
    } else {
      ytPlayer.unMute()
      const state = w.__backgroundMusicState
      bgMusicWasMutedBeforeVideo = state ? state.audio.muted : true
      if (!bgMusicWasMutedBeforeVideo) {
        forceMuteBackgroundMusic(true)
      }
    }
  }

  unmuteBtn.addEventListener("click", toggleVideoMute, { signal })

  const restartBtn = document.querySelector<HTMLButtonElement>(".pilcrow-video-restart-btn")
  restartBtn?.addEventListener(
    "click",
    () => {
      if (!ytPlayer) return
      ytPlayer.seekTo(0, true)
      ytPlayer.playVideo()
      updatePlayPause(true)
    },
    { signal },
  )

  const playPauseBtn = document.querySelector<HTMLButtonElement>(".pilcrow-video-playpause-btn")
  const pauseIcon = playPauseBtn?.querySelector<SVGElement>(".pilcrow-video-pause-icon")
  const playIcon = playPauseBtn?.querySelector<SVGElement>(".pilcrow-video-play-icon")
  let playing = true

  function updatePlayPause(isPlaying: boolean) {
    playing = isPlaying
    if (pauseIcon) pauseIcon.style.display = playing ? "" : "none"
    if (playIcon) playIcon.style.display = playing ? "none" : ""
    playPauseBtn?.setAttribute("data-playing", String(playing))
    playPauseBtn?.setAttribute("aria-label", playing ? "Pause video" : "Play video")
  }

  playPauseBtn?.addEventListener(
    "click",
    () => {
      if (!ytPlayer) return
      if (playing) {
        ytPlayer.pauseVideo()
      } else {
        ytPlayer.playVideo()
      }
      updatePlayPause(!playing)
    },
    { signal },
  )

  updateIcon()
}

document.addEventListener("nav", () => {
  ytPlayer = null
  setupVideoMuteSync()
})

setupVideoMuteSync()
