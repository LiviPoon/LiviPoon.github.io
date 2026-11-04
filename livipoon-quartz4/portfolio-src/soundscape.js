/*
soundscape.js — scroll-driven redwood forest soundscape (Web Audio).

Scrolling moves a virtual listener down the redwood (same [data-redwood-stop] mapping
and camera-height keyframes as redwood.js). Each forest layer has its own animals;
calls are placed in 3D around the listener (HRTF panning, distance roll-off, air
absorption low-pass, forest reverb), so the canopy birds drift overhead as you descend.
An ambience bed (wind gusts, canopy rustle, distant creek/surf) is synthesized.

Exposes window.__soundscape = { setMuted(bool), isMuted(), duck(bool) }.
Clips: soundscape/*.m4a, trimmed/levelled from xeno-canto (CC BY-NC-SA 4.0) and
US National Park Service (public domain) recordings; credits rendered into #sound-credits.
*/
;(() => {
  const MUTED_KEY = "siteAudioMuted"
  const H = 56.86 // tree height (m), matches redwood/redwood.json
  const BASE = "./soundscape/"

  // Camera height (fraction of H) over descent t — mirrors KEYS[.][1] in redwood.js
  const CAM_Y = [
    [0.0, 1.1],
    [0.16, 0.97],
    [0.36, 0.78],
    [0.56, 0.5],
    [0.8, 0.22],
    [1.0, 0.03],
  ]

  // Forest layers: centre height (m) and the animals living there.
  const ZONES = {
    sky: { y: 62, label: "Above the crown" },
    canopy: { y: 46, label: "Upper canopy" },
    crown: { y: 30, label: "Crown base & forks" },
    trunk: { y: 15, label: "Mid trunk" },
    floor: { y: 1.5, label: "Forest floor" },
  }

  const XC = "xeno-canto, CC BY-NC-SA 4.0"
  // gain: level trim; dist: [min,max] metres from the listener's axis
  const CLIPS = [
    { id: "murrelet", zone: "sky", name: "Marbled Murrelet", by: "Paul Driver", xc: 1153139, gain: 0.9, dist: [20, 60] },
    { id: "raven", zone: "sky", name: "Common Raven", by: "Greg Irving", xc: 1053943, gain: 0.75, dist: [25, 70] },
    { id: "olive-sided-flycatcher", zone: "sky", name: "Olive-sided Flycatcher", by: "Paul Marvin", xc: 748153, gain: 0.8, dist: [12, 35] },
    { id: "hermit-warbler", zone: "canopy", name: "Hermit Warbler", by: "Paul Marvin", xc: 748361, gain: 0.8, dist: [6, 25] },
    { id: "kinglet", zone: "canopy", name: "Golden-crowned Kinglet", by: "Paul Marvin", xc: 748366, gain: 0.7, dist: [4, 18] },
    { id: "chickadee", zone: "canopy", name: "Chestnut-backed Chickadee", by: "Paul Marvin", xc: 364425, gain: 0.8, dist: [5, 20] },
    { id: "douglas-squirrel", zone: "canopy", name: "Douglas Squirrel", by: "Greg Irving", xc: 1104233, gain: 0.8, dist: [6, 22] },
    { id: "screech-owl", zone: "crown", name: "Western Screech-Owl", by: "Bruce Lagerquist", xc: 533799, gain: 0.8, dist: [10, 35] },
    { id: "stellers-jay", zone: "crown", name: "Steller's Jay", by: "Thomas G. Graves", xc: 731972, gain: 0.75, dist: [8, 30] },
    { id: "pacific-slope-flycatcher", zone: "crown", name: "Pacific-slope Flycatcher", by: "Paul Marvin", xc: 482872, gain: 0.85, dist: [6, 22] },
    { id: "douglas-squirrel-alarm", zone: "crown", name: "Douglas Squirrel (alarm)", by: "Greg Irving", xc: 1181397, gain: 0.75, dist: [8, 28] },
    { id: "pileated-woodpecker", zone: "trunk", name: "Pileated Woodpecker", by: "Jim Berry", xc: 797066, gain: 0.8, dist: [10, 40] },
    { id: "pileated-drum", zone: "trunk", name: "Pileated Woodpecker (drumming)", by: "Ed Pandolfino", xc: 451059, gain: 0.8, dist: [15, 45] },
    { id: "brown-creeper", zone: "trunk", name: "Brown Creeper", by: "Paul Marvin", xc: 744286, gain: 0.85, dist: [3, 14] },
    { id: "varied-thrush", zone: "trunk", name: "Varied Thrush", by: "Steve Hampton", xc: 416081, gain: 0.85, dist: [12, 40] },
    { id: "pacific-wren", zone: "floor", name: "Pacific Wren", by: "Thomas G. Graves", xc: 419951, gain: 0.85, dist: [5, 20] },
    { id: "swainsons-thrush", zone: "floor", name: "Swainson's Thrush", by: "Ed Pandolfino", xc: 1153740, gain: 0.85, dist: [10, 35] },
    { id: "wrentit", zone: "floor", name: "Wrentit", by: "Ed Pandolfino", xc: 442354, gain: 0.75, dist: [10, 30] },
    { id: "elk", zone: "floor", name: "Elk (bugle)", by: "NPS / Yellowstone", src: "US National Park Service, public domain", url: "https://www.nps.gov/yell/learn/photosmultimedia/sounds-elk.htm", gain: 0.7, dist: [60, 140] },
    { id: "coyote", zone: "floor", name: "Coyote", by: "NPS / Yellowstone", src: "US National Park Service, public domain", url: "https://www.nps.gov/yell/learn/photosmultimedia/sounds-coyote.htm", gain: 0.5, dist: [90, 180] },
  ]

  const MAX_VOICES = 4
  const MAX_PER_ZONE = 2
  const TICK_MS = 100

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const lerp = (a, b, t) => a + (b - a) * t
  const rand = (a, b) => a + Math.random() * (b - a)

  /* ---------------- scroll → listener height ---------------- */
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
  function camHeight(t) {
    for (let i = 1; i < CAM_Y.length; i++)
      if (t <= CAM_Y[i][0]) {
        const [t0, y0] = CAM_Y[i - 1],
          [t1, y1] = CAM_Y[i]
        return lerp(y0, y1, (t - t0) / (t1 - t0)) * H
      }
    return CAM_Y[CAM_Y.length - 1][1] * H
  }
  const zoneWeight = (zone, ly) => Math.exp(-(((ly - ZONES[zone].y) / 12) ** 2))

  /* ---------------- synthesis helpers ---------------- */
  function pinkNoiseBuffer(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < len; i++) {
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
      // crossfade the loop seam
      const f = Math.floor(ctx.sampleRate * 0.25)
      for (let i = 0; i < f; i++) {
        const k = i / f
        d[i] = d[i] * k + d[len - f + i] * (1 - k)
      }
    }
    return buf
  }

  // Forest impulse response: sparse early reflections off trunks, then a diffuse
  // tail (RT60 ≈ 1.6 s) that darkens over time as foliage absorbs the highs.
  function forestImpulse(ctx) {
    const sr = ctx.sampleRate,
      len = Math.floor(sr * 2.2)
    const buf = ctx.createBuffer(2, len, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let k = 0; k < 16; k++) {
        const i = Math.floor(sr * rand(0.008, 0.09))
        d[i] += rand(0.15, 0.55) * (Math.random() < 0.5 ? -1 : 1)
      }
      let lp = 0
      const start = Math.floor(sr * 0.015)
      for (let i = start; i < len; i++) {
        const t = (i - start) / sr
        const fc = lerp(9000, 1200, Math.min(1, t / 1.4))
        const a = Math.exp((-2 * Math.PI * fc) / sr)
        lp = a * lp + (1 - a) * (Math.random() * 2 - 1)
        d[i] += lp * Math.exp(-t / 0.23) * Math.min(1, t / 0.03) * 0.9
      }
    }
    return buf
  }

  /* ---------------- engine ---------------- */
  let ctx = null
  let master, comp, dryBus, reverb, reverbReturn
  let wind, windBand, rustle, rustleHP, creek, creekLP
  const buffers = new Map() // id -> AudioBuffer | Promise
  const voices = new Set()
  let listenerY = camHeight(0)
  let muted = localStorage.getItem(MUTED_KEY) === "true"
  let ducked = false
  let tickTimer = 0
  let gustPhase = Math.random() * 100
  let started = false

  function buildGraph() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ctx = new AC({ latencyHint: "playback" })

    comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 12
    comp.ratio.value = 3
    comp.attack.value = 0.02
    comp.release.value = 0.4
    master = ctx.createGain()
    master.gain.value = 0
    comp.connect(master).connect(ctx.destination)
    // make-up gain: clips are levelled conservatively; bring the scene to a normal listening level
    const pre = ctx.createGain()
    pre.gain.value = 3.2
    pre.connect(comp)

    dryBus = ctx.createGain()
    dryBus.connect(pre)
    reverb = ctx.createConvolver()
    reverb.buffer = forestImpulse(ctx)
    reverbReturn = ctx.createGain()
    reverbReturn.gain.value = 0.6
    reverb.connect(reverbReturn).connect(pre)

    const noise = pinkNoiseBuffer(ctx, 8)
    const loop = (offset) => {
      const s = ctx.createBufferSource()
      s.buffer = noise
      s.loop = true
      s.start(0, offset)
      return s
    }
    // wind through the crown: band-limited noise, gusting
    windBand = ctx.createBiquadFilter()
    windBand.type = "bandpass"
    windBand.frequency.value = 500
    windBand.Q.value = 0.6
    wind = ctx.createGain()
    wind.gain.value = 0
    loop(0).connect(windBand).connect(wind).connect(pre)
    // needle rustle: airy high band
    rustleHP = ctx.createBiquadFilter()
    rustleHP.type = "highpass"
    rustleHP.frequency.value = 3800
    rustle = ctx.createGain()
    rustle.gain.value = 0
    loop(2.7).connect(rustleHP).connect(rustle).connect(pre)
    rustle.connect(reverb)
    // distant creek / surf: low, dark, steady
    creekLP = ctx.createBiquadFilter()
    creekLP.type = "lowpass"
    creekLP.frequency.value = 700
    creekLP.Q.value = 0.3
    creek = ctx.createGain()
    creek.gain.value = 0
    loop(5.1).connect(creekLP).connect(creek).connect(pre)
    creek.connect(reverb)

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
    const p = fetch(BASE + id + ".m4a")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((b) => (buffers.set(id, b), b))
      .catch(() => (buffers.delete(id), null))
    buffers.set(id, p)
    return p
  }

  // nearest layers first, then the rest in the background
  async function preload() {
    const order = CLIPS.slice().sort(
      (a, b) => Math.abs(ZONES[a.zone].y - listenerY) - Math.abs(ZONES[b.zone].y - listenerY),
    )
    for (const c of order) await loadClip(c.id)
  }

  function updateVoiceSpatial(v, now, smooth) {
    const dy = v.y - listenerY
    const dist = Math.hypot(v.x, dy, v.z)
    const p = v.panner
    if (p.positionX) {
      p.positionX.setTargetAtTime(v.x, now, smooth)
      p.positionY.setTargetAtTime(dy, now, smooth)
      p.positionZ.setTargetAtTime(v.z, now, smooth)
    } else p.setPosition(v.x, dy, v.z)
    // air absorption: far calls lose their top end
    v.air.frequency.setTargetAtTime(clamp(19000 * Math.exp(-dist / 55), 1400, 19000), now, smooth)
    v.send.gain.setTargetAtTime(clamp(0.18 + dist / 90, 0.18, 0.85), now, smooth)
    v.zoneGain.gain.setTargetAtTime(0.25 + 0.75 * zoneWeight(v.clip.zone, listenerY), now, 0.4)
  }

  function spawn(clip) {
    const buf = buffers.get(clip.id)
    if (!(buf instanceof AudioBuffer)) return
    const now = ctx.currentTime
    const seg = Math.min(buf.duration, rand(6, 13))
    const offset = rand(0, Math.max(0, buf.duration - seg))
    const az = rand(0, Math.PI * 2)
    const r = rand(clip.dist[0], clip.dist[1])
    const z = ZONES[clip.zone]
    const v = {
      clip,
      x: Math.cos(az) * r,
      z: Math.sin(az) * r,
      y: z.y + rand(-5, 5),
      src: ctx.createBufferSource(),
      env: ctx.createGain(),
      zoneGain: ctx.createGain(),
      air: ctx.createBiquadFilter(),
      panner: ctx.createPanner(),
      send: ctx.createGain(),
    }
    v.src.buffer = buf
    v.src.playbackRate.value = rand(0.985, 1.015) // subtle individual variation
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
    const t = descent()
    listenerY = camHeight(t)
    const h = clamp(listenerY / H, 0, 1.1)

    // listener turns with the camera orbit in redwood.js (-0.35 rad + 120° over the descent)
    const yaw = -0.35 + ((120 * Math.PI) / 180) * t
    const L = ctx.listener
    if (L.forwardX) {
      L.forwardX.setTargetAtTime(-Math.sin(yaw), now, 0.3)
      L.forwardY.setTargetAtTime(0, now, 0.3)
      L.forwardZ.setTargetAtTime(-Math.cos(yaw), now, 0.3)
    } else if (L.setOrientation) L.setOrientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0)

    // ambience bed
    gustPhase += TICK_MS / 1000
    const gust =
      0.55 + 0.25 * Math.sin(gustPhase * 0.21) + 0.15 * Math.sin(gustPhase * 0.53 + 1.3) +
      0.05 * Math.sin(gustPhase * 1.7)
    const top = clamp((h - 0.35) / 0.65, 0, 1)
    wind.gain.setTargetAtTime((0.04 + 0.16 * top) * gust, now, 0.8)
    windBand.frequency.setTargetAtTime(320 + 520 * gust * (0.5 + top), now, 0.8)
    rustle.gain.setTargetAtTime(
      0.012 * (zoneWeight("canopy", listenerY) + 0.6 * zoneWeight("crown", listenerY)) * (0.4 + gust),
      now,
      0.6,
    )
    creek.gain.setTargetAtTime(0.02 + 0.07 * clamp(1 - h / 0.45, 0, 1), now, 1.2)
    // more trunks around you near the ground → denser reverb
    reverbReturn.gain.setTargetAtTime(lerp(0.85, 0.35, clamp(h, 0, 1)), now, 1)

    voices.forEach((v) => updateVoiceSpatial(v, now, 0.15))

    // schedule new calls, weighted by how close each layer is
    if (voices.size >= MAX_VOICES) return
    for (const zone of Object.keys(ZONES)) {
      const w = zoneWeight(zone, listenerY)
      if (w < 0.04) continue
      let inZone = 0
      voices.forEach((v) => v.clip.zone === zone && inZone++)
      if (inZone >= MAX_PER_ZONE) continue
      const rate = inZone ? 0.012 : 0.05 // per tick → a fresh call every ~2–8 s
      if (Math.random() > w * rate) continue
      const playing = new Set([...voices].map((v) => v.clip.id))
      const pool = CLIPS.filter(
        (c) => c.zone === zone && !playing.has(c.id) && buffers.get(c.id) instanceof AudioBuffer,
      )
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
      listenerY = camHeight(descent())
      preload()
      tickTimer = setInterval(tick, TICK_MS)
      applyLevel(3) // slow fade-in, like stepping outside
    } else applyLevel(master.gain.value < 0.05 ? 3 : 0.6)
  }

  function suspendSoon() {
    if (!ctx) return
    applyLevel(0.4)
    setTimeout(() => {
      if ((muted || document.visibilityState === "hidden") && ctx.state === "running") ctx.suspend()
    }, 500)
  }

  // browsers need a user gesture before audio may start
  const unlock = () => {
    start()
    if (ctx && ctx.state === "running")
      ["pointerdown", "keydown", "touchend"].forEach((e) => removeEventListener(e, unlock, true))
  }
  ;["pointerdown", "keydown", "touchend"].forEach((e) => addEventListener(e, unlock, true))
  start() // works immediately if the page already has user activation

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
      listenerY: +listenerY.toFixed(1),
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
    for (const zone of Object.keys(ZONES)) {
      const li = document.createElement("li")
      const head = document.createElement("strong")
      head.textContent = ZONES[zone].label + ": "
      li.append(head)
      CLIPS.filter((c) => c.zone === zone).forEach((c, i, arr) => {
        const a = document.createElement("a")
        a.href = c.xc ? `https://xeno-canto.org/${c.xc}` : c.url
        a.target = "_blank"
        a.rel = "noopener"
        a.textContent = `${c.name} (${c.by}${c.xc ? `, XC${c.xc}` : ""})`
        li.append(a, document.createTextNode(i < arr.length - 1 ? ", " : ""))
      })
      credits.append(li)
    }
    const note = document.createElement("li")
    note.textContent = `Recordings via ${XC}; elk & coyote: US National Park Service (public domain). Clips trimmed, noise-reduced and levelled; the trimmed clips are shared under CC BY-NC-SA 4.0.`
    credits.append(note)
  }
})()
