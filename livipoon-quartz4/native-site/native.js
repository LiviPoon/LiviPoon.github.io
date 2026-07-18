const root = document.documentElement
const themePreference = window.matchMedia("(prefers-color-scheme: light)")

const applyTheme = (theme) => {
  if (theme !== "light" && theme !== "dark") return
  root.dataset.theme = theme
  root.setAttribute("saved-theme", theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "light" ? "#eae0ce" : "#181818",
  )
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }))
}

const savedTheme = localStorage.getItem("theme")
applyTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : themePreference.matches ? "light" : "dark")

const menu = document.querySelector("[data-native-menu]")
const menuButton = document.querySelector("[data-menu-open]")
const closeMenu = () => {
  menu?.classList.remove("is-open")
  menu?.setAttribute("aria-hidden", "true")
  menuButton?.setAttribute("aria-expanded", "false")
}

menuButton?.addEventListener("click", () => {
  menu?.classList.add("is-open")
  menu?.setAttribute("aria-hidden", "false")
  menuButton.setAttribute("aria-expanded", "true")
})
document.querySelector("[data-menu-close]")?.addEventListener("click", closeMenu)
document.addEventListener("keydown", (event) => event.key === "Escape" && closeMenu())

document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
  const theme = root.dataset.theme === "light" ? "dark" : "light"
  applyTheme(theme)
  localStorage.setItem("theme", theme)
})

themePreference.addEventListener("change", (event) => {
  if (localStorage.getItem("theme") === null) applyTheme(event.matches ? "light" : "dark")
})

window.addEventListener("storage", (event) => {
  if (event.key === "theme" && (event.newValue === "light" || event.newValue === "dark")) {
    applyTheme(event.newValue)
  }
})

function hydrateMirror() {
  const mirror = document.querySelector("[data-mirror-grid]")
  if (!mirror) return

  fetch("/mirror/mirror-quotes.json")
    .then((response) => response.json())
    .then((data) => {
      const quotes = Array.isArray(data) ? data : (data.quotes ?? [])
      mirror.innerHTML = quotes
        .map(
          (quote) =>
            `<section class="mirror-card"><blockquote>${quote.text ?? quote.quote ?? ""}</blockquote><p>${quote.speaker ?? quote.author ?? "Anonymous"}${quote.role ? ` · ${quote.role}` : ""}</p></section>`,
        )
        .join("")
    })
    .catch(() => {
      // The quotes are embedded in the HTML, so the page remains complete if the request fails.
    })
}

const PLAYBACK_STORAGE_KEY = "backgroundMusicPlaybackState"
const MUSIC_VOLUME = 0.35
const playlist = [
  "/songs/beabadoobee---All-I-Did-Was-Dream-Of-You-(Official-Video)-ft.-The-Marías.mp3",
  "/songs/Beabadoobee---Coffee-(1).mp3",
  "/songs/beabadoobee---Glue-Song-(Official-Music-Video).mp3",
  "/songs/beabadoobee-x-Laufey---A-Night-To-Remember-(Official-Lyric-Video).mp3",
  "/songs/maraline.mp3",
  "/songs/Reverse-Dance.-Medieval-Dance.-Hurdy-Gurdy-Solo.mp3",
  "/songs/Sparks--Coldplay-(cover-by-Sally-Kim).mp3",
]

function initPersistentMusic() {
  const audio = new Audio()
  audio.autoplay = true
  audio.preload = "auto"
  audio.setAttribute("playsinline", "")
  audio.volume = MUSIC_VOLUME
  audio.muted = localStorage.getItem("backgroundMusicMuted") === "true"
  let track = 0

  try {
    const stored = JSON.parse(localStorage.getItem(PLAYBACK_STORAGE_KEY) || "null")
    if (stored && playlist.includes(stored.src)) {
      track = playlist.indexOf(stored.src)
      audio.addEventListener(
        "loadedmetadata",
        () => {
          const elapsed = stored.paused
            ? 0
            : Math.max(0, (Date.now() - (stored.savedAt || Date.now())) / 1000)
          audio.currentTime = Math.max(0, stored.currentTime + elapsed)
        },
        { once: true },
      )
    }
  } catch {
    // Ignore stale playback data and start the playlist normally.
  }

  const isBlockedRoute = () => {
    const route = document.body.dataset.nativeRoute || window.location.pathname
    return route === "/research" || route.startsWith("/research/")
  }
  const play = async () => {
    if (isBlockedRoute()) return
    try {
      await audio.play()
    } catch {
      // Browsers that require interaction get another attempt on the first pointer press.
    }
  }
  const save = (paused = audio.paused) => {
    try {
      localStorage.setItem(
        PLAYBACK_STORAGE_KEY,
        JSON.stringify({
          src: playlist[track],
          currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
          savedAt: Date.now(),
          muted: audio.muted,
          paused,
        }),
      )
    } catch {}
  }

  audio.addEventListener("ended", () => {
    track = (track + 1) % playlist.length
    audio.src = playlist[track]
    void play()
  })
  audio.addEventListener("timeupdate", () => save())
  window.addEventListener("pagehide", () => save())
  window.addEventListener("beforeunload", () => save())
  window.addEventListener("pointerdown", () => void play(), { once: true, passive: true })
  audio.src = playlist[track]
  const syncForRoute = () => {
    if (isBlockedRoute()) {
      audio.pause()
      save(true)
      return
    }
    void play()
  }
  syncForRoute()

  return { audio, save, syncForRoute }
}

const music = initPersistentMusic()
let navigationRequest = 0

async function navigateNative(url, { push = true } = {}) {
  const request = ++navigationRequest
  const response = await fetch(url, { headers: { "X-Native-Navigation": "true" } })
  if (!response.ok) throw new Error(`Navigation failed with ${response.status}`)

  const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html")
  const nextPage = nextDocument.querySelector(".native-page")
  const isNativePage = nextDocument.querySelector('meta[name="native-source"]')
  if (!nextPage || !isNativePage) return false
  if (request !== navigationRequest) return true

  document.querySelector(".native-page")?.replaceWith(nextPage)
  document.title = nextDocument.title
  document.body.dataset.nativeRoute = nextDocument.body.dataset.nativeRoute || url.pathname
  music.syncForRoute()
  closeMenu()
  hydrateMirror()
  if (push) history.pushState({ native: true }, "", url)
  window.scrollTo({ top: 0, behavior: "instant" })
  return true
}

document.addEventListener("click", async (event) => {
  if (
    event.defaultPrevented ||
    !(event instanceof MouseEvent) ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !(event.target instanceof Element)
  ) {
    return
  }

  const link = event.target.closest("a[href]")
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return
  const destination = new URL(link.href, window.location.href)
  if (destination.origin !== window.location.origin || destination.pathname === "/") return

  event.preventDefault()
  if (destination.pathname === "/research" || destination.pathname.startsWith("/research/")) {
    music.audio.pause()
    music.save(true)
  }
  try {
    if (!(await navigateNative(destination))) {
      music.save()
      window.location.assign(destination.href)
    }
  } catch {
    music.save()
    window.location.assign(destination.href)
  }
})

window.addEventListener("popstate", () => {
  const destination = new URL(window.location.href)
  void navigateNative(destination, { push: false })
    .then((handled) => {
      if (!handled) window.location.reload()
    })
    .catch(() => window.location.reload())
})

hydrateMirror()
