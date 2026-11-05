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

  // Fills every [data-mirror-quote-grid] in document order from one shuffle, so no quote repeats
  // across grids. data-count = quotes for that grid (default 6).
  function renderMirrorQuotes() {
    const grids = $$("[data-mirror-quote-grid]")
    const dataRoot = $("#quartz-body")
    if (!grids.length || !dataRoot || !dataRoot.dataset.mirrorBoldQuotes) return

    let quotes = []
    try {
      quotes = JSON.parse(dataRoot.dataset.mirrorBoldQuotes)
    } catch (e) {
      return
    }
    if (!Array.isArray(quotes) || quotes.length < 1) return

    const pool = shuffleMirrorQuotes([...quotes])
    grids.forEach((grid) => {
      const selected = pool.splice(0, parseInt(grid.dataset.count, 10) || 6)
      if (selected.length) grid.replaceChildren(...selected.map(card))
    })
    document.dispatchEvent(new CustomEvent("mirror-quotes:rendered"))

    function card(quote) {
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
    }
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

  const startReveals = () => $$("[data-reveal]").forEach((el) => io.observe(el))
  // hold the hero reveal until the enter gate lifts (see ENTER GATE below)
  if (!document.documentElement.classList.contains("gate")) startReveals()

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
     VIDEO CONTROLS + SOUNDSCAPE DUCKING
  ========================================================= */
  const videoCards = $$(".portfolio-video-card")
  const youtubePlayers = new Map()
  let ytReady = false
  const ytReadyCallbacks = []

  function anyVideoAudible() {
    return videoCards.some((card) => card.dataset.videoMuted === "false")
  }

  function syncSoundscapeDuckToVideos() {
    window.__soundscape?.duck(anyVideoAudible())
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
      if (url.searchParams.get("mute") !== "1") {
        url.searchParams.set("mute", "1")
        changed = true
      }
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

  function userWantsPlaying(card) {
    return $(".portfolio-video-playpause", card)?.dataset.playing !== "false"
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

      // never leave the (redwood-mode) iframe invisible: reveal after 4s
      // even if the player never reports PLAYING
      setTimeout(() => card.classList.add("is-playing"), 4000)
      $$(".portfolio-video-ctrl", card).forEach((btn) =>
        btn.addEventListener("click", () => card.classList.add("is-playing")),
      )

      whenYouTubeReady(() => {
        if (youtubePlayers.has(card)) return
        const player = new window.YT.Player(iframe, {
          events: {
            onReady: (event) => {
              youtubePlayers.set(card, event.target)
              event.target.mute()
              if (card.dataset.inView === "false") event.target.pauseVideo()
              else event.target.playVideo()
            },
            onStateChange: (e) => {
              // keep videos muted until the user explicitly unmutes one
              if (card.dataset.videoMuted !== "false" && e.target.isMuted?.() === false) {
                e.target.mute()
              }
              if (e.data === 1) card.classList.add("is-playing")
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

        syncSoundscapeDuckToVideos()
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

    // pause off-screen videos; resume on return unless the user paused
    const videoIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const card = entry.target
          card.dataset.inView = String(entry.isIntersecting)
          const player = youtubePlayers.get(card)
          if (!player || typeof player.playVideo !== "function") return
          if (!entry.isIntersecting) player.pauseVideo()
          else if (userWantsPlaying(card)) player.playVideo()
        })
      },
      { threshold: 0.1 },
    )
    videoCards.forEach((card) => videoIO.observe(card))
  }

  setupPortfolioVideos()

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

  /* ---- MUTE BUTTON ---- */
  const btnMute = $("#btn-mute")
  const muteXPath = $("#mute-x")
  const muteLabel = $("#mute-label")
  const AUDIO_MUTED_KEY = "siteAudioMuted"
  let globalMuted = localStorage.getItem(AUDIO_MUTED_KEY) === "true"

  function syncMuteBtn(muted) {
    if (muteXPath) muteXPath.style.display = muted ? "" : "none"
    if (muteLabel) muteLabel.textContent = muted ? "unmute" : "mute"
  }
  syncMuteBtn(globalMuted)

  function applyGlobalMute(muted) {
    globalMuted = muted
    // Site-wide mute silences videos too, but unmuting never unmutes them:
    // videos only get sound from their own sound button.
    if (muted)
      videoCards.forEach((card) => {
        const player = youtubePlayers.get(card)
        if (player && typeof player.mute === "function") {
          player.mute()
          setVideoIcon(card, true)
        }
      })
    if (window.__soundscape) window.__soundscape.setMuted(muted)
    else localStorage.setItem(AUDIO_MUTED_KEY, String(muted))
    syncMuteBtn(muted)
  }

  btnMute?.addEventListener("click", () => applyGlobalMute(!globalMuted))

  /* ---------- ENTER GATE ----------
     Shown once per session so the first click unlocks audio (browsers block sound
     until a user gesture). The click itself starts the soundscape. */
  const gate = $("#enter-gate")
  if (gate && document.documentElement.classList.contains("gate")) {
    window.__gateReady = true
    const enter = (withSound) => {
      try {
        sessionStorage.setItem("siteEntered", "1")
      } catch (e) {}
      applyGlobalMute(!withSound) // inside the click → AudioContext may start
      gate.classList.add("is-leaving")
      const done = () => {
        document.documentElement.classList.remove("gate")
        gate.remove()
        startReveals()
      }
      prefersReduced ? done() : setTimeout(done, 700)
    }
    $("#enter-sound")?.addEventListener("click", () => enter(true))
  } else gate?.remove()

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
    if (el.dataset.habit) return // habit totals are animated by assets/js/roll-counter.js
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
      // filled in by data/site-data.js
      const raw = document.getElementById("quartz-body")?.dataset.habitTimeline
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
