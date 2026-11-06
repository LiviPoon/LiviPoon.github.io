/* ===========================================================
   redwood-text.js — places the homepage text blocks (index.html, .rw-block) on the
   empty background around the redwood, never on the tree. Classic deferred script (IIFE).

   redwood.js is NOT changed or read at runtime. With the homepage's two stops (top 0,
   bottom 1, side center) its descent t is a pure function of scroll, and its camera is a
   pure function of t, so this file mirrors that camera (MIRROR below; keep in sync with
   redwood.js) to know where the tree is on screen at every t:

   1. WORKER: loads the same point file redwood.js uses (HTTP cache) and, for STEPS values of
      t, projects the points with redwood.js's camera, fades and point sizes into a coarse
      screen grid of ink coverage (blurred). For each grid row it records how far the empty
      background reaches in from the left and right screen edges.
   2. PLANNER: measures every block at a few widths / type scales, then finds the shortest
      track (S viewport heights of scroll) where each block in order gets a scroll window of
      data-rw-len viewport heights and an edge-anchored spot that stays empty for the whole
      window. Blocks are separated by data-rw-gap (tree only). The tree's own pacing is kept:
      t still runs from 0 to 1 at one steady rate over the whole track.
   3. LOOP: replicates redwood.js's scroll spring so the text fades exactly with the camera.

   Each block is still while shown (only its opacity changes). Hidden blocks are display:none
   (pauses videos / starts counters via app.js). One-time staggered fade-in on first show.
   < 768px, no WebGL, or no data: "stack" mode, blocks take turns in a CSS column (styles.css).
   Debug: ?rw-debug draws the grid and the planned spots (red = tree).
=========================================================== */
;(function () {
  "use strict"

  const root = document.documentElement
  const stage = document.querySelector(".rw-stage")
  const track = document.querySelector(".rw-track")
  if (!stage || !track) return
  const blocks = [...stage.querySelectorAll(".rw-block")]
  const params = new URLSearchParams(location.search)
  const flag = params.get("redwood") || ""
  const DEBUG = params.has("rw-debug")
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)")
  const scriptSrc = (document.currentScript && document.currentScript.src) || location.href
  const dataBase = new URL("redwood/", scriptSrc).href

  /* ---------------- MIRROR of redwood.js (keep in sync) ---------------- */
  const MIRROR = {
    KEYS: [
      [0.0, 1.1, 0.66, 1.0, 0, 0.5],
      [0.16, 0.95, 0.78, 1.0, 0, 0.36],
      [0.36, 0.76, 0.68, 1.0, 0, 0.34],
      [0.56, 0.5, 0.46, 1.0, 0, 0.28],
      [0.8, 0.22, 0.21, 0.4, 2, 0.2],
      [1.0, 0.07, 0.08, 0, 2, 0.15],
    ],
    ORBIT_START: -0.35,
    ORBIT_TOTAL: (120 * Math.PI) / 180,
    FOV_DEG: 48,
    FOV_DEG_NARROW: 60,
    SPRING: 5.5,
    POINT: {
      hi: { world: 0.045, alpha: 0.42, dpr: 1.75 },
      lo: { world: 0.08, alpha: 0.55, dpr: 1.25 },
    },
    OPACITY: parseFloat(params.get("redwood-opacity") || "") > 0 ? parseFloat(params.get("redwood-opacity")) : 1.8,
    NEAR_FADE: [0.35, 2.6],
    MAX_POINT_PX: 14,
    BIG_FADE_PX: 4,
    DIM: 0.05, // data-redwood-dim on the homepage stops
    DIM_ALPHA: 0.72,
  }

  /* ---------------- TUNABLES ---------------- */
  const STEPS = 251 // t samples (every 0.004)
  const CELL = 22 // target grid cell, css px
  const OCC = 0.035 // blurred ink coverage above which a cell is "tree"
  const OCC_LOOSE = 0.09 // fallback when nothing fits strictly (a few stray branches allowed)
  const MARGIN = 1 // cells kept clear between text and tree
  const SCREENS = 50 // descent speed: the whole descent takes this many screens of scroll
  // (.rw-track[data-rw-screens] overrides). Fixed: blocks share this budget, see plan().
  const FADE_VH = 0.2 // fade in / out, viewport heights of scroll (inside the window)
  const SAME_GAP_VH = 0.12 // between blocks on the same side (tree stays put)
  const SWITCH_GAP_VH = 0.4 // between blocks on opposite sides: the tree slides across
  const GAP_VH = 0.3 // stack mode: between blocks
  const LEN_MIN = 1.0 // shortest window per block, viewport heights
  const LOOK_VH = 1.2 // look this far ahead for a roomier spot
  const DELAY_COST = 0.1 // quality given up per viewport height of waiting
  const OFFSET = 0.22 // lens shift: the tree moves this fraction of the width away from the text
  const MIN_W = 220 // narrowest text column, px
  const MIN_FIT = 0.55 // smallest type scale
  const S_MAX = 140 // longest track considered, viewport heights
  const NARROW = 767 // <= this width: stack mode (matches styles.css)

  /* ---------------- STATE ---------------- */
  let groups = [] // [{ members:[el, partner?], len, gap, side, a, b, cands, pcands }]
  let mode = "wait" // wait | plan | stack
  let S = 0 // scrollable track length, viewport heights
  let grid = null // { W, H, GX, GY, steps, strict:{L,R}, loose:{L,R}, occ }
  let worker = null,
    reqId = 0
  const loop = { t: 0, v: 0, last: 0, raf: 0, stops: [] }

  buildGroups()

  /* ---------------- GROUPS ---------------- */
  function buildGroups() {
    groups = []
    blocks.forEach((el) => {
      el.style.setProperty("--rw-i", 0)
      ;[...el.children].forEach((c, k) => c.style.setProperty("--rw-i", k))
      if (el.hasAttribute("data-rw-with-prev") && groups.length) {
        groups[groups.length - 1].members.push(el)
        return
      }
      groups.push({
        members: [el],
        len: 2.4, // stack mode; in plan mode every block gets the same (longest) window
        gap: el.dataset.rwGap != null ? parseFloat(el.dataset.rwGap) || 0 : GAP_VH,
        side: el.dataset.side === "right" ? "R" : "L",
        a: 0,
        b: 0,
      })
    })
  }

  /* ---------------- WORKER (grid of free background) ---------------- */
  function workerMain() {
    let meta, pts, ratio
    const cl = (x) => Math.max(0, Math.min(1, x))
    const lerp = (a, b, k) => a + (b - a) * k
    const ss = (a, b, x) => {
      const u = cl((x - a) / (b - a))
      return u * u * (3 - 2 * u)
    }
    onmessage = async (e) => {
      const m = e.data
      try {
        if (!pts) await load(m)
        const out = compute(m)
        postMessage(out, [out.strictL.buffer, out.strictR.buffer, out.looseL.buffer, out.looseR.buffer].concat(out.occ ? [out.occ.buffer] : []))
      } catch (err) {
        postMessage({ id: m.id, error: String((err && err.message) || err) })
      }
    }
    async function load(m) {
      const r = await fetch(m.base + "redwood.json")
      if (!r.ok) throw new Error("json " + r.status)
      meta = await r.json()
      const f = (meta.files && (meta.files[m.tier] || meta.files.lo || meta.files.hi)) || {}
      const b = await fetch(m.base + (f.name || "redwood-" + m.tier + ".bin"))
      if (!b.ok) throw new Error("bin " + b.status)
      const buf = await b.arrayBuffer(),
        dv = new DataView(buf)
      const count = dv.getUint32(8, true)
      if (buf.byteLength < 48 + count * 10) throw new Error("bad bin")
      const g = (o) => dv.getFloat32(o, true)
      const mn = [g(16), g(20), g(24)],
        mx = [g(28), g(32), g(36)]
      const stride = Math.max(1, Math.ceil(count / 200000)) // points are pre-shuffled
      const n = Math.floor(count / stride)
      const q = new Uint16Array(buf, 48, count * 3),
        c = new Uint8Array(buf, 48 + count * 6, count * 4)
      pts = new Float32Array(n * 4)
      for (let j = 0; j < n; j++) {
        const i = j * stride
        for (let k = 0; k < 3; k++) pts[j * 4 + k] = mn[k] + (q[i * 3 + k] / 65535) * (mx[k] - mn[k])
        pts[j * 4 + 3] = c[i * 4 + 3] / 255
      }
      ratio = count / n
      meta.trunk = (meta.trunk || []).slice().sort((a, b) => a.y - b.y)
      meta.totalHeight = meta.totalHeight || mx[1]
      meta.crownRadius = meta.crownRadius || meta.totalHeight * 0.1
    }
    function key(K, t, j) {
      let i = 0
      while (i < K.length - 2 && t > K[i + 1][0]) i++
      const k0 = K[Math.max(0, i - 1)],
        k1 = K[i],
        k2 = K[i + 1],
        k3 = K[Math.min(K.length - 1, i + 2)]
      const u = cl((t - k1[0]) / (k2[0] - k1[0])),
        p0 = k0[j],
        p1 = k1[j],
        p2 = k2[j],
        p3 = k3[j]
      return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
    }
    function trunkAt(y) {
      const T = meta.trunk
      if (!T.length) return { x: 0, z: 0, r: meta.totalHeight / 90 }
      if (y <= T[0].y) return T[0]
      for (let i = 1; i < T.length; i++)
        if (y <= T[i].y) {
          const a = T[i - 1],
            b = T[i],
            k = (y - a.y) / (b.y - a.y || 1)
          return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), r: lerp(a.r, b.r, k) }
        }
      return T[T.length - 1]
    }
    function compute(m) {
      const { W, H: Hs, GX, GY, steps, dpr, mirror: M, tier } = m
      const P = M.POINT[tier] || M.POINT.lo
      const H = meta.totalHeight,
        R = meta.crownRadius
      const asp = W / Hs,
        fov = ((asp < 0.8 ? M.FOV_DEG_NARROW : M.FOV_DEG) * Math.PI) / 180
      const ft = 1 / Math.tan(fov / 2),
        uPx = (Hs * dpr) / (2 * Math.tan(fov / 2))
      const minPx = 1.4 * dpr,
        maxPx = M.MAX_POINT_PX * dpr,
        cellA = ((W * dpr) / GX) * ((Hs * dpr) / GY)
      const alpha0 = P.alpha * 0.92 * M.OPACITY * 0.85 * (1 - M.DIM * M.DIM_ALPHA) // ~gain, ~scan lum
      const N = GX * GY
      const raw = new Float32Array(N),
        blur = new Float32Array(N)
      const strictL = new Uint8Array(steps * GY),
        strictR = new Uint8Array(steps * GY),
        looseL = new Uint8Array(steps * GY),
        looseR = new Uint8Array(steps * GY)
      const occ = m.debug ? new Uint8Array(2 * steps * N) : null
      for (let s = 0; s < steps; s++) {
        const t = s / (steps - 1)
        const camY = key(M.KEYS, t, 1) * H,
          lookY = key(M.KEYS, t, 2) * H
        const tc = trunkAt(camY),
          tl = trunkAt(lookY)
        const dist = Math.max(tc.r * 1.8 + 0.5, key(M.KEYS, t, 3) * R + key(M.KEYS, t, 4) * tc.r + key(M.KEYS, t, 5) * H)
        const az = M.ORBIT_START + M.ORBIT_TOTAL * t
        const ex = tc.x + Math.sin(az) * dist,
          ey = camY,
          ez = tc.z + Math.cos(az) * dist
        let zx = ex - tl.x,
          zy = ey - lookY,
          zz = ez - tl.z
        const focus = Math.hypot(zx, zy, zz) || 1
        zx /= focus
        zy /= focus
        zz /= focus
        let xx = zz,
          xz = -zx
        const l = Math.hypot(xx, xz) || 1
        xx /= l
        xz /= l
        const yx = zy * xz,
          yy = zz * xx - zx * xz,
          yz = -zy * xx
        const f0 = focus * 0.9,
          f1 = focus + Math.max(R * 3, H * 0.5)
        // pass 0: tree shifted right (text on the left), pass 1: tree shifted left
        for (let pass = 0; pass < 2; pass++) {
        const shift = (pass ? -2 : 2) * m.offset // lens shift in NDC, as redwood.js uOffset
        raw.fill(0)
        for (let i = 0; i < pts.length; i += 4) {
          const dx = pts[i] - ex,
            dy = pts[i + 1] - ey,
            dz = pts[i + 2] - ez
          const d = -(dx * zx + dy * zy + dz * zz)
          if (d < 0.1) continue
          const sx = ((dx * xx + dz * xz) * ft) / asp / d + shift,
            sy = ((dx * yx + dy * yy + dz * yz) * ft) / d
          if (sx <= -1 || sx >= 1 || sy <= -1 || sy >= 1) continue
          let size = ((P.world * uPx) / Math.max(d, 0.05)) * (0.7 + 0.6 * pts[i + 3]),
            a = alpha0
          if (size < minPx) {
            a *= (size * size) / (minPx * minPx)
            size = minPx
          }
          a *= Math.min(1, (minPx * (M.BIG_FADE_PX / 1.4)) / size)
          size = Math.min(size, maxPx)
          a *= ss(M.NEAR_FADE[0], M.NEAR_FADE[1], d)
          a *= 1 - ss(f0, f1, d) * 0.9 * 0.8
          raw[(((1 - sy) / 2) * GY | 0) * GX + (((sx + 1) / 2) * GX | 0)] += (a * size * size * 0.785 * ratio) / cellA
        }
        // 3x3 blur (centre weighted): one stray dot is not "tree", a clump is
        for (let r = 0; r < GY; r++)
          for (let c = 0; c < GX; c++) {
            let sum = 0,
              w = 0
            for (let i = -1; i <= 1; i++)
              for (let j = -1; j <= 1; j++) {
                const rr = r + i,
                  cc = c + j
                if (rr < 0 || cc < 0 || rr >= GY || cc >= GX) continue
                const k = i || j ? 1 : 2
                sum += raw[rr * GX + cc] * k
                w += k
              }
            blur[r * GX + c] = sum / w
          }
        for (let r = 0; r < GY; r++) {
          const row = r * GX,
            o = s * GY + r
          let c = 0
          if (pass === 0) {
            while (c < GX && blur[row + c] < m.occ) c++
            strictL[o] = c
            c = 0
            while (c < GX && blur[row + c] < m.occLoose) c++
            looseL[o] = c
          } else {
            while (c < GX && blur[row + GX - 1 - c] < m.occ) c++
            strictR[o] = c
            c = 0
            while (c < GX && blur[row + GX - 1 - c] < m.occLoose) c++
            looseR[o] = c
          }
          if (occ) for (let k = 0; k < GX; k++) occ[(pass * steps + s) * N + row + k] = blur[row + k] >= m.occ ? 2 : blur[row + k] >= m.occLoose * 0.4 ? 1 : 0
        }
        }
      }
      return { id: m.id, W, H: Hs, GX, GY, steps, strictL, strictR, looseL, looseR, occ }
    }
  }

  function chooseTier() {
    // same rule as redwood.js, so the browser reuses the file it already downloaded
    if (flag === "hi" || flag === "lo") return flag
    const nav = navigator,
      c = nav.connection || {}
    const small = Math.min(innerWidth, screen.width || innerWidth) < 820
    if (matchMedia("(pointer: coarse)").matches || small || c.saveData) return "lo"
    if (nav.deviceMemory && nav.deviceMemory <= 4) return "lo"
    return "hi"
  }
  const tier = chooseTier()

  function requestGrid() {
    if (!worker) {
      try {
        const src = "(" + workerMain.toString() + ")()"
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })))
      } catch (e) {
        return stack()
      }
      worker.onmessage = (e) => {
        const g = e.data
        if (g.id !== reqId) return
        if (g.error) return stack()
        grid = g
        replan()
      }
      worker.onerror = () => stack()
    }
    const W = innerWidth,
      H = innerHeight
    reqId++
    worker.postMessage({
      id: reqId,
      base: dataBase,
      tier,
      W,
      H,
      GX: Math.max(24, Math.min(96, Math.round(W / CELL))),
      GY: Math.max(16, Math.min(64, Math.round(H / CELL))),
      steps: STEPS,
      dpr: Math.min(devicePixelRatio || 1, MIRROR.POINT[tier].dpr),
      occ: OCC,
      occLoose: OCC_LOOSE,
      offset: OFFSET,
      mirror: MIRROR,
      debug: DEBUG,
    })
  }

  /* ---------------- MEASURE ---------------- */
  function frame() {
    const r = stage.querySelector(".rw-safe").getBoundingClientRect()
    // one shared side margin (the CSS --edge) for every block
    return { W: innerWidth, H: innerHeight, top: r.top, bottom: r.bottom, edge: r.left }
  }

  function clearInline(el) {
    for (const p of ["left", "right", "top", "bottom", "margin", "--rw-w", "--rw-fit"]) el.style.removeProperty(p)
  }

  // Candidate sizes for one block: [{ w, h, fit, q }], best first
  function candidates(el, F) {
    const safeH = F.bottom - F.top
    const maxW = F.W - 2 * F.edge
    const measureAt = (w, fit) => {
      el.style.setProperty("--rw-w", w + "px")
      el.style.setProperty("--rw-fit", fit)
      return { w: el.offsetWidth, h: el.offsetHeight, fit }
    }
    // preferred width = the block's own CSS width (its --rw-w in styles.css)
    clearInline(el)
    const pref = Math.min(maxW, el.offsetWidth)
    const widths = []
    for (let w = pref; w > MIN_W; w *= 0.88) widths.push(Math.round(w))
    widths.push(MIN_W)
    const out = []
    for (const w of widths) {
      let fit = 1,
        m = measureAt(w, fit)
      for (let i = 0; i < 3 && m.h > safeH && fit > MIN_FIT; i++) {
        fit = Math.max(MIN_FIT, fit * Math.sqrt(safeH / m.h) * 0.97)
        m = measureAt(w, fit)
      }
      // smaller type fits tighter pockets
      for (const f of [fit, fit * 0.86, fit * 0.74]) {
        if (f < MIN_FIT && f !== fit) break
        const c = f === fit ? m : measureAt(w, f)
        if (c.h > safeH) continue
        c.q = Math.pow(c.fit, 1.6) * Math.pow(Math.min(1, c.w / pref), 0.6)
        out.push(c)
      }
    }
    clearInline(el)
    return out.sort((x, y) => y.q - x.q)
  }

  /* ---------------- PLAN ---------------- */
  // min over the samples of [a,b] of the free depth per row, for one side + threshold
  let depthCache = new Map()
  function windowDepth(a, b, key) {
    const { GY, steps } = grid
    const s0 = Math.max(0, Math.floor(a * (steps - 1)) - 1),
      s1 = Math.min(steps - 1, Math.ceil(b * (steps - 1)) + 1) // +-1 sample: spring / drift slack
    const id = key + ":" + s0 + ":" + s1
    let d = depthCache.get(id)
    if (d) return d
    const src = grid[key]
    d = new Uint8Array(GY).fill(255)
    for (let s = s0; s <= s1; s++)
      for (let r = 0; r < GY; r++) {
        const v = src[s * GY + r]
        if (v < d[r]) d[r] = v
      }
    depthCache.set(id, d)
    return d
  }

  // Best spot for a block (candidate sizes cs, preferred side pref) over the window [a,b]:
  // { c, side, x, y, rect, q } or null. sides: allowed; avoid: rects already on screen;
  // below: if set, prefer the spot whose top is nearest below this y (else: nearest centre).
  function spot(cs, pref, a, b, F, loose, sides, avoid, below) {
    const { GX, GY } = grid
    const cw = F.W / GX,
      ch = F.H / GY
    const r0 = Math.ceil(F.top / ch),
      r1 = Math.floor(F.bottom / ch) // usable rows [r0, r1)
    const mid = (F.top + F.bottom) / 2
    const pad = MARGIN * cw * 2
    let best = null
    for (const c of cs) {
      if (best && c.q <= best.q) break // sorted by q
      const nh = Math.ceil(c.h / ch) + 2 * MARGIN
      const need = Math.ceil((F.edge + c.w) / cw) + MARGIN
      for (const side of sides) {
        const d = windowDepth(a, b, (loose ? "loose" : "strict") + side)
        // rows [s, s+nh) all free to `need` cells; the outer rows are margin
        let pick = null,
          run = 0
        for (let r = r0 - MARGIN; r < r1 + MARGIN; r++) {
          run = r < 0 || r >= GY || d[r] >= need ? run + 1 : 0
          if (run < nh) continue
          const s = r - nh + 1
          const y = (s + MARGIN) * ch + ((nh - 2 * MARGIN) * ch - c.h) / 2
          if (y < F.top - 1 || y + c.h > F.bottom + 1) continue
          const dist = below == null ? Math.abs(y + c.h / 2 - mid) : y >= below ? y - below : 2 * F.H + below - y
          if (pick && dist >= pick.dist) continue
          // every column sits at the same distance from the screen edge
          const x = F.edge
          const left = side === "L" ? x : F.W - x - c.w
          const rect = { l: left, t: y, r: left + c.w, b: y + c.h }
          if (avoid.some((o) => rect.l < o.r + pad && rect.r > o.l - pad && rect.t < o.b + pad && rect.b > o.t - pad)) continue
          pick = { dist, x, y, rect }
        }
        if (!pick) continue
        const q = c.q * (side === pref ? 1 : 0.97) * (loose ? 0.6 : 1)
        if (!best || q > best.q) best = { c, side, x: pick.x, y: pick.y, rect: pick.rect, q, loose }
        break // first side that takes this size
      }
    }
    return best
  }

  // A group's spot: its block, then its data-rw-with-prev partner (if any) anywhere clear of it
  function spotGroup(g, a, b, F, loose, sides, avoid) {
    if (!g.partner) return spot(g.cands, g.side, a, b, F, loose, sides, avoid)
    // first try with room kept free under the block for its partner, then anywhere
    const gap = 0.04 * F.H
    const room = Math.min(...g.pcands.map((c) => c.h)) + gap
    for (const Fm of [Object.assign({}, F, { bottom: F.bottom - room }), F]) {
      const m = spot(g.cands, g.side, a, b, Fm, loose, sides, avoid)
      if (!m) continue
      const p = spot(g.pcands, m.side, a, b, F, loose, [m.side], avoid.concat([m.rect]), m.rect.b + gap)
      if (p) return Object.assign(m, { partner: p, q: m.q * Math.sqrt(p.q) })
    }
    return null
  }

  // Blocks in order, one at a time, each `len` viewport heights; the tree slides to the side
  // away from each block (redwood.js lens offset). Staying on the same side as the previous
  // block costs only SAME_GAP_VH; switching costs SWITCH_GAP_VH (the slide).
  function plan(S, F, loose, len) {
    const dt = 1 / (grid.steps - 1)
    const d = len / S
    if (d > 1) return null
    const out = []
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi],
        prev = out[gi - 1]
      const sides = prev ? [prev.sp.side, prev.sp.side === "L" ? "R" : "L"] : [g.side]
      let pick = null
      for (const side of sides) {
        const from = prev ? prev.b + (side === prev.sp.side ? SAME_GAP_VH : SWITCH_GAP_VH) / S : 0
        let first = -1
        for (let t0 = from; t0 + d <= 1 + 1e-9; t0 += dt) {
          if (first >= 0 && t0 > first + LOOK_VH / S) break
          const sp = spotGroup(g, t0, t0 + d, F, loose, [side], [])
          if (sp) {
            if (first < 0) first = t0
            const score = sp.q - DELAY_COST * (t0 - (prev ? prev.b : 0)) * S
            if (!pick || score > pick.score) pick = { a: t0, b: t0 + d, sp, score }
          }
          if (gi === 0) break // the hero opens the page at t = 0
        }
      }
      if (!pick) return null
      out.push(pick)
    }
    // the closing group ends the descent at the base of the trunk when it fits there
    const n = out.length,
      L = out[n - 1]
    if (n > 1 && L.b < 1 - 1e-6 && 1 - d >= out[n - 2].b + SWITCH_GAP_VH / S) {
      const sp = spotGroup(groups[n - 1], 1 - d, 1, F, loose, ["L", "R"], [])
      if (sp) Object.assign(L, { a: 1 - d, b: 1, sp })
    }
    // otherwise hold it on screen as far down as its spot stays free
    for (let b = 1; L.b < 1 - 1e-6 && b > L.b + 1e-9; b -= dt) {
      const sp = spotGroup(groups[n - 1], L.a, b, F, loose, [L.sp.side], [])
      if (sp) Object.assign(L, { b, sp })
    }
    return out
  }

  function replan() {
    if (mode === "stack" || !grid) return
    if (innerWidth <= NARROW || Math.abs(grid.W - innerWidth) > 2 || Math.abs(grid.H - innerHeight) > 2) {
      if (innerWidth <= NARROW) return stack()
      return requestGrid()
    }
    const F = frame()
    const t0 = performance.now()
    stage.classList.add("rw-measure")
    groups.forEach((g) => {
      g.cands = candidates(g.members[0], F)
      g.partner = g.members[1] || null
      g.pcands = g.partner ? candidates(g.partner, F) : null
    })
    stage.classList.remove("rw-measure")
    if (groups.some((g) => !g.cands.length || (g.partner && !g.pcands.length))) return stack()
    depthCache = new Map()

    // The descent speed is fixed (S screens); give every block the longest equal window that
    // fits (bisect len). Only if even LEN_MIN cannot fit is the track made longer.
    const S0 = parseFloat(track.dataset.rwScreens) || SCREENS
    const n = groups.length
    let result = null
    for (const loose of [false, true]) {
      for (let s = S0; s <= S_MAX && !result; s += 5) {
        if (!plan(s, F, loose, LEN_MIN)) continue
        let lo = LEN_MIN,
          hi = (s - (n - 1) * SAME_GAP_VH) / n,
          best = null
        const top = plan(s, F, loose, hi)
        if (top) best = { len: hi, p: top }
        else {
          best = { len: lo, p: plan(s, F, loose, lo) }
          while (hi - lo > 0.04) {
            const mid = (lo + hi) / 2,
              p = plan(s, F, loose, mid)
            if (p) {
              lo = mid
              best = { len: mid, p }
            } else hi = mid
          }
        }
        result = { S: s, len: best.len, p: best.p }
      }
      if (result) break
    }
    if (DEBUG)
      console.log(
        "[rw] plan",
        result ? `S=${result.S} len=${result.len.toFixed(2)} loose=${!!result.p.find((x) => x.sp.loose)} ${Math.round(performance.now() - t0)}ms` : "none",
        result ? result.p.map((x, i) => `${groups[i].members[0].getAttribute("aria-label")} ${x.a.toFixed(3)}-${x.b.toFixed(3)} ${x.sp.side} ${x.sp.c.w}@${x.sp.c.fit.toFixed(2)}`).join(" | ") : "",
      )
    if (!result) return stack()

    S = result.S
    const put = (el, sp) => {
      el.style.setProperty("--rw-w", sp.c.w + "px")
      el.style.setProperty("--rw-fit", sp.c.fit)
      el.style.top = Math.round(sp.y) + "px"
      el.style.bottom = "auto"
      el.style.margin = "0"
      if (el.hasAttribute("data-center")) {
        // centered, nudged left, and a little lower than the planned spot
        el.style.left = Math.round(Math.max(((innerWidth - sp.c.w) / 2 - innerWidth * 0.2) / 2, 24)) + "px"
        el.style.right = "auto"
        el.style.top = el.hasAttribute("data-center-y")
          ? Math.round((innerHeight - sp.c.h) / 2) + "px" // also centred vertically on the screen
          : Math.round(sp.y + innerHeight * 0.08) + "px"
      } else if (el.hasAttribute("data-center-y")) {
        // vertically centred on the screen, side margin as for every other block
        el.style.top = Math.round((innerHeight - sp.c.h) / 2) + "px"
        el.style.left = sp.side === "L" ? Math.round(sp.x) + "px" : "auto"
        el.style.right = sp.side === "R" ? Math.round(sp.x) + "px" : "auto"
      } else {
        el.style.left = sp.side === "L" ? Math.round(sp.x) + "px" : "auto"
        el.style.right = sp.side === "R" ? Math.round(sp.x) + "px" : "auto"
      }
      el.classList.toggle("rw-on-tree", !!sp.loose)
    }
    result.p.forEach((pk, i) => {
      const g = groups[i]
      g.a = pk.a
      g.b = pk.b
      // data-center blocks are always drawn on the left, so the tree must steer right
      g.at = g.members[0].hasAttribute("data-center") ? "L" : pk.sp.side
      put(g.members[0], pk.sp)
      if (g.partner) put(g.partner, pk.sp.partner)
    })
    mode = "plan"
    root.classList.remove("rw-stack")
    setTrack()
    if (DEBUG) debugDraw()
  }

  // < 768px / no tree data: blocks take turns in the CSS column, back to back
  function stack() {
    mode = "stack"
    root.classList.add("rw-stack") // styles.css: tree dimmed behind the text, as on phones
    if (worker) worker.terminate()
    worker = null
    S = 0
    groups.forEach((g) => {
      g.members.forEach((el) => {
        clearInline(el)
        el.classList.remove("rw-on-tree")
      })
    })
    const total = groups.reduce((s, g) => s + g.len + g.gap, 0) - groups[groups.length - 1].gap
    let cur = 0
    groups.forEach((g) => {
      g.a = cur / total
      g.b = (cur + g.len) / total
      cur += g.len + g.gap
    })
    S = total
    setTrack()
  }

  /* ---------------- TRACK + LOOP ---------------- */
  function setTrack() {
    const t = loop.t
    track.style.height = (S + 1) * innerHeight + "px"
    collectStops()
    // keep the descent where it was (also the first plan: page reloads keep their place)
    const maxS = Math.max(0, root.scrollHeight - innerHeight)
    if (loop.ready) scrollTo(0, t * maxS)
    else {
      loop.t = target()
      loop.ready = true
      reveal()
    }
    kick()
  }

  // mirrors redwood.js collectStops / scrollTarget exactly
  function collectStops() {
    const sy = scrollY,
      vh = innerHeight,
      maxS = Math.max(0, root.scrollHeight - vh)
    let prev = 0
    loop.stops = [...document.querySelectorAll("[data-redwood-stop]")].map((el) => {
      const r = el.getBoundingClientRect()
      const s = Math.min(maxS, Math.max(prev, r.top + sy + r.height / 2 - vh / 2))
      prev = s
      return { s, t: Math.max(0, Math.min(1, parseFloat(el.dataset.redwoodStop) || 0)) }
    })
  }
  function target() {
    const y = scrollY,
      S_ = loop.stops
    if (!S_.length) return Math.max(0, Math.min(1, y / Math.max(1, root.scrollHeight - innerHeight)))
    if (y <= S_[0].s) return S_[0].t
    for (let i = 1; i < S_.length; i++)
      if (y <= S_[i].s) {
        const a = S_[i - 1],
          b = S_[i]
        return a.t + (b.t - a.t) * (b.s > a.s ? (y - a.s) / (b.s - a.s) : 1)
      }
    return S_[S_.length - 1].t
  }

  function tick(now) {
    loop.raf = 0
    const dt = Math.min(0.05, loop.last ? (now - loop.last) / 1000 : 1 / 60)
    loop.last = now
    const goal = target(),
      x = loop.t
    if (mqReduce.matches) {
      loop.t = goal
      loop.v = 0
    } else {
      // same critically damped spring as redwood.js
      const w = MIRROR.SPRING,
        f = 1 + 2 * dt * w,
        hoo = dt * w * w,
        det = 1 / (f + dt * hoo)
      loop.t = (f * x + dt * loop.v + dt * hoo * goal) * det
      loop.v = (loop.v + hoo * (goal - x)) * det
    }
    apply(loop.t)
    if (Math.abs(loop.t - x) > 1e-6 || Math.abs(goal - loop.t) > 1e-5) loop.raf = requestAnimationFrame(tick)
    else loop.last = 0
  }
  function kick() {
    if (!loop.raf && loop.ready) loop.raf = requestAnimationFrame(tick)
  }

  function apply(t) {
    const fade = S ? FADE_VH / S : 0.02
    groups.forEach((g, i) => {
      const fin = i === 0 && g.a <= 0 ? 1 : (t - g.a) / fade
      const fout = g.b >= 1 - 1e-6 ? 1 : (g.b - t) / fade
      const o = Math.max(0, Math.min(1, fin, fout))
      g.members.forEach((el) => {
        const on = o > 0.001
        if (on !== el.classList.contains("is-shown")) el.classList.toggle("is-shown", on)
        el.classList.toggle("is-live", o > 0.6)
        el.style.opacity = on ? o.toFixed(3) : ""
      })
    })
    steerTree(t)
    if (DEBUG) debugDraw()
  }

  // Tree to the side away from the current (or nearest) block, via redwood.js's lens offset.
  // redwood.js eases the offset over ~1 s; blocks are planned with the tree already moved.
  let lastOff = null
  function steerTree(t) {
    let off = 0
    if (mode === "plan") {
      let best = Infinity
      for (const g of groups) {
        const dist = t < g.a ? g.a - t : t > g.b ? t - g.b : 0
        if (dist < best - 1e-9) {
          best = dist
          off = g.at === "R" ? -OFFSET : OFFSET
        }
      }
    }
    if (off !== lastOff && window.Redwood) {
      lastOff = off
      window.Redwood.setOffset(off)
    }
  }

  // one-time entrance: text fades up from the background the first time the page is ready
  function reveal() {
    if (!root.classList.contains("rw-pre")) return
    const go = () => {
      root.classList.remove("rw-pre")
      if (mqReduce.matches) return
      root.classList.add("rw-enter")
      setTimeout(() => root.classList.remove("rw-enter"), 1800)
    }
    // plays right away, behind the translucent enter gate, so the page is already settled
    // (nothing hidden, nothing fading in) when the gate lifts
    go()
  }

  /* ---------------- DEBUG OVERLAY (?rw-debug) ---------------- */
  let dbg
  function debugDraw() {
    if (!grid || !grid.occ || mode !== "plan") return
    if (!dbg) {
      dbg = document.createElement("canvas")
      dbg.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none"
      document.body.appendChild(dbg)
    }
    const { GX, GY, steps, occ } = grid
    dbg.width = innerWidth
    dbg.height = innerHeight
    const c = dbg.getContext("2d"),
      cw = innerWidth / GX,
      ch = innerHeight / GY
    const N = GX * GY,
      s = (lastOff < 0 ? steps : 0) + Math.round(loop.t * (steps - 1))
    for (let i = 0; i < N; i++) {
      const v = occ[s * N + i]
      if (!v) continue
      c.fillStyle = v === 2 ? "rgba(255,0,0,0.22)" : "rgba(255,160,0,0.12)"
      c.fillRect((i % GX) * cw, ((i / GX) | 0) * ch, cw, ch)
    }
    c.strokeStyle = "rgba(0,200,255,0.9)"
    groups.forEach((g) =>
      g.members.forEach((el) => {
        if (!el.classList.contains("is-shown")) return
        const r = el.getBoundingClientRect()
        c.strokeRect(r.left, r.top, r.width, r.height)
      }),
    )
    c.fillStyle = "#0cf"
    c.font = "12px monospace"
    c.fillText(`t=${loop.t.toFixed(3)} S=${S} ${mode}`, 12, innerHeight - 12)
  }

  // read-only, for debugging: the current plan
  window.RedwoodText = {
    plan: () => ({
      mode,
      S,
      blocks: groups.map((g) => ({ label: g.members[0].getAttribute("aria-label"), a: g.a, b: g.b })),
    }),
  }

  /* ---------------- BOOT ---------------- */
  let resizeT = 0,
    lastW = innerWidth,
    lastH = innerHeight
  addEventListener("scroll", kick, { passive: true })
  addEventListener("resize", () => {
    // ignore mobile URL-bar height wobble
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 0.15 * lastH) return
    lastW = innerWidth
    lastH = innerHeight
    clearTimeout(resizeT)
    resizeT = setTimeout(() => {
      if (innerWidth <= NARROW) return stack()
      if (mode === "stack" && flag !== "off" && window.WebGL2RenderingContext) mode = "wait"
      if (mode !== "stack") requestGrid()
    }, 250)
  })
  mqReduce.addEventListener("change", kick)
  document.addEventListener("mirror-quotes:rendered", () => mode === "plan" && replan())

  let booted = false
  function boot() {
    if (booted) return
    booted = true
    if (innerWidth <= NARROW || flag === "off" || !window.WebGL2RenderingContext) return stack()
    requestGrid()
    // fonts change block heights: plan again once they are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => mode === "plan" && replan())
    // no tree after all (redwood.js gave up): stack instead of waiting
    new MutationObserver(() => root.dataset.redwood === "off" && mode !== "stack" && stack()).observe(root, {
      attributes: true,
      attributeFilter: ["data-redwood"],
    })
    setTimeout(() => mode === "wait" && stack(), 15000)
  }
  // start after redwood.js has fetched its point file, so this is a cache hit
  const whenTree = () => {
    if (root.dataset.redwood) return boot()
    const mo = new MutationObserver(() => {
      if (root.dataset.redwood) {
        mo.disconnect()
        boot()
      }
    })
    mo.observe(root, { attributes: true, attributeFilter: ["data-redwood"] })
    setTimeout(() => {
      mo.disconnect()
      boot()
    }, 6000)
  }
  if (innerWidth <= NARROW || flag === "off") stack()
  else whenTree()
})()
