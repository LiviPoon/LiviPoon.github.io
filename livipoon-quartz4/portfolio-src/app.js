/* ===========================================================
   app.js — cursor, reveals, theme
=========================================================== */
;(function () {
  "use strict"

  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  /* ---------- THEME ---------- */
  function resolveTheme() {
    const stored = localStorage.getItem("theme")
    if (stored === "dark" || stored === "light") return stored
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  function applyTheme(t) {
    const theme = t ?? resolveTheme()
    document.documentElement.dataset.theme = theme
    document.documentElement.setAttribute("saved-theme", theme)
  }
  applyTheme()
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem("theme")) applyTheme()
  })

  // expose toggle for top-nav theme button
  window.__livi = window.__livi || {}
  window.__livi.toggleTheme = function () {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
    localStorage.setItem("theme", next)
    applyTheme(next)
  }

  /* ---------- MIRROR QUOTES ---------- */
  function shuffleMirrorQuotes(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }

  function normalizeQuoteText(text) {
    return String(text || "")
      .trim()
      .replace(/^[“”"']+|[“”"']+$/g, "")
  }

  function renderMirrorQuotes() {
    const grid = $("[data-mirror-quote-grid]")
    const dataRoot = $("#quartz-body")
    if (!grid || !dataRoot || !dataRoot.dataset.mirrorBoldQuotes) return

    let quotes = []
    try {
      quotes = JSON.parse(dataRoot.dataset.mirrorBoldQuotes)
    } catch (e) {
      return
    }
    if (!Array.isArray(quotes) || quotes.length < 1) return

    const selected = shuffleMirrorQuotes([...quotes]).slice(0, 6)
    grid.replaceChildren(
      ...selected.map((quote) => {
        const text = normalizeQuoteText(quote.text)
        const article = document.createElement("article")
        article.className = "mirror-quote-card"
        if (text.length > 220) article.classList.add("is-long")

        const p = document.createElement("p")
        p.textContent = `"${text}"`

        const span = document.createElement("span")
        span.textContent = quote.role || quote.speaker || "Mirror"

        article.append(p, span)
        return article
      }),
    )
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderMirrorQuotes, { once: true })
  } else {
    setTimeout(renderMirrorQuotes, 0)
  }

  function revealHero() {
    const hero = $(".hero")
    if (hero) hero.classList.add("in-view")
  }
  requestAnimationFrame(revealHero)

  /* =========================================================
     CUSTOM CURSOR
  ========================================================= */
  const cursorEl = $("#cursor")
  let cx = innerWidth / 2,
    cy = innerHeight / 2,
    lx = cx,
    ly = cy
  let cursorVisible = true,
    idleT = null,
    cursorRaf = 0

  function cursorLoop() {
    lx += (cx - lx) * 0.18
    ly += (cy - ly) * 0.18
    cursorEl.style.transform = `translate3d(${lx}px, ${ly}px, 0)`

    if (Math.abs(cx - lx) > 0.1 || Math.abs(cy - ly) > 0.1) {
      cursorRaf = requestAnimationFrame(cursorLoop)
    } else {
      cursorRaf = 0
    }
  }

  document.addEventListener("pointermove", (e) => {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return
    cx = e.clientX
    cy = e.clientY
    if (!cursorVisible) {
      cursorVisible = true
      cursorEl.classList.remove("is-hidden")
    }
    clearTimeout(idleT)
    idleT = setTimeout(() => {
      cursorVisible = false
      cursorEl.classList.add("is-hidden")
    }, 3500)
    if (!cursorRaf) cursorLoop()
  })

  // hover state for interactive elements
  function bindHoverCursor() {
    $$("a, button, .nav-brand .dot, [data-view]").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        if (el.dataset.view) {
          cursorEl.classList.add("is-view")
          cursorEl.textContent = el.dataset.view
        } else {
          cursorEl.classList.add("is-hover")
        }
      })
      el.addEventListener("mouseleave", () => {
        cursorEl.classList.remove("is-hover", "is-view")
        cursorEl.textContent = ""
      })
    })
  }

  /* =========================================================
     NAV — hide on scroll-down, blur on scroll-up
  ========================================================= */
  const nav = $(".nav")
  let lastY = 0
  let navRaf = 0
  window.addEventListener(
    "scroll",
    () => {
      if (navRaf) return
      navRaf = requestAnimationFrame(() => {
        navRaf = 0
        const y = window.scrollY
        if (y > 60 && y > lastY + 3) nav.classList.add("is-hidden")
        else if (y < lastY - 3) nav.classList.remove("is-hidden")
        nav.classList.toggle("is-blurred", y > 40)
        lastY = y
      })
    },
    { passive: true },
  )

  /* =========================================================
     INTERSECTION REVEALS (with staggered children)
  ========================================================= */
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view")
          // stagger reveal-text and fade children
          const items = entry.target.querySelectorAll(".reveal-text, .fade")
          items.forEach((el, i) => {
            el.style.transitionDelay = i * 80 + "ms"
          })
        }
      })
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
  )

  $$("[data-reveal]").forEach((el) => io.observe(el))

  /* =========================================================
     PARALLAX (background ambient + images)
  ========================================================= */
  const parallaxEls = $$("[data-parallax]")
  let parallaxItems = []
  let parallaxRaf = 0

  function cacheParallaxItems() {
    parallaxItems = parallaxEls.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        el,
        speed: parseFloat(el.dataset.parallax) || 0.4,
        top: rect.top + window.scrollY,
        height: rect.height,
      }
    })
  }

  function updateParallax() {
    parallaxRaf = 0
    const sy = window.scrollY
    const vh = window.innerHeight

    for (const item of parallaxItems) {
      const itemBottom = item.top + item.height
      if (itemBottom < sy - vh * 0.35 || item.top > sy + vh * 1.35) continue

      const center = item.top - sy + item.height / 2 - vh / 2
      item.el.style.transform = `translate3d(0, ${(-center * item.speed * 0.18).toFixed(2)}px, 0)`
    }
  }

  function requestParallaxUpdate() {
    if (parallaxRaf) return
    parallaxRaf = requestAnimationFrame(updateParallax)
  }

  if (!prefersReduced && parallaxEls.length) {
    cacheParallaxItems()
    requestParallaxUpdate()
    window.addEventListener("scroll", requestParallaxUpdate, { passive: true })
    window.addEventListener(
      "resize",
      () => {
        cacheParallaxItems()
        requestParallaxUpdate()
      },
      { passive: true },
    )
  }

  /* =========================================================
     VIDEO CONTROLS + BACKGROUND MUSIC DUCKING
  ========================================================= */
  const videoCards = $$(".portfolio-video-card")
  const youtubePlayers = new Map()
  let ytReady = false
  const ytReadyCallbacks = []

  function emitMusicDuck(ducked) {
    document.dispatchEvent(
      new CustomEvent("background-music-duck-changed", {
        detail: { ducked, volume: ducked ? 0 : undefined },
      }),
    )
  }

  function anyVideoAudible() {
    return videoCards.some((card) => card.dataset.videoMuted === "false")
  }

  function syncMusicDuckToVideos() {
    const ducked = anyVideoAudible()
    emitMusicDuck(ducked)
    bgMusic?.duck(ducked)
  }

  function ensureYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      ytReady = true
      while (ytReadyCallbacks.length) ytReadyCallbacks.shift()()
      return
    }

    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = function () {
      if (typeof previousReady === "function") previousReady()
      ytReady = true
      while (ytReadyCallbacks.length) ytReadyCallbacks.shift()()
    }

    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return
    const tag = document.createElement("script")
    tag.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(tag)
  }

  function whenYouTubeReady(callback) {
    if (ytReady && window.YT && window.YT.Player) callback()
    else ytReadyCallbacks.push(callback)
  }

  function ensureIframeAPIParams(iframe) {
    try {
      const url = new URL(iframe.src, window.location.href)
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
      if (changed) iframe.src = url.toString()
    } catch (e) {}
  }

  function setVideoIcon(card, muted) {
    card.dataset.videoMuted = String(muted)
    const soundBtn = $(".portfolio-video-sound", card)
    const muteX1 = $(".portfolio-video-mute-x1", card)
    const muteX2 = $(".portfolio-video-mute-x2", card)
    const wave1 = $(".portfolio-video-wave1", card)
    const wave2 = $(".portfolio-video-wave2", card)

    if (soundBtn) {
      soundBtn.dataset.videoMuted = String(muted)
      soundBtn.setAttribute("aria-label", muted ? "Unmute video" : "Mute video")
      soundBtn.dataset.view = muted ? "sound" : "mute"
    }
    if (muteX1) muteX1.style.display = muted ? "" : "none"
    if (muteX2) muteX2.style.display = muted ? "" : "none"
    if (wave1) wave1.style.display = muted ? "none" : ""
    if (wave2) wave2.style.display = muted ? "none" : ""
  }

  function setPlayPauseIcon(card, playing) {
    const btn = $(".portfolio-video-playpause", card)
    const pauseIcon = $(".portfolio-video-pause-icon", card)
    const playIcon = $(".portfolio-video-play-icon", card)
    if (btn) {
      btn.dataset.playing = String(playing)
      btn.dataset.view = playing ? "pause" : "play"
      btn.setAttribute("aria-label", playing ? "Pause video" : "Play video")
    }
    if (pauseIcon) pauseIcon.style.display = playing ? "" : "none"
    if (playIcon) playIcon.style.display = playing ? "none" : ""
  }

  function muteVideoCard(card) {
    const player = youtubePlayers.get(card)
    if (player && typeof player.mute === "function") player.mute()
    setVideoIcon(card, true)
  }

  function setupPortfolioVideos() {
    if (!videoCards.length) return

    ensureYouTubeAPI()
    videoCards.forEach((card) => {
      const iframe = $("iframe", card)
      if (!iframe) return
      ensureIframeAPIParams(iframe)
      setVideoIcon(card, true)
      setPlayPauseIcon(card, true)

      whenYouTubeReady(() => {
        if (youtubePlayers.has(card)) return
        const player = new window.YT.Player(iframe, {
          events: {
            onReady: (event) => {
              youtubePlayers.set(card, event.target)
              event.target.mute()
              event.target.playVideo()
            },
          },
        })
        youtubePlayers.set(card, player)
      })

      $(".portfolio-video-sound", card)?.addEventListener("click", () => {
        const player = youtubePlayers.get(card)
        const muted = card.dataset.videoMuted !== "false"

        if (muted) {
          videoCards.forEach((otherCard) => {
            if (otherCard !== card) muteVideoCard(otherCard)
          })
          if (player && typeof player.unMute === "function") {
            player.unMute()
            player.playVideo()
          }
          setVideoIcon(card, false)
          setPlayPauseIcon(card, true)
        } else {
          muteVideoCard(card)
        }

        syncMusicDuckToVideos()
      })

      $(".portfolio-video-restart", card)?.addEventListener("click", () => {
        const player = youtubePlayers.get(card)
        if (!player) return
        player.seekTo(0, true)
        player.playVideo()
        setPlayPauseIcon(card, true)
      })

      $(".portfolio-video-playpause", card)?.addEventListener("click", () => {
        const player = youtubePlayers.get(card)
        if (!player) return
        const playing = $(".portfolio-video-playpause", card)?.dataset.playing !== "false"
        if (playing) player.pauseVideo()
        else player.playVideo()
        setPlayPauseIcon(card, !playing)
      })
    })
  }

  setupPortfolioVideos()
  window.addEventListener("pagehide", () => emitMusicDuck(false))

  /* =========================================================
     MENU
  ========================================================= */
  const menuPanel = $("#menu-panel")
  const btnMenu = $("#btn-menu")

  function openMenu() {
    menuPanel.classList.add("is-on")
    menuPanel.removeAttribute("aria-hidden")
    btnMenu.textContent = "Close"
    btnMenu.setAttribute("aria-label", "Close menu")
  }

  function closeMenu() {
    menuPanel.classList.remove("is-on")
    menuPanel.setAttribute("aria-hidden", "true")
    btnMenu.textContent = "Menu"
    btnMenu.setAttribute("aria-label", "Open menu")
  }

  btnMenu.addEventListener("click", () => {
    menuPanel.classList.contains("is-on") ? closeMenu() : openMenu()
  })

  $$("[data-menu-close]").forEach((el) => el.addEventListener("click", closeMenu))

  /* ---- THEME BUTTON ---- */
  const btnTheme = $("#btn-theme")
  btnTheme?.addEventListener("click", () => window.__livi.toggleTheme())

  /* ---- BACKGROUND MUSIC ---- */
  const MUSIC_MUTED_KEY = "backgroundMusicMuted"
  const MUSIC_STATE_KEY = "backgroundMusicPlaybackState"
  let bgMusic = null

  function initBgMusic() {
    let playlist = []
    try {
      const host = document.getElementById("quartz-body")
      const raw = host?.dataset?.backgroundSongs
      if (raw) playlist = JSON.parse(raw)
    } catch (e) {}
    if (!playlist.length) return null

    function shuffle(arr) {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }

    const audio = new Audio()
    audio.preload = "auto"
    audio.muted = localStorage.getItem(MUSIC_MUTED_KEY) === "true"
    let queue = shuffle(playlist)
    let lastSrc = null

    // Web Audio reverb via synthetic impulse response
    let audioCtx = null
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioCtx.createMediaElementSource(audio)
      const convolver = audioCtx.createConvolver()
      const dur = 3.0, decay = 2.4
      const len = Math.floor(audioCtx.sampleRate * dur)
      const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate)
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch)
        for (let i = 0; i < len; i++)
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
      convolver.buffer = buf
      const dry = audioCtx.createGain()
      const wet = audioCtx.createGain()
      dry.gain.value = 0.70
      wet.gain.value = 0.32
      source.connect(dry); dry.connect(audioCtx.destination)
      source.connect(convolver); convolver.connect(wet); wet.connect(audioCtx.destination)
    } catch (e) {}
    window.addEventListener("pointerdown", () => audioCtx?.resume(), { once: true })

    function nextTrack() {
      if (!queue.length) queue = shuffle(playlist.filter((s) => s !== lastSrc))
      const src = queue.shift()
      if (!src) return
      lastSrc = src
      audio.src = src
      audio.load()
    }

    async function play() {
      if (!audio.src) nextTrack()
      if (audioCtx?.state === "suspended") audioCtx.resume()
      try {
        await audio.play()
      } catch {
        if (!audio.muted) {
          audio.muted = true
          try {
            await audio.play()
            audio.volume = 0
            audio.muted = false
            const ramp = () => {
              audio.volume < 0.98 ? (audio.volume = Math.min(1, audio.volume + 0.04), setTimeout(ramp, 40)) : (audio.volume = 1)
            }
            ramp()
          } catch {
            window.addEventListener("pointerdown", () => void play(), { once: true })
          }
        }
      }
    }

    audio.addEventListener("ended", () => { nextTrack(); void play() })
    document.addEventListener("visibilitychange", () => {
      document.visibilityState === "hidden" ? audio.pause() : void play()
    })
    function saveState() {
      if (!lastSrc) return
      try {
        localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify({
          src: lastSrc, currentTime: audio.currentTime,
          savedAt: Date.now(), muted: audio.muted, paused: false
        }))
      } catch {}
    }

    audio.addEventListener("timeupdate", saveState)
    window.addEventListener("pagehide", saveState)
    window.addEventListener("pageshow", (e) => { if (e.persisted) void play() })

    // Restore saved position
    try {
      const stored = JSON.parse(localStorage.getItem(MUSIC_STATE_KEY) || "null")
      if (stored?.src && playlist.includes(stored.src)) {
        audio.src = stored.src
        lastSrc = stored.src
        audio.load()
        audio.addEventListener("loadedmetadata", () => {
          const elapsed = Math.max(0, (Date.now() - stored.savedAt) / 1000)
          audio.currentTime = Math.min(stored.currentTime + elapsed, audio.duration - 0.2)
        }, { once: true })
      } else {
        nextTrack()
      }
    } catch { nextTrack() }

    if (document.visibilityState !== "hidden") void play()

    let duckRaf = null
    function rampToVolume(toVol) {
      if (duckRaf) { cancelAnimationFrame(duckRaf); duckRaf = null }
      const from = audio.volume
      const start = performance.now()
      const dur = 300
      ;(function step(now) {
        const t = Math.min(1, (now - start) / dur)
        const eased = 1 - Math.pow(1 - t, 3)
        audio.volume = from + (toVol - from) * eased
        if (t < 1) duckRaf = requestAnimationFrame(step)
        else { duckRaf = null; audio.volume = toVol }
      })(start)
    }

    return {
      setMuted(muted) {
        audio.muted = muted
        localStorage.setItem(MUSIC_MUTED_KEY, String(muted))
        if (!muted) void play()
      },
      isMuted() { return audio.muted },
      duck(ducked) { rampToVolume(ducked ? 0.08 : 1) },
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { bgMusic = initBgMusic() }, { once: true })
  } else {
    bgMusic = initBgMusic()
  }

  /* ---- MUTE BUTTON ---- */
  const btnMute = $("#btn-mute")
  const muteXPath = $("#mute-x")
  const muteLabel = $("#mute-label")
  let globalMuted = localStorage.getItem(MUSIC_MUTED_KEY) === "true"

  function syncMuteBtn(muted) {
    if (muteXPath) muteXPath.style.display = muted ? "" : "none"
    if (muteLabel) muteLabel.textContent = muted ? "mute" : "unmute"
  }
  syncMuteBtn(globalMuted)

  function applyGlobalMute(muted) {
    globalMuted = muted
    videoCards.forEach((card) => {
      const player = youtubePlayers.get(card)
      if (player && typeof player.mute === "function") {
        if (muted) { player.mute() } else { player.unMute(); player.playVideo() }
        setVideoIcon(card, muted)
      }
    })
    if (bgMusic) bgMusic.setMuted(muted)
    else localStorage.setItem(MUSIC_MUTED_KEY, String(muted))
    syncMuteBtn(muted)
  }

  btnMute?.addEventListener("click", () => applyGlobalMute(!globalMuted))

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuPanel.classList.contains("is-on")) closeMenu()
  })

  bindHoverCursor()

  /* =========================================================
     ROLL COUNTERS
  ========================================================= */
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }

  function animateCounter(el) {
    let endValue
    if (el.dataset.baseDate && el.dataset.dailyRate) {
      const baseValue = parseFloat(el.dataset.baseValue || "0")
      const baseDate = new Date(el.dataset.baseDate + "T00:00:00Z")
      const dailyRate = parseFloat(el.dataset.dailyRate)
      const daysSince = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / 86400000))
      endValue = Math.round(baseValue + daysSince * dailyRate)
    } else {
      endValue = parseInt(el.dataset.end || "100", 10)
      if (isNaN(endValue) || endValue <= 0) return
    }

    const intEl = el.querySelector(".roll-counter-int")
    if (!intEl) return

    const digits = Math.max(1, Math.floor(Math.log10(endValue)) + 1)
    const DURATION = digits * 1000
    let startTime = null

    function frame(now) {
      if (startTime === null) startTime = now
      const elapsed = now - startTime
      const progress = Math.min(elapsed / DURATION, 1)
      const current = Math.round(easeOutCubic(progress) * endValue)
      intEl.textContent = current.toLocaleString()
      if (progress < 1) {
        requestAnimationFrame(frame)
      } else {
        intEl.textContent = endValue.toLocaleString()
      }
    }

    requestAnimationFrame(frame)
  }

  function initRollCounters() {
    const counters = $$("[data-roll-counter]")
    if (!counters.length) return
    const seen = new WeakSet()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target
            if (!seen.has(el)) {
              seen.add(el)
              observer.unobserve(el)
              animateCounter(el)
            }
          }
        })
      },
      { threshold: 0.35 },
    )
    counters.forEach((el) => observer.observe(el))
  }

  initRollCounters()

  /* =========================================================
     HABIT TRACKER
  ========================================================= */
  function habitPolylineLength(pts) {
    if (pts.length < 2) return 1
    let total = 0
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    }
    return Math.max(1, total)
  }

  function renderHabitChart(container, timeline) {
    if (!timeline.length) return
    const width = Math.max(container.clientWidth, 42)
    const height = Math.max(container.clientHeight, 120)
    const pad = { top: 10, right: 4, bottom: 10, left: 4 }
    const depthW = Math.max(1, width - pad.right - pad.left)
    const depthH = Math.max(1, height - pad.top - pad.bottom)
    const times = timeline.map((p) => Date.parse(p.date + "T00:00:00Z"))
    const minTime = times[0] ?? 0
    const maxTime = times[times.length - 1] ?? minTime
    const span = Math.max(1, maxTime - minTime)
    const maxCount = Math.max(1, ...timeline.map((p) => p.count))
    const hasSpan = maxTime > minTime
    const pts = timeline.map((p, i) => ({
      x: pad.left + (hasSpan ? ((times[i] - minTime) / span) * depthW : depthW / 2),
      y: pad.top + (1 - p.count / maxCount) * depthH,
    }))
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")
    const len = habitPolylineLength(pts).toFixed(2)
    const last = pts[pts.length - 1]
    container.innerHTML = `<svg class="habit-timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Habits completed per day">
      <path class="habit-timeline-line is-animating" style="--habit-line-length:${len}" d="${d}" />
      ${last ? `<circle class="habit-timeline-point is-animating" cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="1.8" />` : ""}
    </svg>`
  }

  async function initHabitTracker() {
    const chartEl = $("[data-habit-timeline-chart]")
    if (!chartEl) return

    let timeline = []
    try {
      const res = await fetch("/")
      if (!res.ok) return
      const html = await res.text()
      const doc = new DOMParser().parseFromString(html, "text/html")
      const raw = doc.getElementById("quartz-body")?.dataset.habitTimeline
      if (raw) timeline = JSON.parse(raw)
    } catch (e) {
      return
    }

    if (!Array.isArray(timeline) || !timeline.length) return

    const render = () => renderHabitChart(chartEl, timeline)
    render()
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(render).observe(chartEl)
    }
  }

  void initHabitTracker()
})()
