/*
art-soundscape.js — "California Girls" for the art page, as a small live performance (Web Audio).
Same AM-radio chain as the redwood / Catalina / Half Dome radios, but the stereo recording is
split into its left and right channels and placed in 3D around the listener (HRTF): the band
sits in a loose arc in front, the stereo "side" signal (L-R) is spread behind as room envelope,
and a short synthesized hall adds a venue. Distance roll-off is off, so the level never changes;
only the stage moves: it sways gently, turns with the pointer, and lifts a little as you scroll.

Exposes window.__soundscape = { setMuted(bool), isMuted(), duck(bool) } (same API as the other
soundscape files, so the nav mute button and enter gate in app.js work unchanged).
*/
;(() => {
  const MUTED_KEY = "siteAudioMuted"
  const SRC = "/art/sounds/california-girls.m4a"
  const LEVEL = 0.4 // matches the other pages' radios (level 0.42 x master 0.9)
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

  // Stage, in metres, listener at the origin facing -z. az = degrees from straight ahead.
  const STAGE = {
    left: { az: -42, r: 3.2, y: 0.2 },
    right: { az: 42, r: 3.2, y: 0.2 },
    sideL: { az: -128, r: 4.5, y: 0.4 },
    sideR: { az: 128, r: 4.5, y: 0.4 },
  }

  let ctx = null
  let master = null
  let src = null
  let el = null
  let ok = true
  let started = false
  let tickTimer = 0
  let muted = localStorage.getItem(MUTED_KEY) === "true"
  let ducked = false
  const nodes = {} // name -> PannerNode
  let look = 0 // smoothed stage rotation (deg) from the pointer
  let lookTarget = 0
  let lift = 0
  let liftTarget = 0
  let tick = 0

  function pinkNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11
    }
    return buf
  }

  // a small hall: decorrelated stereo noise with an exponential tail, darker as it decays
  function hallImpulse() {
    const sr = ctx.sampleRate
    const len = Math.floor(sr * 1.9)
    const buf = ctx.createBuffer(2, len, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const a = Math.exp((-2 * Math.PI * Math.max(900, 6500 * Math.exp(-t * 1.6))) / sr)
        lp = a * lp + (1 - a) * (Math.random() * 2 - 1)
        d[i] = lp * Math.exp(-t / 0.55) * Math.min(1, t / 0.012) * 0.9
      }
    }
    return buf
  }

  function biquad(type, f, q, g) {
    const n = ctx.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = q
    if (g !== undefined) n.gain.value = g
    return n
  }

  function panner() {
    const p = ctx.createPanner()
    Object.assign(p, { panningModel: "HRTF", distanceModel: "linear", rolloffFactor: 0 })
    return p
  }

  function place(name, now, smooth) {
    const s = STAGE[name]
    const az = ((s.az + look) * Math.PI) / 180
    const sway = Math.sin(tick * 0.00021 + s.az) * 0.35 // slow, per-voice drift in metres
    const x = Math.sin(az) * s.r + sway
    const z = -Math.cos(az) * s.r + Math.cos(tick * 0.00017 + s.az * 2) * 0.3
    const y = s.y + lift + Math.sin(tick * 0.00013 + s.az) * 0.12
    const p = nodes[name]
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, now, smooth)
      p.positionY.setTargetAtTime(y, now, smooth)
      p.positionZ.setTargetAtTime(z, now, smooth)
    } else p.setPosition(x, y, z)
  }

  // Play the song once per session; remember position across page navigations
  function persistOnce(el, src) {
    const k = "radioPos:" + src
    const saved = sessionStorage.getItem(k)
    el.loop = false
    if (saved === "done") {
      el.dataset.done = "1"
    } else if (saved) {
      const t = parseFloat(saved)
      if (t > 0) el.addEventListener("loadedmetadata", () => { try { el.currentTime = t } catch (e) {} }, { once: true })
    }
    const save = () => {
      if (el.dataset.done) return
      if (el.currentTime > 0) sessionStorage.setItem(k, String(el.currentTime))
    }
    el.addEventListener("timeupdate", save)
    window.addEventListener("pagehide", save)
    el.addEventListener("ended", () => {
      el.dataset.done = "1"
      sessionStorage.setItem(k, "done")
    })
  }

  function buildGraph() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ctx = new AC({ latencyHint: "playback" })

    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)

    el = new Audio()
    el.src = SRC
    el.loop = false
    el.preload = "auto"
    el.crossOrigin = "anonymous"
    persistOnce(el, SRC)
    el.addEventListener("error", () => (ok = false))
    src = ctx.createMediaElementSource(el)

    // --- AM-radio band, same as the other pages (applied to both channels) ---
    const trim = ctx.createGain()
    trim.gain.value = 0.55
    const hp = biquad("highpass", 320, 0.8)
    const mid = biquad("peaking", 1500, 1.1, 2.5)
    const lp = biquad("lowpass", 3200, 0.9)
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1
      curve[i] = Math.tanh(1.1 * x) / Math.tanh(1.1)
    }
    shaper.curve = curve
    const lim = ctx.createDynamicsCompressor()
    lim.threshold.value = -10
    lim.knee.value = 6
    lim.ratio.value = 12
    lim.attack.value = 0.003
    lim.release.value = 0.15
    // station drift
    const fade = ctx.createGain()
    fade.gain.value = 0.95
    const lfo = ctx.createOscillator()
    const lfoAmt = ctx.createGain()
    lfo.frequency.value = 0.11
    lfoAmt.gain.value = 0.05
    lfo.connect(lfoAmt).connect(fade.gain)
    lfo.start()
    src.connect(trim).connect(hp).connect(mid).connect(lp).connect(shaper).connect(lim).connect(fade)

    // --- split into the stage ---
    const split = ctx.createChannelSplitter(2)
    fade.connect(split)
    const level = ctx.createGain()
    level.gain.value = LEVEL
    level.connect(master)

    const hall = ctx.createConvolver()
    hall.buffer = hallImpulse()
    const hallIn = ctx.createGain()
    hallIn.gain.value = 0.22
    const hallOut = ctx.createGain()
    hallOut.gain.value = 1
    hallIn.connect(hall).connect(hallOut).connect(level)

    const mk = (name, from, gain) => {
      const g = ctx.createGain()
      g.gain.value = gain
      nodes[name] = panner()
      from.connect(g).connect(nodes[name]).connect(level)
      g.connect(hallIn)
      return g
    }
    // front arc: the stereo image itself
    split.connect(ensure("L"), 0)
    split.connect(ensure("R"), 1)
    mk("left", L, 0.85)
    mk("right", R, 0.85)
    // envelope behind: the side signal (L-R), opposite phase to the right so it differs from the arc
    const side = ctx.createGain()
    side.gain.value = 1
    const inv = ctx.createGain()
    inv.gain.value = -1
    L.connect(side)
    R.connect(inv).connect(side)
    mk("sideL", side, 0.3)
    const sideInv = ctx.createGain()
    sideInv.gain.value = -1
    side.connect(sideInv)
    mk("sideR", sideInv, 0.3)

    // faint static so it reads as a transmission
    const hiss = ctx.createBufferSource()
    hiss.buffer = pinkNoise(4)
    hiss.loop = true
    const hissBp = biquad("bandpass", 2600, 0.5)
    const hissGain = ctx.createGain()
    hissGain.gain.value = 0.004
    hiss.connect(hissBp).connect(hissGain).connect(master)
    hiss.start()

    const Lis = ctx.listener
    if (Lis.forwardX) {
      Lis.forwardX.value = 0
      Lis.forwardY.value = 0
      Lis.forwardZ.value = -1
      Lis.upX.value = 0
      Lis.upY.value = 1
      Lis.upZ.value = 0
    }
    for (const n of Object.keys(STAGE)) place(n, ctx.currentTime, 0.01)
    return true
  }

  // pass-through gain nodes for each channel (created once)
  let L = null
  let R = null
  function ensure(which) {
    if (which === "L") return (L = L || ctx.createGain())
    return (R = R || ctx.createGain())
  }

  function frame() {
    if (!ctx || ctx.state !== "running") return
    tick = performance.now()
    look += (lookTarget - look) * 0.04
    lift += (liftTarget - lift) * 0.04
    const now = ctx.currentTime
    for (const n of Object.keys(STAGE)) place(n, now, 0.12)
  }

  addEventListener(
    "pointermove",
    (e) => {
      lookTarget = (e.clientX / innerWidth - 0.5) * 50 // stage turns up to +-25 deg
    },
    { passive: true },
  )
  addEventListener(
    "scroll",
    () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
      liftTarget = (scrollY / max - 0.5) * 1.6 // +-0.8 m
    },
    { passive: true },
  )

  const targetLevel = () => (muted ? 0 : ducked ? 0.08 : 0.9)
  function applyLevel(fade = 0.6) {
    if (!ctx) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(targetLevel(), now + fade)
  }

  function start() {
    if (muted || document.visibilityState === "hidden") return
    if (!ctx && !buildGraph()) return
    if (ctx.state === "suspended") ctx.resume()
    if (ok && el.paused && !el.dataset.done) el.play().catch(() => {})
    if (!started) {
      started = true
      tickTimer = setInterval(frame, 60)
      applyLevel(2.5)
    } else applyLevel(master.gain.value < 0.05 ? 2.5 : 0.6)
  }
  
  function suspendSoon() {
    if (!ctx) return
    applyLevel(0.4)
    setTimeout(() => {
      if ((muted || document.visibilityState === "hidden") && ctx.state === "running") ctx.suspend()
    }, 500)
  }

  const unlock = () => {
    start()
    if (ctx && ctx.state === "running")
      ["pointerdown", "keydown", "touchend"].forEach((e) => removeEventListener(e, unlock, true))
  }
  ;["pointerdown", "keydown", "touchend"].forEach((e) => addEventListener(e, unlock, true))
  start()

  document.addEventListener("visibilitychange", () =>
    document.visibilityState === "hidden" ? suspendSoon() : start(),
  )
  addEventListener("pagehide", () => ctx && ctx.suspend())

  window.__soundscape = {
    setMuted(m) {
      muted = m
      localStorage.setItem(MUTED_KEY, String(m))
      m ? suspendSoon() : start()
    },
    isMuted: () => muted,
    duck(d) {
      ducked = d
      applyLevel(0.3)
    },
    debug: () => ({ state: ctx ? ctx.state : "none", started, muted, level: master ? +master.gain.value.toFixed(3) : 0, look }),
  }
})()
