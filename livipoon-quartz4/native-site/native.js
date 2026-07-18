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
  if (!mirror) return Promise.resolve()

  return fetch("/mirror/mirror-quotes.json")
    .then((response) => response.json())
    .then((data) => {
      const quotes = Array.isArray(data) ? data : (data.quotes ?? [])
      const featured = new Set(["Chris Danforth", "Rosie Rosebush", "Garrett B.", "Alexa Woodward"])
      const fragment = document.createDocumentFragment()
      quotes.filter((quote) => !featured.has(quote.speaker)).forEach((quote, index) => {
        const article = document.createElement("article")
        article.className = "mirror-memory"
        const rotations = [-3.2, 2.1, -1.4, 3.4, -2.2, 1.2]
        const shifts = ["0px", "34px", "-18px", "52px", "12px", "-30px"]
        const mobileOffsets = ["0%", "9%", "2%", "12%", "5%", "0%"]
        article.style.setProperty("--note-rotate", `${rotations[index % rotations.length]}deg`)
        article.style.setProperty("--note-shift", shifts[index % shifts.length])
        article.style.setProperty("--note-left", mobileOffsets[index % mobileOffsets.length])
        article.style.setProperty("--tape-rotate", `${rotations[(index + 2) % rotations.length]}deg`)
        const blockquote = document.createElement("blockquote")
        blockquote.textContent = `“${quote.text ?? quote.quote ?? ""}”`
        const credit = document.createElement("p")
        credit.textContent = quote.speaker ?? quote.author ?? "Anonymous"
        if (quote.role) {
          const role = document.createElement("span")
          role.textContent = quote.role
          credit.append(role)
        }
        article.append(blockquote, credit)
        fragment.append(article)
      })
      mirror.replaceChildren(fragment)
    })
    .catch(() => {
      // The quotes are embedded in the HTML, so the page remains complete if the request fails.
    })
}

let mirrorMotionCleanup = () => {}
let gsapPromise

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === "true") resolve()
      else existing.addEventListener("load", resolve, { once: true })
      return
    }
    const script = document.createElement("script")
    script.src = src
    script.addEventListener("load", () => {
      script.dataset.loaded = "true"
      resolve()
    }, { once: true })
    script.addEventListener("error", reject, { once: true })
    document.head.append(script)
  })
}

function loadGsap() {
  if (!gsapPromise) {
    gsapPromise = loadScript("https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js")
      .then(() => loadScript("https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"))
  }
  return gsapPromise
}

function splitMirrorWords() {
  const text = document.querySelector("[data-mirror-reveal]")
  if (!text || text.querySelector(".mirror-word")) return
  const words = text.textContent.trim().split(/\s+/)
  text.replaceChildren(...words.flatMap((word, index) => {
    const span = document.createElement("span")
    span.className = "mirror-word"
    span.textContent = word
    return index === words.length - 1 ? [span] : [span, document.createTextNode(" ")]
  }))
}

async function initMirrorExperience() {
  mirrorMotionCleanup()
  mirrorMotionCleanup = () => {}
  if (!document.querySelector("[data-mirror-hero]")) return

  splitMirrorWords()
  const soundButton = document.querySelector("[data-mirror-sound]")
  const soundLabel = soundButton?.querySelector("[data-sound-label]")
  const updateSoundButton = () => {
    if (!soundButton) return
    const active = !music.audio.muted && !music.audio.paused
    soundButton.setAttribute("aria-pressed", String(active))
    if (soundLabel) soundLabel.textContent = active ? "sound on" : "sound off"
  }
  const toggleSound = () => {
    const shouldStart = music.audio.muted || music.audio.paused
    music.audio.muted = !shouldStart
    localStorage.setItem("backgroundMusicMuted", String(music.audio.muted))
    if (shouldStart) void music.audio.play().then(updateSoundButton).catch(updateSoundButton)
    else music.audio.pause()
    updateSoundButton()
  }
  soundButton?.addEventListener("click", toggleSound)
  music.audio.addEventListener("play", updateSoundButton)
  music.audio.addEventListener("pause", updateSoundButton)
  updateSoundButton()

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  if (reduceMotion) {
    document.querySelectorAll(".mirror-word").forEach((word) => { word.style.opacity = "1" })
    mirrorMotionCleanup = () => {
      soundButton?.removeEventListener("click", toggleSound)
      music.audio.removeEventListener("play", updateSoundButton)
      music.audio.removeEventListener("pause", updateSoundButton)
    }
    return
  }

  try {
    await loadGsap()
    if (!document.querySelector("[data-mirror-hero]")) return
    const gsap = window.gsap
    const ScrollTrigger = window.ScrollTrigger
    gsap.registerPlugin(ScrollTrigger)
    const context = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "power3.out" } })
        .from(".scrap-hero h1 span", { opacity: 0, yPercent: 80, rotate: 4, stagger: .14, duration: 1.1 })
        .from(".art-placeholder--hero", { opacity: 0, scale: .78, rotate: -13, duration: 1.2 }, "-=.8")
        .from(".scrap-hero__note, .scrap-hero__caption, .scrap-enter", { opacity: 0, y: 18, stagger: .12, duration: .7 }, "-=.55")

      gsap.to(".art-placeholder--hero", {
        yPercent: 34,
        rotate: 2,
        scrollTrigger: { trigger: ".scrap-hero", start: "top top", end: "bottom top", scrub: 1 },
      })
      gsap.to(".scrap-star--one", {
        rotate: 160,
        y: 100,
        scrollTrigger: { trigger: ".scrap-hero", start: "top top", end: "bottom top", scrub: 1 },
      })

      gsap.from(".scrap-opening__art, .scrap-note", {
        scale: .76,
        opacity: .12,
        y: 100,
        stagger: .15,
        scrollTrigger: { trigger: ".scrap-opening", start: "top 80%", end: "center 48%", scrub: 1 },
      })
      gsap.from(".scrap-art", {
        scale: .72,
        opacity: .12,
        y: 130,
        rotate: 0,
        stagger: .1,
        scrollTrigger: { trigger: ".scrap-art-cluster", start: "top 90%", end: "center 50%", scrub: 1 },
      })

      document.querySelectorAll(".mirror-memory").forEach((card) => {
        gsap.fromTo(card, { scale: .8, opacity: .15, y: 80 }, {
          scale: 1,
          opacity: 1,
          y: 0,
          scrollTrigger: { trigger: card, start: "top 96%", end: "center 68%", scrub: .8 },
        })
      })

      gsap.to(".mirror-word", {
        opacity: 1,
        stagger: .08,
        scrollTrigger: { trigger: ".scrap-interlude", start: "top 70%", end: "bottom 68%", scrub: true },
      })
      gsap.to(".scrap-interlude__drawing", {
        rotate: 105,
        scale: 1.18,
        scrollTrigger: { trigger: ".scrap-interlude", start: "top bottom", end: "bottom top", scrub: 1 },
      })
      gsap.from(".scrap-ending__photo", {
        scale: .76,
        rotate: 18,
        y: 160,
        scrollTrigger: { trigger: ".scrap-ending", start: "top 85%", end: "center 45%", scrub: 1 },
      })
    })
    mirrorMotionCleanup = () => {
      context.revert()
      soundButton?.removeEventListener("click", toggleSound)
      music.audio.removeEventListener("play", updateSoundButton)
      music.audio.removeEventListener("pause", updateSoundButton)
    }
  } catch {
    document.querySelectorAll(".mirror-word").forEach((word) => { word.style.opacity = "1" })
  }
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
  void hydrateMirror().then(initMirrorExperience)
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

void hydrateMirror().then(initMirrorExperience)
