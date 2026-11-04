/*
halfdome-soundscape.js — scroll-driven Yosemite soundscape for the CV page (Web Audio).
Sibling of catalina-soundscape.js; same engine, Half Dome layers.

Scrolling flies a virtual listener along the camera path in halfdome.js
(window.HalfDome.eyeAt): along the valley forest, up the granite face, over the summit.
Each layer (summit & sky, granite face, valley forest) has its own animals; calls are
placed in 3D around the listener (HRTF panning, distance roll-off, air absorption,
granite-wall echoes). Ambience is synthesized: a river down in the valley and wind up high.

Exposes window.__soundscape = { setMuted(bool), isMuted(), duck(bool) } (same API as
soundscape.js, so the nav mute button in app.js works unchanged).
Clips are reused from soundscape/ (redwood) and catalina/sounds/ (all Sierra Nevada species);
credits render into #sound-credits.
*/
;(() => {
  const MUTED_KEY = "siteAudioMuted"
  const RW = "/soundscape/"
  const CA = "/catalina/sounds/"

  // Layers: typical listener height (metres above the scan's lowest point, see
  // halfdome.json) where the layer is loudest. Weighted in log-altitude.
  const ZONES = {
    sky: { y: 2100, label: "Summit & sky" },
    face: { y: 1100, label: "Granite face" },
    forest: { y: 300, label: "Valley forest" },
  }

  // gain: level trim; dist: [min,max] metres from the listener
  const CLIPS = [
    { id: "raven", dir: RW, zone: "sky", name: "Common Raven", by: "Greg Irving", xc: 1053943, gain: 0.75, dist: [25, 70] },
    { id: "red-tailed-hawk", dir: CA, zone: "sky", name: "Red-tailed Hawk", by: "Paul Marvin", xc: 577037, gain: 0.65, dist: [40, 120] },
    { id: "american-kestrel", dir: CA, zone: "sky", name: "American Kestrel", by: "Paul Marvin", xc: 483212, gain: 0.65, dist: [20, 60] },
    { id: "vauxs-swift", dir: RW, zone: "sky", name: "Vaux's Swift", by: "Dave Miller", xc: 986891, gain: 0.75, dist: [10, 35] },
    { id: "olive-sided-flycatcher", dir: RW, zone: "sky", name: "Olive-sided Flycatcher", by: "Paul Marvin", xc: 748153, gain: 0.8, dist: [12, 35] },
    { id: "rock-wren", dir: CA, zone: "face", name: "Rock Wren", by: "Paul Marvin", xc: 801382, gain: 0.75, dist: [8, 35] },
    { id: "dark-eyed-junco", dir: RW, zone: "face", name: "Dark-eyed Junco", by: "Manuel Grosselet & Kristine Taylor", xc: 1082015, gain: 0.75, dist: [6, 25] },
    { id: "mountain-quail", dir: RW, zone: "face", name: "Mountain Quail", by: "Jay Carroll", xc: 343585, gain: 0.75, dist: [15, 45] },
    { id: "northern-flicker", dir: RW, zone: "face", name: "Northern Flicker", by: "Ed Pandolfino", xc: 1007124, gain: 0.75, dist: [12, 40] },
    { id: "band-tailed-pigeon", dir: RW, zone: "face", name: "Band-tailed Pigeon", by: "Paul Marvin", xc: 153414, gain: 0.8, dist: [10, 35] },
    { id: "stellers-jay", dir: RW, zone: "forest", name: "Steller's Jay", by: "Thomas G. Graves", xc: 731972, gain: 0.75, dist: [8, 30] },
    { id: "western-tanager", dir: RW, zone: "forest", name: "Western Tanager", by: "Paul Marvin", xc: 744258, gain: 0.8, dist: [8, 30] },
    { id: "hermit-thrush", dir: RW, zone: "forest", name: "Hermit Thrush", by: "AUDEVARD Aurélien", xc: 1048898, gain: 0.85, dist: [10, 35] },
    { id: "pileated-woodpecker", dir: RW, zone: "forest", name: "Pileated Woodpecker", by: "Jim Berry", xc: 797066, gain: 0.8, dist: [10, 40] },
    { id: "red-breasted-nuthatch", dir: RW, zone: "forest", name: "Red-breasted Nuthatch", by: "Andrew Spencer", xc: 110382, gain: 0.75, dist: [5, 20] },
    { id: "brown-creeper", dir: RW, zone: "forest", name: "Brown Creeper", by: "Paul Marvin", xc: 744286, gain: 0.85, dist: [3, 14] },
    { id: "hairy-woodpecker", dir: RW, zone: "forest", name: "Hairy Woodpecker", by: "Greg Irving", xc: 1025552, gain: 0.75, dist: [8, 30] },
    { id: "douglas-squirrel", dir: RW, zone: "forest", name: "Douglas Squirrel", by: "Greg Irving", xc: 1104233, gain: 0.8, dist: [6, 22] },
    { id: "coyote", dir: RW, zone: "forest", name: "Coyote", by: "NPS / Yellowstone", src: "US National Park Service, public domain", url: "https://www.nps.gov/yell/learn/photosmultimedia/sounds-coyote.htm", gain: 0.5, dist: [90, 180] },
  ]

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
  // listener height + heading from the camera path in halfdome.js
  function pose(t) {
    const C = window.HalfDome
    if (!C) return { y: lerp(1100, 2300, t), yaw: 0 }
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

  // Granite walls: a handful of late, discrete slap echoes and a darker, longer tail.
  function wallImpulse(ctx) {
    const sr = ctx.sampleRate,
      len = Math.floor(sr * 2.2)
    const buf = ctx.createBuffer(2, len, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let k = 0; k < 7; k++) {
        const i = Math.floor(sr * rand(0.12, 0.9))
        d[i] += rand(0.06, 0.24) * (Math.random() < 0.5 ? -1 : 1)
      }
      let lp = 0
      const start = Math.floor(sr * 0.03)
      for (let i = start; i < len; i++) {
        const t = (i - start) / sr
        const fc = lerp(5000, 900, Math.min(1, t / 1.4))
        const a = Math.exp((-2 * Math.PI * fc) / sr)
        lp = a * lp + (1 - a) * (Math.random() * 2 - 1)
        d[i] += lp * Math.exp(-t / 0.32) * Math.min(1, t / 0.05) * 0.6
      }
    }
    return buf
  }

  /* ---------------- engine ---------------- */
  let ctx = null
  let master, dryBus, reverb, reverbReturn, amb
  let wind, windBand, river, riverLP, riverHiss
  const buffers = new Map()
  const voices = new Set()
  let listener = pose(0)
  let muted = localStorage.getItem(MUTED_KEY) === "true"
  let ducked = false
  let tickTimer = 0
  let gustPhase = Math.random() * 100
  let started = false

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
    reverb.buffer = wallImpulse(ctx)
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
    // river in the valley: low rumble + a little bright water hiss
    riverLP = ctx.createBiquadFilter()
    riverLP.type = "lowpass"
    riverLP.frequency.value = 700
    river = ctx.createGain()
    river.gain.value = 0
    loop(noise, 3.3).connect(riverLP).connect(river).connect(amb)
    const hissBand = ctx.createBiquadFilter()
    hissBand.type = "bandpass"
    hissBand.frequency.value = 2600
    hissBand.Q.value = 0.8
    riverHiss = ctx.createGain()
    riverHiss.gain.value = 0
    loop(noise, 5.1).connect(hissBand).connect(riverHiss).connect(amb)

    const L = ctx.listener
    if (L.upX) {
      L.upX.value = 0
      L.upY.value = 1
      L.upZ.value = 0
    }
    return true
  }

  function loadClip(id) {
    if (buffers.has(id)) return buffers.get(id)
    const p = fetch((CLIPS.find((c) => c.id === id) || { dir: RW }).dir + id + ".m4a")
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
    const high = clamp((lg(ly) - lg(700)) / (lg(2300) - lg(700)), 0, 1) // 0 low … 1 above the summit
    const low = clamp((lg(1100) - lg(ly)) / (lg(1100) - lg(300)), 0, 1) // 0 mid-face … 1 valley floor
    wind.gain.setTargetAtTime(AMBIENCE * (0.03 + 0.2 * high) * gust, now, 0.8)
    windBand.frequency.setTargetAtTime(300 + 500 * gust * (0.5 + high), now, 0.8)
    // river: a faint wash heard from the face, full on the valley floor
    const riverLvl = AMBIENCE * (0.025 + 0.12 * low * low)
    river.gain.setTargetAtTime(riverLvl, now, 1.2)
    riverHiss.gain.setTargetAtTime(riverLvl * 0.35, now, 1.2)
    riverLP.frequency.setTargetAtTime(500 + 400 * low, now, 1.2)
    reverbReturn.gain.setTargetAtTime(lerp(0.2, 0.5, 1 - high), now, 1)

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
      const list = CLIPS.filter((c) => c.zone === zone)
      if (!list.length) continue
      const li = document.createElement("li")
      const head = document.createElement("strong")
      head.textContent = ZONES[zone].label + ": "
      li.append(head)
      list.forEach((c, i) => li.append(link(c), document.createTextNode(i < list.length - 1 ? ", " : "")))
      credits.append(li)
    }
    const note = document.createElement("li")
    note.textContent =
      "Bird & squirrel recordings via xeno-canto (CC BY-NC-SA 3.0/4.0); coyote: US National Park Service (public domain); river and wind are synthesized. Clips trimmed, noise-reduced and levelled; the edited clips are shared under CC BY-NC-SA 4.0."
    credits.append(note)
  }
})()
