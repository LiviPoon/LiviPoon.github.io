/*
catalina-soundscape.js — scroll-driven Santa Catalina Island soundscape (Web Audio).
Sibling of soundscape.js (redwood homepage); same engine, island layers.

Scrolling flies a virtual listener along the camera path in catalina.js
(window.Catalina.eyeAt), from high over the Pacific down to the water off Avalon.
Each layer (sky, highlands, canyon, shore, sea) has its own animals; calls are
placed in 3D around the listener (HRTF panning, distance roll-off, air absorption,
light coastal reverb). Ambience: real surf/wave loops (distant surf from the hills,
lapping waves at sea level) under a synthesized wind bed.

Exposes window.__soundscape = { setMuted(bool), isMuted(), duck(bool) } (same API as
soundscape.js, so the nav mute button in app.js works unchanged).
Clips: catalina/sounds/*.m4a, trimmed, denoised and levelled; credits render into #sound-credits.
*/
;(() => {
  const MUTED_KEY = "siteAudioMuted"
  const BASE = "/catalina/sounds/"

  // Layers: typical listener height (display metres, ×2.5 vertical exaggeration as in
  // catalina.json) where the layer is loudest. Weighted in log-altitude.
  const ZONES = {
    sky: { y: 6000, label: "Over the island" },
    highlands: { y: 1300, label: "Grassland ridges" },
    canyon: { y: 550, label: "Canyons & scrub" },
    shore: { y: 160, label: "Cliffs & coves" },
    sea: { y: 30, label: "Sea level" },
  }

  // A beach radio on the water off Avalon (where the flight ends) plays a looping song through
  // an AM-radio filter. Placed in world metres; same chain as the redwood radio in soundscape.js.
  const RADIO = {
    src: BASE + "surfer-girl.m4a",
    pos: [16300, 2, 8750], // x, y, z (m): just ahead of the final camera position
    level: 0.42,
    refDist: 2000, // m: distance at full level; larger = carries farther
    rolloff: 0.75,
  }

  const XC = "xeno-canto"
  // gain: level trim; dist: [min,max] metres from the listener
  const CLIPS = [
    { id: "bald-eagle", zone: "sky", name: "Bald Eagle", by: "Steve Hampton", xc: 779509, gain: 0.75, dist: [30, 90] },
    { id: "raven", zone: "sky", name: "Common Raven", by: "Paul Driver", xc: 1152935, gain: 0.7, dist: [25, 80] },
    { id: "red-tailed-hawk", zone: "sky", name: "Red-tailed Hawk", by: "Paul Marvin", xc: 577037, gain: 0.65, dist: [40, 120] },
    { id: "american-kestrel", zone: "sky", name: "American Kestrel", by: "Paul Marvin", xc: 483212, gain: 0.65, dist: [20, 60] },
    { id: "osprey", zone: "sky", name: "Osprey", by: "Richard E. Webster", xc: 466220, gain: 0.75, dist: [30, 90] },
    { id: "western-meadowlark", zone: "highlands", name: "Western Meadowlark", by: "Ed Pandolfino", xc: 787000, gain: 0.85, dist: [15, 60] },
    { id: "horned-lark", zone: "highlands", name: "Horned Lark", by: "Paul Marvin", xc: 808118, gain: 0.8, dist: [8, 30] },
    { id: "california-quail", zone: "highlands", name: "California Quail", by: "Paul Marvin", xc: 714446, gain: 0.75, dist: [10, 40] },
    { id: "lark-sparrow", zone: "highlands", name: "Lark Sparrow", by: "Paul Marvin", xc: 791866, gain: 0.8, dist: [8, 30] },
    { id: "rock-wren", zone: "highlands", name: "Rock Wren", by: "Paul Marvin", xc: 801382, gain: 0.75, dist: [8, 35] },
    { id: "bewicks-wren", zone: "canyon", name: "Bewick's Wren", by: "Ed Pandolfino", xc: 1136842, gain: 0.75, dist: [5, 25] },
    { id: "spotted-towhee", zone: "canyon", name: "Spotted Towhee", by: "Denise Wight", xc: 654969, gain: 0.75, dist: [6, 25] },
    { id: "california-towhee", zone: "canyon", name: "California Towhee", by: "Paul Marvin", xc: 821034, gain: 0.85, dist: [4, 18] },
    { id: "allens-hummingbird", zone: "canyon", name: "Allen's Hummingbird", by: "Paul Marvin", xc: 698001, gain: 0.7, dist: [2, 10] },
    { id: "orange-crowned-warbler", zone: "canyon", name: "Orange-crowned Warbler", by: "Paul Marvin", xc: 582728, gain: 0.8, dist: [6, 25] },
    { id: "huttons-vireo", zone: "canyon", name: "Hutton's Vireo", by: "Ron Overholtz", xc: 557114, gain: 0.75, dist: [6, 25] },
    { id: "song-sparrow", zone: "canyon", name: "Song Sparrow", by: "Ed Pandolfino", xc: 900079, gain: 0.8, dist: [6, 25] },
    { id: "western-gull", zone: "shore", name: "Western Gull", by: "Andrew Spencer", xc: 109697, gain: 0.6, dist: [15, 70] },
    { id: "black-oystercatcher", zone: "shore", name: "Black Oystercatcher", by: "Bruce Lagerquist", xc: 351803, gain: 0.6, dist: [15, 60] },
    { id: "heermanns-gull", zone: "shore", name: "Heermann's Gull", by: "Andrew Spencer", xc: 109915, gain: 0.7, dist: [15, 60] },
    { id: "black-turnstone", zone: "shore", name: "Black Turnstone", by: "Andrew Spencer", xc: 109837, gain: 0.75, dist: [10, 40] },
    { id: "wandering-tattler", zone: "shore", name: "Wandering Tattler", by: "Steve Hampton", xc: 420226, gain: 0.75, dist: [15, 50] },
    { id: "bison", zone: "highlands", name: "American Bison (bellow)", by: "NPS / Yellowstone, Shan Burson", src: "US National Park Service, public domain", url: "https://www.nps.gov/yell/learn/photosmultimedia/sounds-bison.htm", gain: 0.75, dist: [40, 120] },
    { id: "sea-lion", zone: "sea", name: "California Sea Lion", by: "RTB45, Freesound, CC BY 4.0", url: "https://freesound.org/s/613543/", gain: 0.6, dist: [30, 90] },
    { id: "sea-lion-chorus", zone: "sea", name: "California Sea Lions (chorus)", by: "RTB45, Freesound, CC BY 4.0", url: "https://freesound.org/s/613543/", gain: 0.45, dist: [60, 150] },
    { id: "elephant-seal", zone: "sea", name: "Northern Elephant Seal", by: "NPS / Channel Islands", src: "US National Park Service, public domain", url: "https://www.nps.gov/subjects/islandofthebluedolphins/sound-files.htm", gain: 0.4, dist: [90, 180] },
    { id: "harbor-seal", zone: "sea", name: "Harbor Seal (pup)", by: "NPS / Glacier Bay", src: "US National Park Service, public domain", url: "https://www.nps.gov/glba/learn/nature/name-that-tune.htm", gain: 0.5, dist: [40, 110] },
  ]
  // Real ambience loops (stereo). level: peak gain; filled from the same folder.
  const BEDS = {
    surf: { id: "surf-distant", credit: { name: "Distant surf", by: "craigsmith, Freesound, CC0", url: "https://freesound.org/s/438822/" } },
    waves: { id: "waves-close", credit: { name: "Waves on a beach", by: "dobroide, Freesound, CC BY 4.0", url: "https://freesound.org/s/153486/" } },
  }

  const AMBIENCE = 0.3 // overall level of the ambience bed
  const MAX_VOICES = 4
  const MAX_PER_ZONE = 2
  const TICK_MS = 100

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const lerp = (a, b, t) => a + (b - a) * t
  const rand = (a, b) => a + Math.random() * (b - a)

  /* ---------------- scroll → listener position ---------------- */
  let stops = []
  function measureStops() {
    const sy = scrollY,
      vh = innerHeight,
      maxS = Math.max(0, document.documentElement.scrollHeight - vh)
    let prev = 0
    stops = [...document.querySelectorAll("[data-redwood-stop]")].map((el) => {
      const r = el.getBoundingClientRect()
      const s = Math.min(maxS, Math.max(prev, r.top + sy + r.height / 2 - vh / 2))
      prev = s
      return { s, t: clamp(parseFloat(el.dataset.redwoodStop) || 0, 0, 1) }
    })
  }
  function descent() {
    const y = scrollY
    if (!stops.length)
      return clamp(y / Math.max(1, document.documentElement.scrollHeight - innerHeight), 0, 1)
    if (y <= stops[0].s) return stops[0].t
    for (let i = 1; i < stops.length; i++)
      if (y <= stops[i].s) {
        const a = stops[i - 1],
          b = stops[i]
        return lerp(a.t, b.t, b.s > a.s ? (y - a.s) / (b.s - a.s) : 1)
      }
    return stops[stops.length - 1].t
  }
  // listener height + heading from the camera path in catalina.js
  function pose(t) {
    const C = window.Catalina
    if (!C) return { y: lerp(18000, 45, t), yaw: 0 }
    const e = C.eyeAt(t),
      e2 = C.eyeAt(Math.min(1, t + 0.02)),
      P = C.path
    // look direction: interpolate the path's look-at column linearly (heading only)
    let i = 0
    while (i < P.length - 2 && t > P[i + 1][0]) i++
    const k = clamp((t - P[i][0]) / (P[i + 1][0] - P[i][0]), 0, 1)
    const lx = lerp(P[i][4], P[i + 1][4], k),
      lz = lerp(P[i][6], P[i + 1][6], k)
    const fx = lx - e[0],
      fz = lz - e[2]
    return { y: e[1], yaw: Math.atan2(fx, fz) || Math.atan2(e2[0] - e[0], e2[2] - e[2]) }
  }
  const lg = (y) => Math.log(Math.max(1, y) + 40)
  const zoneWeight = (zone, ly) => Math.exp(-(((lg(ly) - lg(ZONES[zone].y)) / 0.7) ** 2))

  /* ---------------- synthesis helpers ---------------- */
  function pinkNoiseBuffer(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds)
    const f = Math.floor(ctx.sampleRate * 0.5)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const out = buf.getChannelData(ch)
      const d = new Float32Array(len + f)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < len + f; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
      out.set(d.subarray(0, len))
      for (let i = 0; i < f; i++) {
        const k = ((i / f) * Math.PI) / 2
        out[i] = d[i] * Math.sin(k) + d[len + i] * Math.cos(k)
      }
    }
    return buf
  }

  // Open coast: a few late, discrete cliff echoes and a short, bright diffuse tail.
  function coastImpulse(ctx) {
    const sr = ctx.sampleRate,
      len = Math.floor(sr * 1.4)
    const buf = ctx.createBuffer(2, len, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let k = 0; k < 6; k++) {
        const i = Math.floor(sr * rand(0.06, 0.35))
        d[i] += rand(0.08, 0.3) * (Math.random() < 0.5 ? -1 : 1)
      }
      let lp = 0
      const start = Math.floor(sr * 0.02)
      for (let i = start; i < len; i++) {
        const t = (i - start) / sr
        const fc = lerp(7000, 1500, Math.min(1, t / 1.0))
        const a = Math.exp((-2 * Math.PI * fc) / sr)
        lp = a * lp + (1 - a) * (Math.random() * 2 - 1)
        d[i] += lp * Math.exp(-t / 0.16) * Math.min(1, t / 0.03) * 0.7
      }
    }
    return buf
  }

  /* ---------------- engine ---------------- */
  let ctx = null
  let master, dryBus, reverb, reverbReturn, amb
  let wind, windBand, surf, surfLP, waves, synthSurf
  const buffers = new Map()
  const voices = new Set()
  let listener = pose(0)
  let muted = localStorage.getItem(MUTED_KEY) === "true"
  let ducked = false
  let tickTimer = 0
  let gustPhase = Math.random() * 100
  let started = false
  let radio = null

  function buildGraph() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ctx = new AC({ latencyHint: "playback" })

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 12
    comp.ratio.value = 3
    comp.attack.value = 0.02
    comp.release.value = 0.4
    master = ctx.createGain()
    master.gain.value = 0
    comp.connect(master).connect(ctx.destination)
    const pre = ctx.createGain()
    pre.gain.value = 3.2
    pre.connect(comp)
    // ambience bypasses the compressor so loud calls don't pump it down
    amb = ctx.createGain()
    amb.gain.value = pre.gain.value
    amb.connect(master)

    dryBus = ctx.createGain()
    dryBus.connect(pre)
    reverb = ctx.createConvolver()
    reverb.buffer = coastImpulse(ctx)
    reverbReturn = ctx.createGain()
    reverbReturn.gain.value = 0.35
    reverb.connect(reverbReturn).connect(pre)

    const noise = pinkNoiseBuffer(ctx, 8)
    const loop = (buffer, offset) => {
      const s = ctx.createBufferSource()
      s.buffer = buffer
      s.loop = true
      s.start(0, offset % buffer.duration)
      return s
    }
    // wind over the ridges: band-limited noise, gusting
    windBand = ctx.createBiquadFilter()
    windBand.type = "bandpass"
    windBand.frequency.value = 450
    windBand.Q.value = 0.6
    wind = ctx.createGain()
    wind.gain.value = 0
    loop(noise, 0).connect(windBand).connect(wind).connect(amb)
    // synthesized surf stands in until the real loop has decoded (or if it fails)
    surfLP = ctx.createBiquadFilter()
    surfLP.type = "lowpass"
    surfLP.frequency.value = 900
    synthSurf = ctx.createGain()
    synthSurf.gain.value = 0
    loop(noise, 3.3).connect(surfLP).connect(synthSurf).connect(amb)
    // real beds, gains driven in tick()
    surf = ctx.createGain()
    surf.gain.value = 0
    surf.connect(amb)
    waves = ctx.createGain()
    waves.gain.value = 0
    waves.connect(amb)
    loadClip(BEDS.surf.id).then((b) => b && loop(b, rand(0, b.duration)).connect(surf))
    loadClip(BEDS.waves.id).then((b) => b && loop(b, rand(0, b.duration)).connect(waves))

    const L = ctx.listener
    if (L.upX) {
      L.upX.value = 0
      L.upY.value = 1
      L.upZ.value = 0
    }
    buildRadio()
    return true
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

  function buildRadio() {
    const el = new Audio()
    el.src = RADIO.src
    el.loop = false
    el.preload = "auto"
    el.crossOrigin = "anonymous"
    persistOnce(el, RADIO.src)
    const src = ctx.createMediaElementSource(el)
    const node = (type, f, q, g) => {
      const n = ctx.createBiquadFilter()
      n.type = type
      n.frequency.value = f
      n.Q.value = q
      if (g !== undefined) n.gain.value = g
      return n
    }
    // AM-radio band: thin lows, narrow top, a nasal midrange bump
    const hp = node("highpass", 320, 0.8)
    const lp = node("lowpass", 3200, 0.9)
    const mid = node("peaking", 1500, 1.1, 2.5)
    const trim = ctx.createGain() // headroom ahead of the filters: no clipping on loud peaks
    trim.gain.value = 0.55
    // soft clipping = small-speaker grit
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1
      curve[i] = Math.tanh(1.1 * x) / Math.tanh(1.1) // very soft: grit without crackle
    }
    shaper.curve = curve
    // slow signal wander: level wobbles like a station drifting in and out
    const fade = ctx.createGain()
    const lfo = ctx.createOscillator()
    const lfoAmt = ctx.createGain()
    lfo.frequency.value = 0.11
    lfoAmt.gain.value = 0.05
    fade.gain.value = 0.95
    lfo.connect(lfoAmt).connect(fade.gain)
    lfo.start()
    // faint static, always present, so it reads as a transmission
    const hiss = ctx.createBufferSource()
    hiss.buffer = pinkNoiseBuffer(ctx, 4, 1)
    hiss.loop = true
    const hissBp = node("bandpass", 2600, 0.5)
    const hissGain = ctx.createGain()
    hissGain.gain.value = 0.004
    hiss.connect(hissBp).connect(hissGain)
    hiss.start()

    const radioOut = ctx.createGain()
    radioOut.gain.value = 1
    radioOut.connect(master)
    const gain = ctx.createGain()
    gain.gain.value = 0
    const dist = node("lowpass", 3200, 0.7) // air absorption: darker when far
    const panner = ctx.createPanner()
    Object.assign(panner, { panningModel: "HRTF", distanceModel: "linear", rolloffFactor: 0 })
    const send = ctx.createGain()
    send.gain.value = 0.05

    // peak limiter right after the filters catches any remaining transients
    const lim = ctx.createDynamicsCompressor()
    lim.threshold.value = -10
    lim.knee.value = 6
    lim.ratio.value = 12
    lim.attack.value = 0.003
    lim.release.value = 0.15
    src.connect(trim).connect(hp).connect(mid).connect(lp).connect(shaper).connect(lim).connect(fade)
    fade.connect(gain)
    hissGain.connect(gain)
    gain.connect(dist).connect(panner).connect(radioOut)
    dist.connect(send).connect(reverb)
    radio = { el, gain, dist, panner, send, ok: true }
    el.addEventListener("error", () => (radio.ok = false))
    el.addEventListener("loadeddata", () => (radio.ok = true))
  }

  function updateRadio(now) {
    if (!radio || !radio.ok) return
    // listener sits at the origin facing its heading, so place the radio relative to the eye
    const e = window.Catalina ? window.Catalina.eyeAt(descent()) : [RADIO.pos[0], listener.y, RADIO.pos[2]]
    const rx = RADIO.pos[0] - e[0],
      ry = RADIO.pos[1] - listener.y,
      rz = RADIO.pos[2] - e[2]
    const range = Math.hypot(rx, ry, rz)
    setPos(radio.panner, rx, ry, rz, now, 0.3)
    // loud once the flight arrives off Avalon; a faint far-off station before that
    const g = RADIO.level * Math.pow(clamp(RADIO.refDist / range, 0, 1.5), RADIO.rolloff)
    radio.gain.gain.setTargetAtTime(g, now, 0.25)
    const far = clamp((range - RADIO.refDist) / 20000, 0, 1)
    radio.dist.frequency.setTargetAtTime(lerp(3400, 2200, far), now, 0.3)
    radio.send.gain.setTargetAtTime(lerp(0.03, 0.14, far), now, 0.3)
  }

  function setPos(p, x, y, z, now, smooth) {
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, now, smooth)
      p.positionY.setTargetAtTime(y, now, smooth)
      p.positionZ.setTargetAtTime(z, now, smooth)
    } else p.setPosition(x, y, z)
  }

  function loadClip(id) {
    if (buffers.has(id)) return buffers.get(id)
    const p = fetch(BASE + id + ".m4a")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((b) => (buffers.set(id, b), b))
      .catch(() => (buffers.delete(id), null))
    buffers.set(id, p)
    return p
  }
  const ready = (id) => buffers.get(id) instanceof AudioBuffer

  async function preload() {
    const order = CLIPS.slice().sort(
      (a, b) => zoneWeight(b.zone, listener.y) - zoneWeight(a.zone, listener.y),
    )
    for (const c of order) await loadClip(c.id)
  }

  // calls from layers above/below are hinted vertically, not placed at true altitude
  const voiceDy = (v) => clamp((ZONES[v.clip.zone].y - listener.y) * 0.04, -30, 30) + v.dy

  function updateVoiceSpatial(v, now, smooth) {
    const dy = voiceDy(v)
    const dist = Math.hypot(v.x, dy, v.z)
    const p = v.panner
    if (p.positionX) {
      p.positionX.setTargetAtTime(v.x, now, smooth)
      p.positionY.setTargetAtTime(dy, now, smooth)
      p.positionZ.setTargetAtTime(v.z, now, smooth)
    } else p.setPosition(v.x, dy, v.z)
    v.air.frequency.setTargetAtTime(clamp(19000 * Math.exp(-dist / 70), 1400, 19000), now, smooth)
    v.send.gain.setTargetAtTime(clamp(0.12 + dist / 140, 0.12, 0.6), now, smooth)
    v.zoneGain.gain.setTargetAtTime(0.2 + 0.8 * zoneWeight(v.clip.zone, listener.y), now, 0.4)
  }

  function spawn(clip) {
    const buf = buffers.get(clip.id)
    if (!(buf instanceof AudioBuffer)) return
    const now = ctx.currentTime
    const seg = Math.min(buf.duration, rand(6, 13))
    const offset = rand(0, Math.max(0, buf.duration - seg))
    const az = rand(0, Math.PI * 2)
    const r = rand(clip.dist[0], clip.dist[1])
    const v = {
      clip,
      x: Math.cos(az) * r,
      z: Math.sin(az) * r,
      dy: rand(-4, 4),
      src: ctx.createBufferSource(),
      env: ctx.createGain(),
      zoneGain: ctx.createGain(),
      air: ctx.createBiquadFilter(),
      panner: ctx.createPanner(),
      send: ctx.createGain(),
    }
    v.src.buffer = buf
    v.src.playbackRate.value = rand(0.985, 1.015)
    v.air.type = "lowpass"
    Object.assign(v.panner, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 8,
      rolloffFactor: 0.9,
      maxDistance: 400,
    })
    const peak = clip.gain * 0.9
    v.env.gain.setValueAtTime(0, now)
    v.env.gain.linearRampToValueAtTime(peak, now + 0.5)
    v.env.gain.setValueAtTime(peak, now + seg - 1.2)
    v.env.gain.linearRampToValueAtTime(0, now + seg)
    v.src.connect(v.env).connect(v.zoneGain).connect(v.air)
    v.air.connect(v.panner).connect(dryBus)
    v.air.connect(v.send).connect(reverb)
    updateVoiceSpatial(v, now, 0.001)
    v.src.start(now, offset, seg)
    v.src.onended = () => {
      voices.delete(v)
      v.send.disconnect()
      v.panner.disconnect()
    }
    voices.add(v)
  }

  function tick() {
    if (!ctx || ctx.state !== "running") return
    const now = ctx.currentTime
    listener = pose(descent())
    const ly = listener.y

    const L = ctx.listener
    const fx = Math.sin(listener.yaw),
      fz = Math.cos(listener.yaw)
    if (L.forwardX) {
      L.forwardX.setTargetAtTime(fx, now, 0.3)
      L.forwardY.setTargetAtTime(0, now, 0.3)
      L.forwardZ.setTargetAtTime(fz, now, 0.3)
    } else if (L.setOrientation) L.setOrientation(fx, 0, fz, 0, 1, 0)

    // ambience bed
    gustPhase += TICK_MS / 1000
    const gust =
      0.65 + 0.17 * Math.sin(gustPhase * 0.21) + 0.1 * Math.sin(gustPhase * 0.53 + 1.3) +
      0.03 * Math.sin(gustPhase * 1.7)
    const high = clamp((lg(ly) - lg(400)) / (lg(6000) - lg(400)), 0, 1) // 0 low … 1 high above
    const low = clamp((lg(400) - lg(ly)) / (lg(400) - lg(30)), 0, 1) // 0 at 400 m … 1 at the water
    wind.gain.setTargetAtTime(AMBIENCE * (0.03 + 0.17 * high) * gust, now, 0.8)
    windBand.frequency.setTargetAtTime(300 + 500 * gust * (0.5 + high), now, 0.8)
    // distant surf: present everywhere but the high sky, strongest over the cliffs
    const surfLvl = AMBIENCE * (0.1 + 0.55 * (1 - high)) * (1 - 0.5 * low)
    const wavesLvl = AMBIENCE * 1.4 * low * low // loop is mastered ~4 dB under the surf
    const realSurf = ready(BEDS.surf.id)
    surf.gain.setTargetAtTime(realSurf ? surfLvl : 0, now, 1.2)
    synthSurf.gain.setTargetAtTime(realSurf ? 0 : surfLvl * 0.12, now, 1.2)
    waves.gain.setTargetAtTime(wavesLvl, now, 1.2)
    reverbReturn.gain.setTargetAtTime(lerp(0.15, 0.45, 1 - high), now, 1)

    updateRadio(now)

    voices.forEach((v) => updateVoiceSpatial(v, now, 0.15))

    if (voices.size >= MAX_VOICES) return
    for (const zone of Object.keys(ZONES)) {
      const w = zoneWeight(zone, ly)
      if (w < 0.04) continue
      let inZone = 0
      voices.forEach((v) => v.clip.zone === zone && inZone++)
      if (inZone >= MAX_PER_ZONE) continue
      const rate = inZone ? 0.012 : 0.05
      if (Math.random() > w * rate) continue
      const playing = new Set([...voices].map((v) => v.clip.id))
      const pool = CLIPS.filter((c) => c.zone === zone && !playing.has(c.id) && ready(c.id))
      if (pool.length) spawn(pool[Math.floor(Math.random() * pool.length)])
      if (voices.size >= MAX_VOICES) break
    }
  }

  function targetLevel() {
    return muted ? 0 : ducked ? 0.08 : 0.9
  }
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
    if (radio && radio.el.paused && !radio.el.dataset.done) radio.el.play().catch(() => {})
    if (!started) {
      started = true
      measureStops()
      listener = pose(descent())
      preload()
      tickTimer = setInterval(tick, TICK_MS)
      applyLevel(3)
    } else applyLevel(master.gain.value < 0.05 ? 3 : 0.6)
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

  addEventListener("resize", measureStops, { passive: true })
  addEventListener("load", measureStops)
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
    debug: () => ({
      state: ctx ? ctx.state : "none",
      started,
      muted,
      level: master ? +master.gain.value.toFixed(3) : 0,
      listenerY: +listener.y.toFixed(1),
      loaded: [...buffers.values()].filter((b) => b instanceof AudioBuffer).length,
      voices: [...voices].map((v) => v.clip.id),
    }),
    duck(d) {
      ducked = d
      applyLevel(0.3)
    },
  }

  /* ---------------- credits ---------------- */
  const credits = document.getElementById("sound-credits-list")
  if (credits) {
    const link = (c) => {
      const a = document.createElement("a")
      a.href = c.xc ? `https://xeno-canto.org/${c.xc}` : c.url
      a.target = "_blank"
      a.rel = "noopener"
      a.textContent = `${c.name} (${c.by}${c.xc ? `, XC${c.xc}` : ""})`
      return a
    }
    for (const zone of Object.keys(ZONES)) {
      CLIPS.filter((c) => c.zone === zone).forEach((c) => {
        const li = document.createElement("li")
        li.append(`${ZONES[zone].label}: `, link(c))
        credits.append(li)
      })
    }
    Object.values(BEDS)
      .filter((b) => b.credit)
      .forEach((b) => {
        const li = document.createElement("li")
        li.append("Ocean: ", link(b.credit))
        credits.append(li)
      })
    const note = document.createElement("li")
    note.textContent =
      "Bird recordings via xeno-canto (CC BY-NC-SA 3.0/4.0); bison, elephant & harbor seal: US National Park Service (public domain); sea lions & waves: Freesound (CC BY 4.0 / CC0). Clips trimmed, noise-reduced and levelled; the edited clips are shared under CC BY-NC-SA 4.0."
    credits.append(note)

    // Non-interactive ticker: while open, hold a line, then glide one line up (eased, per frame).
    const box = document.getElementById("sound-credits")
    let raf = 0
    let timer = 0
    let total = 0 // real lines; the first line is repeated at the end so the loop is seamless
    const lineH = () => credits.firstElementChild.offsetHeight || 1
    const glide = () => {
      const from = credits.scrollTop
      const to = from + lineH()
      const t0 = performance.now()
      const dur = 700
      const frame = (now) => {
        const k = Math.min(1, (now - t0) / dur)
        credits.scrollTop = from + (to - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
        if (k < 1) raf = requestAnimationFrame(frame)
        else if (credits.scrollTop >= total * lineH() - 1) credits.scrollTop = 0
      }
      raf = requestAnimationFrame(frame)
    }
    if (box) {
      box.addEventListener("toggle", () => {
        clearInterval(timer)
        cancelAnimationFrame(raf)
        if (!box.open) return
        credits.scrollTop = 0
        if (!credits.dataset.looped) {
          total = credits.children.length
          ;[...credits.children].slice(0, 1).forEach((li) => credits.append(li.cloneNode(true)))
          credits.dataset.looped = "1"
        }
        timer = setInterval(glide, 2200)
      })
    }
  }
})()
