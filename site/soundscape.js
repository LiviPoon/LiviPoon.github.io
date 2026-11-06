/*
soundscape.js — scroll-driven redwood forest soundscape (Web Audio).

Scrolling moves a virtual listener down the redwood (same [data-redwood-stop] mapping
and camera-height keyframes as redwood.js). Each forest layer has its own animals;
calls are placed in 3D around the listener (HRTF panning, distance roll-off, air
absorption low-pass, forest reverb), so the canopy birds drift overhead as you descend.
New calls are spread around the head (each spawn picks the direction farthest from
recent/active calls); flying species move along arcs; some calls get an answer from
another individual on the far side. Per-call pitch, level, length and envelope vary,
and overall activity swells and lulls.
An ambience bed (wind gusts, canopy rustle, distant creek/surf) is synthesized as several
HRTF point sources around the listener: wind sources gust independently and gust fronts
sweep across the head; the creek is anchored in one world direction (and below you when
high up); occasional twigs/needles patter down past you.

A radio at the foot of the trunk plays a looping song through an AM-radio filter; it is placed
relative to the orbiting camera, so it swells toward the base and fades far away up the crown.
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

  // Camera distance from the trunk axis, mirror of KEYS columns [t, a, b, c] in redwood.js
  // (dist = max(1.8*r+0.5, a*crownRadius + b*trunkRadius + c*H)); used to place the radio.
  const CAM_DIST = [
    [0.0, 1.0, 0, 0.5],
    [0.16, 1.0, 0, 0.36],
    [0.36, 1.0, 0, 0.34],
    [0.56, 1.0, 0, 0.28],
    [0.8, 0.4, 2, 0.2],
    [1.0, 0, 2, 0.15],
  ]
  const CROWN_R = 11.5
  const ORBIT_START = -0.35
  const ORBIT_TOTAL = (120 * Math.PI) / 180

  // The radio sits at the foot of the trunk and plays a looping song through a "radio" filter.
  // Drop the recording at site/soundscape/good-vibrations.m4a (it is not bundled: copyrighted).
  const RADIO = {
    src: BASE + "good-vibrations.m4a",
    az: 0.85, // world azimuth (rad) of the radio around the trunk; camera orbit spans -0.35…1.75
    off: 5, // m from the trunk axis
    height: 0.4, // m above the ground
    level: 0.42, // loudness at the reference distance (radio bypasses the 3.2x make-up gain)
    refDist: 7, // m: closest the camera gets ends up about here
    rolloff: 1.25, // how fast it fades with distance
  }

  // Forest layers: centre height (m) and the animals living there.
  const ZONES = {
    sky: { y: 62, label: "Above the crown" },
    canopy: { y: 46, label: "Upper canopy" },
    crown: { y: 30, label: "Crown base & forks" },
    trunk: { y: 15, label: "Mid trunk" },
    floor: { y: 1.5, label: "Forest floor" },
  }

  const XC = "xeno-canto, CC BY-NC-SA 4.0"
  // gain: level trim; dist: [min,max] metres from the listener's axis;
  // fly: flight speed (m/s) — the call moves along an arc around the listener;
  // duet: chance another individual answers from the far side (default DUET)
  const CLIPS = [
    { id: "murrelet", zone: "sky", name: "Marbled Murrelet", by: "Paul Driver", xc: 1153139, gain: 0.9, dist: [20, 60], fly: 9 },
    { id: "raven", zone: "sky", name: "Common Raven", by: "Greg Irving", xc: 1053943, gain: 0.75, dist: [25, 70], fly: 6 },
    { id: "olive-sided-flycatcher", zone: "sky", name: "Olive-sided Flycatcher", by: "Paul Marvin", xc: 748153, gain: 0.8, dist: [12, 35] },
    { id: "red-tailed-hawk", zone: "sky", name: "Red-tailed Hawk", by: "Paul Marvin", xc: 805876, gain: 0.7, dist: [30, 80], fly: 5, duet: 0.1 },
    { id: "osprey", zone: "sky", name: "Osprey", by: "Bruce Lagerquist", xc: 343728, gain: 0.7, dist: [25, 70], fly: 5, duet: 0.1 },
    { id: "vauxs-swift", zone: "sky", name: "Vaux's Swift", by: "Dave Miller", xc: 986891, gain: 0.75, dist: [10, 35], fly: 11 },
    { id: "hermit-warbler", zone: "canopy", name: "Hermit Warbler", by: "Paul Marvin", xc: 748361, gain: 0.8, dist: [6, 25] },
    { id: "kinglet", zone: "canopy", name: "Golden-crowned Kinglet", by: "Paul Marvin", xc: 748366, gain: 0.7, dist: [4, 18] },
    { id: "chickadee", zone: "canopy", name: "Chestnut-backed Chickadee", by: "Paul Marvin", xc: 364425, gain: 0.8, dist: [5, 20] },
    { id: "douglas-squirrel", zone: "canopy", name: "Douglas Squirrel", by: "Greg Irving", xc: 1104233, gain: 0.8, dist: [6, 22] },
    { id: "townsends-warbler", zone: "canopy", name: "Townsend's Warbler", by: "Paul Marvin", xc: 710935, gain: 0.75, dist: [6, 22] },
    { id: "western-tanager", zone: "canopy", name: "Western Tanager", by: "Paul Marvin", xc: 744258, gain: 0.8, dist: [8, 30] },
    { id: "red-breasted-nuthatch", zone: "canopy", name: "Red-breasted Nuthatch", by: "Andrew Spencer", xc: 110382, gain: 0.75, dist: [5, 20] },
    { id: "band-tailed-pigeon", zone: "canopy", name: "Band-tailed Pigeon", by: "Paul Marvin", xc: 153414, gain: 0.8, dist: [10, 35], fly: 5 },
    { id: "screech-owl", zone: "crown", name: "Western Screech-Owl", by: "Bruce Lagerquist", xc: 533799, gain: 0.8, dist: [10, 35], duet: 0.5 },
    { id: "stellers-jay", zone: "crown", name: "Steller's Jay", by: "Thomas G. Graves", xc: 731972, gain: 0.75, dist: [8, 30] },
    { id: "pacific-slope-flycatcher", zone: "crown", name: "Pacific-slope Flycatcher", by: "Paul Marvin", xc: 482872, gain: 0.85, dist: [6, 22] },
    { id: "douglas-squirrel-alarm", zone: "crown", name: "Douglas Squirrel (alarm)", by: "Greg Irving", xc: 1181397, gain: 0.75, dist: [8, 28] },
    { id: "great-horned-owl", zone: "crown", name: "Great Horned Owl", by: "Paul Marvin", xc: 746053, gain: 0.85, dist: [15, 50], duet: 0.5 },
    { id: "saw-whet-owl", zone: "crown", name: "Northern Saw-whet Owl", by: "Tom Ford-Hutchinson", xc: 806304, gain: 0.75, dist: [12, 40], duet: 0.5 },
    { id: "huttons-vireo", zone: "crown", name: "Hutton's Vireo", by: "Ron Overholtz", xc: 557114, gain: 0.75, dist: [6, 25] },
    { id: "pileated-woodpecker", zone: "trunk", name: "Pileated Woodpecker", by: "Jim Berry", xc: 797066, gain: 0.8, dist: [10, 40] },
    { id: "pileated-drum", zone: "trunk", name: "Pileated Woodpecker (drumming)", by: "Ed Pandolfino", xc: 451059, gain: 0.8, dist: [15, 45] },
    { id: "brown-creeper", zone: "trunk", name: "Brown Creeper", by: "Paul Marvin", xc: 744286, gain: 0.85, dist: [3, 14] },
    { id: "varied-thrush", zone: "trunk", name: "Varied Thrush", by: "Steve Hampton", xc: 416081, gain: 0.85, dist: [12, 40] },
    { id: "hairy-woodpecker", zone: "trunk", name: "Hairy Woodpecker", by: "Greg Irving", xc: 1025552, gain: 0.75, dist: [8, 30] },
    { id: "northern-flicker", zone: "trunk", name: "Northern Flicker", by: "Ed Pandolfino", xc: 1007124, gain: 0.75, dist: [12, 40] },
    { id: "barred-owl", zone: "trunk", name: "Barred Owl", by: "Anthony Gliozzo", xc: 801161, gain: 0.8, dist: [15, 50], duet: 0.5 },
    { id: "pacific-wren", zone: "floor", name: "Pacific Wren", by: "Thomas G. Graves", xc: 419951, gain: 0.85, dist: [5, 20] },
    { id: "swainsons-thrush", zone: "floor", name: "Swainson's Thrush", by: "Ed Pandolfino", xc: 1153740, gain: 0.85, dist: [10, 35] },
    { id: "wrentit", zone: "floor", name: "Wrentit", by: "Ed Pandolfino", xc: 442354, gain: 0.75, dist: [10, 30] },
    { id: "pacific-treefrog", zone: "floor", name: "Pacific Treefrog", by: "Greg Irving", xc: 1097627, gain: 0.7, dist: [8, 30] },
    { id: "mountain-quail", zone: "floor", name: "Mountain Quail", by: "Jay Carroll", xc: 343585, gain: 0.75, dist: [15, 45] },
    { id: "spotted-towhee", zone: "floor", name: "Spotted Towhee", by: "Ed Pandolfino", xc: 875432, gain: 0.75, dist: [8, 30] },
    { id: "wilsons-warbler", zone: "floor", name: "Wilson's Warbler", by: "Thomas G. Graves", xc: 817101, gain: 0.75, dist: [5, 22] },
    { id: "hermit-thrush", zone: "floor", name: "Hermit Thrush", by: "AUDEVARD Aurélien", xc: 1048898, gain: 0.85, dist: [10, 35] },
    { id: "dark-eyed-junco", zone: "floor", name: "Dark-eyed Junco", by: "Manuel Grosselet & Kristine Taylor", xc: 1082015, gain: 0.75, dist: [6, 25] },
    { id: "elk", zone: "floor", name: "Elk (bugle)", by: "NPS / Yellowstone", src: "US National Park Service, public domain", url: "https://www.nps.gov/yell/learn/photosmultimedia/sounds-elk.htm", gain: 0.7, dist: [60, 140] },
    { id: "coyote", zone: "floor", name: "Coyote", by: "NPS / Yellowstone", src: "US National Park Service, public domain", url: "https://www.nps.gov/yell/learn/photosmultimedia/sounds-coyote.htm", gain: 0.5, dist: [90, 180], duet: 0.45 },
  ]

  const AMBIENCE = 0.3 // level of the synthesized wind/rustle/creek bed
  const MAX_VOICES = 6
  const MAX_PER_ZONE = 2
  const DUET = 0.22 // default chance a call is answered by a second individual
  const WIND_N = 4 // wind point sources around the listener
  const RUSTLE_N = 3 // needle-rustle point sources
  const TICK_MS = 100

  const TAU = Math.PI * 2
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const lerp = (a, b, t) => a + (b - a) * t
  const rand = (a, b) => a + Math.random() * (b - a)
  const angDist = (a, b) => Math.abs(((((a - b) % TAU) + TAU * 1.5) % TAU) - Math.PI)

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
  function camDist(t) {
    let i = 1
    while (i < CAM_DIST.length - 1 && t > CAM_DIST[i][0]) i++
    const a = CAM_DIST[i - 1],
      b = CAM_DIST[i]
    const u = clamp((t - a[0]) / (b[0] - a[0]), 0, 1)
    const v = (k) => lerp(a[k], b[k], u)
    return Math.max(1.8 * 1.3 + 0.5, v(1) * CROWN_R + v(2) * 1.3 + v(3) * H)
  }
  const zoneWeight = (zone, ly) => Math.exp(-(((ly - ZONES[zone].y) / 12) ** 2))

  /* ---------------- synthesis helpers ---------------- */
  function pinkNoiseBuffer(ctx, seconds, channels = 2) {
    const len = Math.floor(ctx.sampleRate * seconds)
    const f = Math.floor(ctx.sampleRate * 0.5) // seam crossfade length
    const buf = ctx.createBuffer(channels, len, ctx.sampleRate)
    for (let ch = 0; ch < channels; ch++) {
      const out = buf.getChannelData(ch)
      const d = new Float32Array(len + f) // generate extra tail for a seamless wrap
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
      // Seamless loop: the head fades in while the tail (which continues on from
      // sample len-1) fades out, so the wrap is continuous. Equal-power curves keep
      // uncorrelated noise at constant loudness (a linear fade dips ~3 dB).
      out.set(d.subarray(0, len))
      for (let i = 0; i < f; i++) {
        const k = ((i / f) * Math.PI) / 2
        out[i] = d[i] * Math.sin(k) + d[len + i] * Math.cos(k)
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
  let master, comp, dryBus, reverb, reverbReturn, tickBuf
  let bed = [] // ambience point sources: { kind, filter, gain, panner, ang, dy, phase }
  const buffers = new Map() // id -> AudioBuffer | Promise
  const voices = new Set()
  const recentPhi = [] // world azimuths of recent spawns, to keep calls spread around the head
  let windRot = Math.random() * TAU // slow drift of the wind field
  let sweep = null // a gust front crossing the listener
  let nextSweep = rand(12, 30)
  let lastTick = 0
  let yawNow = 0
  let listenerY = camHeight(0)
  let muted = localStorage.getItem(MUTED_KEY) === "true"
  let ducked = false
  let tickTimer = 0
  let gustPhase = Math.random() * 100
  let started = false
  let radio = null // { el, filter nodes, gain, panner, send }

  function buildRadio() {
    const el = new Audio()
    el.src = RADIO.src
    el.loop = true
    el.preload = "auto"
    el.crossOrigin = "anonymous"
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

  function updateRadio(t, now, yaw) {
    if (!radio || !radio.ok) return
    // camera eye = trunk base + (sin az, camY, cos az) * dist  →  radio relative to the listener
    const az = ORBIT_START + ORBIT_TOTAL * t
    const d = camDist(t)
    // The camera always faces the trunk, so a radio exactly on the axis would sit dead ahead and
    // never seem to move. It stands beside the trunk instead, so it swings across the view as
    // the camera orbits (and passes right in front of you mid-orbit).
    const rx = Math.sin(RADIO.az) * RADIO.off - Math.sin(az) * d,
      rz = Math.cos(RADIO.az) * RADIO.off - Math.cos(az) * d,
      ry = RADIO.height - listenerY
    const range = Math.hypot(rx, ry, rz)
    setPos(radio.panner, rx, ry, rz, now, 0.3) // same time constant as the listener turn: no direction lag
    // gain falls with distance: loud at the foot, a faint far-off station at the crown
    const g = RADIO.level * Math.pow(clamp(RADIO.refDist / range, 0, 1.5), RADIO.rolloff)
    radio.gain.gain.setTargetAtTime(g, now, 0.25)
    // farther = duller and wetter
    const far = clamp((range - RADIO.refDist) / 60, 0, 1)
    radio.dist.frequency.setTargetAtTime(lerp(3400, 2200, far), now, 0.3)
    radio.send.gain.setTargetAtTime(lerp(0.03, 0.14, far), now, 0.3) // mostly dry: reverb smears direction
  }

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
    // ambience bypasses the compressor so loud calls don't pump it down
    const amb = ctx.createGain()
    amb.gain.value = pre.gain.value
    amb.connect(master)

    dryBus = ctx.createGain()
    dryBus.connect(pre)
    reverb = ctx.createConvolver()
    reverb.buffer = forestImpulse(ctx)
    reverbReturn = ctx.createGain()
    reverbReturn.gain.value = 0.6
    reverb.connect(reverbReturn).connect(pre)

    // Ambience bed: mono noise loops (different offsets → decorrelated), each an HRTF
    // point source. Roll-off is off, so the panners only add direction, not level.
    const noise = pinkNoiseBuffer(ctx, 8, 1)
    let off = 0
    const addBed = (kind, filter, ang, dy) => {
      const s = ctx.createBufferSource()
      s.buffer = noise
      s.loop = true
      s.start(0, (off = (off + 1.37) % 8))
      const gain = ctx.createGain()
      gain.gain.value = 0
      const panner = ctx.createPanner()
      Object.assign(panner, { panningModel: "HRTF", distanceModel: "linear", rolloffFactor: 0 })
      s.connect(filter).connect(gain).connect(panner).connect(amb)
      const b = { kind, filter, gain, panner, ang, dy, phase: rand(0, 100) }
      bed.push(b)
      return b
    }
    const filt = (type, f, q) => {
      const n = ctx.createBiquadFilter()
      n.type = type
      n.frequency.value = f
      n.Q.value = q
      return n
    }
    // wind through the crown: band-limited noise, each source gusting on its own
    for (let i = 0; i < WIND_N; i++)
      addBed("wind", filt("bandpass", 500, 0.6), (i / WIND_N) * TAU + rand(-0.4, 0.4), rand(-2, 6))
    // needle rustle: airy high band, a few patches of foliage
    for (let i = 0; i < RUSTLE_N; i++)
      addBed("rustle", filt("highpass", rand(3400, 4600), 0.7), (i / RUSTLE_N) * TAU + rand(-0.5, 0.5), rand(-3, 3))
        .gain.connect(reverb)
    // distant creek / surf: low, dark, steady, anchored in one world direction
    addBed("creek", filt("lowpass", 700, 0.3), rand(0, TAU), 0).gain.connect(reverb)

    // short noise grain for twig / needle drops
    tickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
    const td = tickBuf.getChannelData(0)
    for (let i = 0; i < td.length; i++) td[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.006))

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

  // World azimuth phi: x = sin(phi), z = -cos(phi) (phi = -yaw is straight ahead).
  function setPos(p, x, y, z, now, smooth) {
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, now, smooth)
      p.positionY.setTargetAtTime(y, now, smooth)
      p.positionZ.setTargetAtTime(z, now, smooth)
    } else p.setPosition(x, y, z)
  }
  function voicePos(v, now) {
    const dt = now - v.t0
    const phi = v.phi + v.omega * dt
    const r = Math.max(3, v.r + v.vr * dt)
    return { phi, r, x: Math.sin(phi) * r, z: -Math.cos(phi) * r, y: Math.max(0.3, v.y + v.vy * dt) }
  }

  function updateVoiceSpatial(v, now, smooth) {
    const P = voicePos(v, now)
    const dy = P.y - listenerY
    const dist = Math.hypot(P.r, dy)
    setPos(v.panner, P.x, dy, P.z, now, smooth)
    // air absorption: far calls lose their top end
    v.air.frequency.setTargetAtTime(clamp(19000 * Math.exp(-dist / 55), 1400, 19000), now, smooth)
    v.send.gain.setTargetAtTime(clamp(0.18 + dist / 90, 0.18, 0.85), now, smooth)
    v.zoneGain.gain.setTargetAtTime(0.25 + 0.75 * zoneWeight(v.clip.zone, listenerY), now, 0.4)
  }

  // Pick the direction farthest from active and recent calls, so the scene fills the
  // whole sphere (front, back, both sides) instead of piling up on one side.
  function pickAzimuth(now) {
    const taken = [...voices].map((v) => voicePos(v, now).phi).concat(recentPhi)
    let best = rand(0, TAU),
      bestScore = -1
    for (let k = 0; taken.length && k < 12; k++) {
      const c = rand(0, TAU)
      const s = Math.min(...taken.map((a) => angDist(c, a)))
      if (s > bestScore) (best = c), (bestScore = s)
    }
    return best
  }

  // opt: { phi, rMul, answer } — answers come from a second individual elsewhere
  function spawn(clip, opt = {}) {
    const buf = buffers.get(clip.id)
    if (!(buf instanceof AudioBuffer) || voices.size >= MAX_VOICES) return
    const now = ctx.currentTime
    const seg = Math.min(buf.duration, rand(opt.answer ? 3 : 4, opt.answer ? 8 : 14))
    const offset = rand(0, Math.max(0, buf.duration - seg))
    const phi = opt.phi ?? pickAzimuth(now)
    recentPhi.push(phi)
    if (recentPhi.length > 5) recentPhi.shift()
    const r = rand(clip.dist[0], clip.dist[1]) * (opt.rMul || 1)
    const z = ZONES[clip.zone]
    const spread = clip.zone === "floor" ? [-1, 4] : [-8, 8]
    // flyers travel along an arc (either direction), drifting in range and height
    const speed = clip.fly ? clip.fly * rand(0.6, 1.3) : 0
    const v = {
      clip,
      t0: now,
      phi,
      r,
      omega: speed ? (speed / r) * (Math.random() < 0.5 ? -1 : 1) : 0,
      vr: speed ? rand(-0.15, 0.15) * speed : 0,
      vy: speed ? rand(-0.1, 0.1) * speed : 0,
      y: z.y + rand(spread[0], spread[1]),
      src: ctx.createBufferSource(),
      env: ctx.createGain(),
      zoneGain: ctx.createGain(),
      air: ctx.createBiquadFilter(),
      panner: ctx.createPanner(),
      send: ctx.createGain(),
    }
    v.src.buffer = buf
    v.src.playbackRate.value = rand(0.97, 1.03) // individual voice (pitch/tempo) variation
    v.air.type = "lowpass"
    Object.assign(v.panner, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 8,
      rolloffFactor: 0.9,
      maxDistance: 400,
    })
    const peak = clip.gain * 0.9 * rand(0.7, 1.1)
    const att = rand(0.15, 1.2),
      rel = rand(0.6, 2.2)
    v.env.gain.setValueAtTime(0, now)
    v.env.gain.linearRampToValueAtTime(peak, now + att)
    v.env.gain.setValueAtTime(peak, now + Math.max(att, seg - rel))
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

    // call and response: another individual answers from the far side, a bit farther off
    if (!opt.answer && Math.random() < (clip.duet ?? DUET))
      setTimeout(() => {
        if (ctx.state === "running" && !muted)
          spawn(clip, { phi: phi + Math.PI + rand(-0.8, 0.8), rMul: rand(1.1, 1.7), answer: true })
      }, rand(1.5, 5) * 1000)
  }

  // A twig or a few needles falling through the branches past the listener.
  function twigDrop(now) {
    const phi = rand(0, TAU),
      r = rand(2, 9),
      y0 = rand(3, 9)
    const n = 1 + Math.floor(rand(1, 5))
    let t = now
    for (let i = 0; i < n; i++) {
      const s = ctx.createBufferSource()
      s.buffer = tickBuf
      s.playbackRate.value = rand(0.7, 1.4)
      const bp = ctx.createBiquadFilter()
      bp.type = "bandpass"
      bp.frequency.value = rand(1600, 4800)
      bp.Q.value = rand(1.5, 4)
      const g = ctx.createGain()
      g.gain.value = rand(0.03, 0.08) * (1 - (0.5 * i) / n)
      const p = ctx.createPanner()
      Object.assign(p, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 3, rolloffFactor: 1 })
      // each tap is lower than the last: it falls past you
      setPos(p, Math.sin(phi) * r, y0 - (i / n) * (y0 + 4), -Math.cos(phi) * r, t, 0.001)
      s.connect(bp).connect(g).connect(p).connect(dryBus)
      g.connect(reverb)
      s.start(t)
      s.onended = () => (p.disconnect(), g.disconnect())
      t += rand(0.08, 0.32)
    }
  }

  function tick() {
    if (!ctx || ctx.state !== "running") return
    const now = ctx.currentTime
    const t = descent()
    listenerY = camHeight(t)
    const h = clamp(listenerY / H, 0, 1.1)

    // listener turns with the camera orbit in redwood.js (-0.35 rad + 120° over the descent)
    const yaw = -0.35 + ((120 * Math.PI) / 180) * t
    yawNow = yaw
    const L = ctx.listener
    if (L.forwardX) {
      L.forwardX.setTargetAtTime(-Math.sin(yaw), now, 0.3)
      L.forwardY.setTargetAtTime(0, now, 0.3)
      L.forwardZ.setTargetAtTime(-Math.cos(yaw), now, 0.3)
    } else if (L.setOrientation) L.setOrientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0)

    updateRadio(t, now, yaw)

    // ambience bed
    const dt = lastTick ? clamp(now - lastTick, 0, 0.5) : TICK_MS / 1000
    lastTick = now
    gustPhase += dt
    windRot += dt * 0.025 // the whole wind field slowly turns around you
    // gentle swells (≈0.35–0.95), never dropping out; p offsets give each source its own gusts
    const gustAt = (p) =>
      0.65 + 0.17 * Math.sin((gustPhase + p) * 0.21) + 0.1 * Math.sin((gustPhase + p) * 0.53 + 1.3) +
      0.03 * Math.sin((gustPhase + p) * 1.7)
    // occasionally a gust front sweeps across the head from one side to the other
    if (!sweep && gustPhase > nextSweep)
      sweep = { t0: gustPhase, dur: rand(3, 7), from: rand(0, TAU), dir: Math.random() < 0.5 ? -1 : 1, amt: rand(0.5, 1.1) }
    let sweepEnv = 0,
      sweepAng = 0
    if (sweep) {
      const pr = (gustPhase - sweep.t0) / sweep.dur
      if (pr >= 1) (sweep = null), (nextSweep = gustPhase + rand(18, 55))
      else (sweepEnv = Math.sin(Math.PI * pr) * sweep.amt), (sweepAng = sweep.from + sweep.dir * Math.PI * pr)
    }
    const boost = (ang) => 1 + sweepEnv * Math.max(0, Math.cos(ang - sweepAng)) ** 2

    const top = clamp((h - 0.35) / 0.65, 0, 1)
    const rustleLvl = zoneWeight("canopy", listenerY) + 0.6 * zoneWeight("crown", listenerY)
    // AMBIENCE scales the whole bed (0.3 ≈ −10 dB) so animal calls sit clearly above it.
    // Sources are uncorrelated, so per-source gain is divided by √N to keep the total level.
    for (const b of bed) {
      if (b.kind === "creek") {
        // fixed world direction; at ground level when you are, below you when you are high up
        setPos(b.panner, Math.sin(b.ang) * 35, 0.5 - listenerY, -Math.cos(b.ang) * 35, now, 0.5)
        b.gain.gain.setTargetAtTime(AMBIENCE * (0.02 + 0.07 * clamp(1 - h / 0.45, 0, 1)), now, 1.2)
        continue
      }
      const ang = b.ang + windRot
      const g = gustAt(b.phase) * boost(ang)
      if (b.kind === "wind") {
        // wind lives in the crown: overhead from below, around/below you from the top
        const dy = clamp(48 - listenerY, -6, 16) + b.dy
        setPos(b.panner, Math.sin(ang) * 14, dy, -Math.cos(ang) * 14, now, 0.5)
        b.gain.gain.setTargetAtTime((AMBIENCE * (0.04 + 0.16 * top) * g) / Math.sqrt(WIND_N), now, 0.8)
        b.filter.frequency.setTargetAtTime(320 + 520 * g * (0.5 + top), now, 0.8)
      } else {
        const dy = clamp(40 - listenerY, -12, 12) + b.dy
        setPos(b.panner, Math.sin(ang) * 7, dy, -Math.cos(ang) * 7, now, 0.5)
        b.gain.gain.setTargetAtTime((AMBIENCE * 0.012 * rustleLvl * (0.4 + g)) / Math.sqrt(RUSTLE_N), now, 0.6)
      }
    }
    // more trunks around you near the ground → denser reverb
    reverbReturn.gain.setTargetAtTime(lerp(0.85, 0.35, clamp(h, 0, 1)), now, 1)

    // twigs and needles fall now and then (mostly among the branches), more in gusts
    const branchy = Math.max(rustleLvl, zoneWeight("trunk", listenerY) * 0.6)
    if (Math.random() < 0.006 * branchy * (1 + 2 * sweepEnv)) twigDrop(now)

    voices.forEach((v) => updateVoiceSpatial(v, now, 0.15))

    // schedule new calls, weighted by how close each layer is
    if (voices.size >= MAX_VOICES) return
    // the chorus swells and lulls over a couple of minutes (≈0.45–1.45×)
    const activity = 0.95 + 0.35 * Math.sin(gustPhase * 0.045) + 0.15 * Math.sin(gustPhase * 0.13 + 2)
    for (const zone of Object.keys(ZONES)) {
      const w = zoneWeight(zone, listenerY)
      if (w < 0.04) continue
      let inZone = 0
      voices.forEach((v) => v.clip.zone === zone && inZone++)
      if (inZone >= MAX_PER_ZONE) continue
      const rate = (inZone ? 0.012 : 0.05) * activity // per tick → a fresh call every ~2–8 s
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
    if (!radio) buildRadio()
    if (radio.ok && radio.el.paused) radio.el.play().catch(() => {})
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
      if ((muted || document.visibilityState === "hidden") && ctx.state === "running") {
        ctx.suspend()
        if (radio) radio.el.pause()
      }
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
  addEventListener("pagehide", () => {
    if (ctx) ctx.suspend()
    if (radio) radio.el.pause()
  })

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
      // azimuth relative to where the listener faces: 0 = ahead, +90 = right, ±180 = behind
      voices: [...voices].map((v) => {
        const a = ((((voicePos(v, ctx.currentTime).phi + yawNow) * 180) / Math.PI) % 360 + 540) % 360 - 180
        return `${v.clip.id} ${Math.round(a)}°`
      }),
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
