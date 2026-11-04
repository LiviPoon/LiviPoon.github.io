/* ===========================================================
   redwood.js — scroll-driven WebGL2 point cloud of a coastal redwood,
   fixed behind the homepage. Dependency-free classic script (IIFE).
   Scan: Phil Wilkes (terrestrial LiDAR of a coast redwood).

   DATA (redwood/ next to this script)
   - redwood.json: { totalHeight, canopyBaseHeight, crownRadius,
       trunk:[{y,x,z,r}] (centerline, base at 0,0,0, y up, metres),
       files:{hi:{name,count}, lo:{name,count}}, colorMode:"rgb"|"intensity" }
   - redwood-{hi,lo}.bin, little-endian: 48-byte header
       "RDWD" | u32 version=1 | u32 count | u32 flags | f32 min[3] | f32 max[3] | 8 x 0
     then count*3 u16 positions (v = min + q/65535*(max-min)), then
     count*4 u8 (r,g,b,s), s = random per-point byte. Points are pre-shuffled.
     The whole file is uploaded as one VBO; dequantisation happens in the shader.

   PAGE HOOKS
   - [data-redwood-stop="0..1"]: when the element's centre crosses the
     viewport centre, descent t equals that value (piecewise linear between).
     Optional data-redwood-side="left|right|center", data-redwood-dim="0..1".
   - window.Redwood = { setOffset(x), setStops(), refresh(), setDim(d) }
   - html[data-redwood="on"|"off"] is set for CSS.
   - URL: ?redwood=synthetic | hi | lo | off | debug
=========================================================== */
;(function () {
  "use strict"

  /* ---------------- TUNABLES ---------------- */
  // Camera keyframes over descent t. camY / lookY are fractions of totalHeight;
  // distance from trunk axis = a*crownRadius + b*trunkRadius(camY) + c*totalHeight.
  //        t     camY   lookY    a     b     c
  const KEYS = [
    [0.0, 1.1, 0.66, 1.0, 0, 0.62], // above the crown, whole crown framed
    [0.16, 0.97, 0.8, 1.1, 0, 0.06], // skimming the crown top
    [0.36, 0.78, 0.74, 0.85, 2, 0], // inside the canopy: branches pass by
    [0.56, 0.5, 0.47, 0.3, 4, 0], // through the forks / crown base
    [0.8, 0.22, 0.21, 0, 2, 0.16], // mid trunk; stay outside epicormic sprouts (~9-12 m)
    [1.0, 0.03, 0.04, 0, 2, 0.15], // at the base
  ]
  const ORBIT_START = -0.35 // radians, camera azimuth at t=0
  const ORBIT_TOTAL = (120 * Math.PI) / 180 // total orbit over the descent
  const FOV_DEG = 48 // vertical FOV (narrow/portrait screens get FOV_DEG_NARROW)
  const FOV_DEG_NARROW = 60
  const DRIFT = { yaw: 0.035, height: 0.004, speed: 0.08 } // idle drift (rad, ×H, Hz-ish)
  const SPRING = 5.5 // scroll spring stiffness (rad/s); reduced motion snaps instead
  const THEME_FADE = 0.6 // seconds for the light/dark colour crossfade
  const DEFAULT_OFFSET = 0.25 // tree shifted right by this fraction of the viewport
  const NARROW_PX = 720 // at/below this width: tree centred, dim >= NARROW_DIM
  const NARROW_DIM = 0.5
  const POINT = {
    hi: { world: 0.045, alpha: 0.42, dpr: 1.75 }, // world size (m), base alpha, DPR cap
    lo: { world: 0.08, alpha: 0.55, dpr: 1.25 },
  }
  // Global opacity multiplier (1 = original look). ?redwood-opacity=2.4 overrides for testing.
  const OPACITY = (() => {
    const v = parseFloat(new URLSearchParams(location.search).get("redwood-opacity") || "")
    return v > 0 ? v : 1.8
  })()
  const EDGE_SOFT = 0.6 // disc edge: 0.3 = very soft/feathery, 0.9 = hard dot
  const NEAR_FADE = [0.35, 2.6] // metres: points closer than this dissolve
  const MAX_POINT_PX = 14 // css px clamp before DPR
  const BIG_FADE_PX = 4 // points larger than this (css px) lose alpha ~1/size
  const SCAN_MIX = 0.45 // how strongly scan colour/intensity modulates points
  const SCAN_GAIN = 2.5 // the scan RGB is dark (median ~16/255); boost before use
  const TWINKLE = 0.16
  const DIM_ALPHA = 0.72 // dim=1 removes this much alpha
  const PALETTES = {
    light: { bg: "#eae0ce", canopy: "#1f3a2a", bark: "#4b2619", gain: 1.0 },
    dark: { bg: "#181818", canopy: "#c3d5b4", bark: "#e3b896", gain: 0.85 },
  }

  /* ---------------- SETUP ---------------- */
  const root = document.documentElement
  const params = new URLSearchParams(location.search)
  const flag = params.get("redwood") || ""
  const DEBUG = flag === "debug" || /^(localhost|127\.|\[::1\])/.test(location.hostname)
  const log = (...a) => DEBUG && console.warn("[redwood]", ...a)
  const scriptSrc = (document.currentScript && document.currentScript.src) || location.href
  const base = new URL("redwood/", scriptSrc)
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)")
  const mqDark = matchMedia("(prefers-color-scheme: dark)")

  const state = {
    t: 0,
    v: 0,
    target: 0, // descent + spring velocity
    offset: 0,
    offsetBase: null,
    dim: 0,
    dimBase: 0, // smoothed composition
    theme: 0, // 0 light .. 1 dark (smoothed)
    stops: [],
    time: 0,
    last: 0,
    raf: 0,
    ready: false,
    lost: false,
    drawn: false,
  }
  let gl, canvas, prog, U, vao, vbo, meta, bin, tier

  if (flag === "off") return off()

  window.Redwood = {
    setOffset(x) {
      state.offsetBase = x == null ? null : +x
      kick()
    },
    setDim(d) {
      state.dimBase = Math.max(0, Math.min(1, +d || 0))
      kick()
    },
    setStops() {
      collectStops()
      kick()
    },
    refresh() {
      collectStops()
      resize()
      kick()
    },
  }

  function off() {
    if (canvas) canvas.remove()
    root.dataset.redwood = "off"
  }

  function chooseTier() {
    if (flag === "hi" || flag === "lo") return flag
    const nav = navigator,
      c = nav.connection || {}
    const small = Math.min(innerWidth, screen.width || innerWidth) < 820
    if (matchMedia("(pointer: coarse)").matches || small || c.saveData) return "lo"
    if (nav.deviceMemory && nav.deviceMemory <= 4) return "lo"
    return "hi"
  }

  /* ---------------- LOADING ---------------- */
  async function load() {
    tier = chooseTier()
    if (flag === "synthetic") {
      ;[meta, bin] = synthetic(tier === "hi" ? 400000 : 150000)
    } else {
      const r = await fetch(new URL("redwood.json", base))
      if (!r.ok) throw new Error("json " + r.status)
      meta = await r.json()
      const f = (meta.files && (meta.files[tier] || meta.files.lo || meta.files.hi)) || {}
      const b = await fetch(new URL(f.name || "redwood-" + tier + ".bin", base))
      if (!b.ok) throw new Error("bin " + b.status)
      bin = parseBin(await b.arrayBuffer())
    }
    meta.trunk = (meta.trunk || []).slice().sort((a, b) => a.y - b.y)
    meta.totalHeight = meta.totalHeight || bin.max[1]
    meta.crownRadius = meta.crownRadius || meta.totalHeight * 0.1
    meta.canopyBaseHeight = meta.canopyBaseHeight || meta.totalHeight * 0.4
  }

  function parseBin(buf) {
    const dv = new DataView(buf)
    const magic = String.fromCharCode(
      dv.getUint8(0),
      dv.getUint8(1),
      dv.getUint8(2),
      dv.getUint8(3),
    )
    const count = dv.getUint32(8, true)
    if (magic !== "RDWD" || buf.byteLength < 48 + count * 10) throw new Error("bad bin")
    const f = (o) => dv.getFloat32(o, true)
    return { buf, count, min: [f(16), f(20), f(24)], max: [f(28), f(32), f(36)] }
  }

  // Test-only tree in the same binary layout (?redwood=synthetic).
  function synthetic(n) {
    const H = 72,
      CB = 30,
      R = 9,
      trunk = []
    const lean = (y) => [0.9 * Math.pow(y / H, 1.6), -0.5 * Math.pow(y / H, 2)]
    const rad = (y) => 0.25 + 1.6 * Math.pow(1 - y / H, 0.9) + 1.6 * Math.exp(-y / 2.5)
    for (let y = 0; y <= H; y += 2) {
      const l = lean(y)
      trunk.push({ y, x: l[0], z: l[1], r: rad(y) })
    }
    const min = [-R - 3, 0, -R - 3],
      max = [R + 3, H + 2, R + 3]
    const buf = new ArrayBuffer(48 + n * 10),
      dv = new DataView(buf)
    ;[82, 68, 87, 68].forEach((c, i) => dv.setUint8(i, c))
    dv.setUint32(4, 1, true)
    dv.setUint32(8, n, true)
    for (let i = 0; i < 3; i++) {
      dv.setFloat32(16 + i * 4, min[i], true)
      dv.setFloat32(28 + i * 4, max[i], true)
    }
    const q = new Uint16Array(buf, 48, n * 3),
      col = new Uint8Array(buf, 48 + n * 6, n * 4)
    const rnd = Math.random,
      gauss = () => (rnd() + rnd() + rnd() - 1.5) * 0.8
    const branches = []
    for (let i = 0; i < 220; i++) {
      const y = CB + Math.pow(rnd(), 0.8) * (H - CB - 1),
        k = (y - CB) / (H - CB)
      branches.push({
        y,
        a: rnd() * 6.283,
        L: (R * Math.pow(1 - k, 0.6) + 1) * (0.6 + 0.4 * rnd()),
      })
    }
    for (let i = 0; i < n; i++) {
      let x, y, z, c
      if (rnd() < 0.3) {
        // bark
        y = Math.pow(rnd(), 1.3) * H
        const a = rnd() * 6.283,
          r = rad(y),
          l = lean(y)
        x = l[0] + Math.cos(a) * r
        z = l[1] + Math.sin(a) * r
        c = [110, 70, 55]
      } else {
        // branch + foliage clump
        const b = branches[(rnd() * branches.length) | 0],
          u = Math.sqrt(rnd()),
          l = lean(b.y)
        const d = 0.3 + u * b.L,
          sp = 0.15 + u * 0.9
        x = l[0] + Math.cos(b.a) * d + gauss() * sp
        z = l[1] + Math.sin(b.a) * d + gauss() * sp
        y = b.y - u * u * 2.5 + gauss() * sp * 0.6
        c = [60 + 40 * rnd(), 95 + 50 * rnd(), 55]
      }
      const p = [x, y, z]
      for (let k = 0; k < 3; k++)
        q[i * 3 + k] = Math.max(
          0,
          Math.min(65535, Math.round(((p[k] - min[k]) / (max[k] - min[k])) * 65535)),
        )
      col.set([c[0], c[1], c[2], (rnd() * 256) | 0], i * 4)
    }
    return [
      { totalHeight: H, canopyBaseHeight: CB, crownRadius: R, trunk, colorMode: "rgb" },
      { buf, count: n, min, max },
    ]
  }

  /* ---------------- GL ---------------- */
  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 aQ;
  layout(location=1) in vec4 aC;
  uniform vec3 uMin, uMax, uBg, uCanopy, uBark;
  uniform mat4 uVP;
  uniform vec2 uFog, uNear, uSize, uHeights; // uSize: min,max px; uHeights: H, canopyBase
  uniform float uOffset, uPx, uWorld, uAlpha, uTime, uTwinkle, uDim, uLumOnly, uGain;
  out vec3 vCol; out float vA;
  void main() {
    vec3 pos = uMin + aQ * (uMax - uMin);
    vec4 clip = uVP * vec4(pos, 1.0);
    float d = clip.w;
    clip.x += uOffset * 2.0 * clip.w; // lens shift: tree sits off-centre
    gl_Position = clip;
    float s = aC.a;
    float size = uWorld * uPx / max(d, 0.05) * (0.7 + 0.6 * s);
    float a = uAlpha * uGain * ${OPACITY.toFixed(3)};
    if (size < uSize.x) { a *= (size * size) / (uSize.x * uSize.x); size = uSize.x; }
    a *= min(1.0, uSize.x * ${(BIG_FADE_PX / 1.4).toFixed(3)} / size); // big = faint
    gl_PointSize = min(size, uSize.y);
    a *= smoothstep(uNear.x, uNear.y, d);
    float g = smoothstep(uHeights.y * 0.6, uHeights.y * 1.1, pos.y);
    vec3 col = mix(uBark, uCanopy, g);
    float lum = min(1.0, dot(aC.rgb, vec3(0.299, 0.587, 0.114)) * ${SCAN_GAIN.toFixed(2)});
    vec3 tint = uLumOnly > 0.5 ? vec3(1.0) : clamp(aC.rgb * ${SCAN_GAIN.toFixed(2)} / max(lum, 0.06), 0.0, 2.0);
    col *= mix(vec3(1.0), tint, ${(SCAN_MIX * 0.35).toFixed(3)});
    a *= mix(1.0, 0.55 + 0.9 * lum, ${SCAN_MIX.toFixed(3)});
    float f = smoothstep(uFog.x, uFog.y, d) * 0.9;
    col = mix(col, uBg, f + uDim * 0.3);
    a *= (1.0 - f * 0.8) * (1.0 - uDim * ${DIM_ALPHA.toFixed(3)});
    a *= 1.0 + uTwinkle * sin(uTime * (0.6 + 1.4 * s) + s * 40.0);
    vCol = col; vA = clamp(a, 0.0, 1.0);
  }`
  const FS = `#version 300 es
  precision mediump float;
  in vec3 vCol; in float vA; out vec4 o;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float a = vA * (1.0 - smoothstep(${EDGE_SOFT.toFixed(2)}, 1.0, r2));
    o = vec4(vCol * a, a); // premultiplied
  }`

  function initGL() {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
    })
    if (!gl) throw new Error("no webgl2")
    const sh = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        log(gl.getShaderInfoLog(s))
        throw new Error("shader")
      }
      return s
    }
    prog = gl.createProgram()
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      log(gl.getProgramInfoLog(prog))
      throw new Error("link")
    }
    U = {}
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < n; i++) {
      const nm = gl.getActiveUniform(prog, i).name
      U[nm] = gl.getUniformLocation(prog, nm)
    }
    vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, bin.buf, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, 6, 48)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 4, 48 + bin.count * 6)
    gl.useProgram(prog)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.uniform3fv(U.uMin, bin.min)
    gl.uniform3fv(U.uMax, bin.max)
    gl.uniform2f(U.uHeights, meta.totalHeight, meta.canopyBaseHeight)
    gl.uniform1f(U.uLumOnly, meta.colorMode === "intensity" ? 1 : 0)
    state.maxPt = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64
    resize()
  }

  /* ---------------- MATH ---------------- */
  function perspective(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2),
      nf = 1 / (n - f)
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]
  }
  function lookAt(e, c) {
    let zx = e[0] - c[0],
      zy = e[1] - c[1],
      zz = e[2] - c[2]
    let l = Math.hypot(zx, zy, zz) || 1
    zx /= l
    zy /= l
    zz /= l
    let xx = zz,
      xz = -zx
    l = Math.hypot(xx, xz) || 1
    xx /= l
    xz /= l // up × z, up=(0,1,0)
    const yx = zy * xz,
      yy = zz * xx - zx * xz,
      yz = -zy * xx
    return [
      xx,
      yx,
      zx,
      0,
      0,
      yy,
      zy,
      0,
      xz,
      yz,
      zz,
      0,
      -(xx * e[0] + xz * e[2]),
      -(yx * e[0] + yy * e[1] + yz * e[2]),
      -(zx * e[0] + zy * e[1] + zz * e[2]),
      1,
    ]
  }
  function mul(a, b) {
    const o = new Array(16)
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3]
    return o
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x))
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lerp = (a, b, k) => a + (b - a) * k
  const lerp3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k))

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

  // Catmull-Rom through KEYS column j at descent t.
  function key(t, j) {
    let i = 0
    while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++
    const k0 = KEYS[Math.max(0, i - 1)],
      k1 = KEYS[i],
      k2 = KEYS[i + 1],
      k3 = KEYS[Math.min(KEYS.length - 1, i + 2)]
    const u = clamp01((t - k1[0]) / (k2[0] - k1[0])),
      p0 = k0[j],
      p1 = k1[j],
      p2 = k2[j],
      p3 = k3[j]
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
        (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
    )
  }

  function camera(t, time) {
    const H = meta.totalHeight,
      R = meta.crownRadius,
      motion = !mqReduce.matches
    const camY = (key(t, 1) + (motion ? DRIFT.height * Math.sin(time * DRIFT.speed * 1.3) : 0)) * H
    const lookY = key(t, 2) * H
    const tc = trunkAt(camY),
      tl = trunkAt(lookY)
    const dist = Math.max(tc.r * 1.8 + 0.5, key(t, 3) * R + key(t, 4) * tc.r + key(t, 5) * H)
    const az =
      ORBIT_START + ORBIT_TOTAL * t + (motion ? DRIFT.yaw * Math.sin(time * DRIFT.speed) : 0)
    const eye = [tc.x + Math.sin(az) * dist, camY, tc.z + Math.cos(az) * dist]
    return {
      eye,
      target: [tl.x, lookY, tl.z],
      focus: Math.hypot(eye[0] - tl.x, camY - lookY, eye[2] - tl.z),
    }
  }

  /* ---------------- SCROLL → t ---------------- */
  function collectStops() {
    const sy = scrollY,
      vh = innerHeight,
      maxS = Math.max(0, root.scrollHeight - vh)
    let prev = 0
    state.stops = [...document.querySelectorAll("[data-redwood-stop]")].map((el) => {
      const r = el.getBoundingClientRect(),
        top = r.top + sy
      // clamp into the reachable scroll range so the last stop is hit at max scroll
      const s = Math.min(maxS, Math.max(prev, top + r.height / 2 - vh / 2))
      prev = s
      return {
        el,
        s,
        top,
        bottom: top + r.height,
        t: clamp01(parseFloat(el.dataset.redwoodStop) || 0),
      }
    })
  }

  function scrollTarget() {
    const y = scrollY,
      S = state.stops
    if (!S.length) return clamp01(y / Math.max(1, root.scrollHeight - innerHeight))
    if (y <= S[0].s) return S[0].t
    for (let i = 1; i < S.length; i++)
      if (y <= S[i].s) {
        const a = S[i - 1],
          b = S[i]
        return lerp(a.t, b.t, b.s > a.s ? (y - a.s) / (b.s - a.s) : 1)
      }
    return S[S.length - 1].t
  }

  function dominantStop() {
    const c = scrollY + innerHeight / 2
    let best = null,
      bd = Infinity
    for (const s of state.stops) {
      const d = c < s.top ? s.top - c : c > s.bottom ? c - s.bottom : 0
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }

  function compositionTargets() {
    const narrow = innerWidth <= NARROW_PX
    let off = state.offsetBase == null ? DEFAULT_OFFSET : state.offsetBase
    let dim = state.dimBase
    const s = dominantStop()
    if (s) {
      const side = s.el.dataset.redwoodSide,
        d = s.el.dataset.redwoodDim
      if (side === "left") off = -Math.abs(off || DEFAULT_OFFSET)
      else if (side === "right") off = Math.abs(off || DEFAULT_OFFSET)
      else if (side === "center") off = 0
      if (d != null && d !== "") dim = clamp01(parseFloat(d) || 0)
    }
    return { off: narrow ? 0 : off, dim: narrow ? Math.max(dim, NARROW_DIM) : dim }
  }

  function themeTarget() {
    const t = root.dataset.theme || root.getAttribute("saved-theme")
    return t === "dark" ? 1 : t === "light" ? 0 : mqDark.matches ? 1 : 0
  }

  /* ---------------- FRAME ---------------- */
  function resize() {
    if (!gl) return
    const dpr = Math.min(devicePixelRatio || 1, POINT[tier].dpr)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    state.dpr = dpr
    state.needs = true
  }

  function frame(now) {
    state.raf = 0
    if (document.hidden || state.lost || !state.ready) return
    if (document.querySelector(".menu-panel.is-on")) {
      // menu overlay open: pause, re-check
      state.last = 0
      if (!state.menuTimer)
        state.menuTimer = setTimeout(() => {
          state.menuTimer = 0
          kick()
        }, 300)
      return
    }
    const dt = Math.min(0.05, state.last ? (now - state.last) / 1000 : 1 / 60)
    state.last = now
    const reduced = mqReduce.matches
    if (!reduced) state.time += dt

    // critically damped spring on t (implicit, stable for any dt); reduced motion snaps
    state.target = scrollTarget()
    const x = state.t
    if (reduced) {
      state.t = state.target
      state.v = 0
    } else {
      const w = SPRING,
        f = 1 + 2 * dt * w,
        hoo = dt * w * w,
        det = 1 / (f + dt * hoo)
      state.t = (f * x + dt * state.v + dt * hoo * state.target) * det
      state.v = (state.v + hoo * (state.target - x)) * det
    }

    const ct = compositionTargets(),
      ke = reduced ? 1 : 1 - Math.exp(-dt * 3)
    const prev = [state.offset, state.dim, state.theme]
    state.offset = lerp(state.offset, ct.off, ke)
    state.dim = lerp(state.dim, ct.dim, ke)
    const th = themeTarget(),
      step = dt / THEME_FADE // linear crossfade over THEME_FADE s
    state.theme =
      Math.abs(th - state.theme) <= step ? th : state.theme + Math.sign(th - state.theme) * step

    const moving =
      Math.abs(state.t - x) > 1e-5 ||
      Math.abs(state.target - state.t) > 1e-4 ||
      Math.abs(state.offset - prev[0]) > 1e-4 ||
      Math.abs(state.dim - prev[1]) > 1e-4 ||
      Math.abs(state.theme - prev[2]) > 1e-4
    if (!reduced || moving || state.needs || !state.drawn) draw()
    state.needs = false
    if (!reduced || moving) state.raf = requestAnimationFrame(frame)
    else state.last = 0
  }

  function draw() {
    const W = canvas.width,
      Ht = canvas.height,
      asp = W / Ht
    const fov = ((asp < 0.8 ? FOV_DEG_NARROW : FOV_DEG) * Math.PI) / 180
    const cam = camera(state.t, state.time),
      H = meta.totalHeight,
      R = meta.crownRadius
    const P = perspective(fov, asp, 0.1, H * 4 + R * 10)
    gl.viewport(0, 0, W, Ht)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const pl = PALETTES.light,
      pd = PALETTES.dark,
      k = state.theme
    gl.uniformMatrix4fv(U.uVP, false, mul(P, lookAt(cam.eye, cam.target)))
    gl.uniform3fv(U.uBg, lerp3(hex(pl.bg), hex(pd.bg), k))
    gl.uniform3fv(U.uCanopy, lerp3(hex(pl.canopy), hex(pd.canopy), k))
    gl.uniform3fv(U.uBark, lerp3(hex(pl.bark), hex(pd.bark), k))
    gl.uniform1f(U.uGain, lerp(pl.gain, pd.gain, k))
    gl.uniform2f(U.uFog, cam.focus * 0.9, cam.focus + Math.max(R * 3, H * 0.5))
    gl.uniform2f(U.uNear, NEAR_FADE[0], NEAR_FADE[1])
    gl.uniform2f(U.uSize, 1.4 * state.dpr, Math.min(state.maxPt, MAX_POINT_PX * state.dpr))
    gl.uniform1f(U.uPx, Ht / (2 * Math.tan(fov / 2)))
    gl.uniform1f(U.uWorld, POINT[tier].world)
    gl.uniform1f(U.uAlpha, POINT[tier].alpha)
    gl.uniform1f(U.uOffset, state.offset)
    gl.uniform1f(U.uDim, state.dim)
    gl.uniform1f(U.uTime, state.time)
    gl.uniform1f(U.uTwinkle, mqReduce.matches ? 0 : TWINKLE)
    gl.drawArrays(gl.POINTS, 0, bin.count)
    if (!state.drawn) {
      state.drawn = true
      requestAnimationFrame(() => {
        canvas.style.opacity = "1"
      })
    }
  }

  function kick() {
    if (!state.raf && state.ready && !document.hidden) state.raf = requestAnimationFrame(frame)
  }

  /* ---------------- BOOT ---------------- */
  async function start() {
    try {
      if (!window.WebGL2RenderingContext) throw new Error("no webgl2")
      await load()
      canvas = document.createElement("canvas")
      canvas.id = "redwood-canvas"
      canvas.setAttribute("aria-hidden", "true")
      const st = document.createElement("style")
      st.textContent =
        "#redwood-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:-1;" +
        "pointer-events:none;opacity:0;transition:opacity 1.6s ease}" +
        "html[data-redwood=on] body{background:transparent}"
      document.head.appendChild(st)
      document.body.insertBefore(canvas, document.body.firstChild)
      initGL()
    } catch (e) {
      log(e && e.message)
      return off()
    }
    root.dataset.redwood = "on"
    collectStops()
    state.t = state.target = scrollTarget()
    const ct = compositionTargets()
    state.offset = ct.off
    state.dim = ct.dim
    state.theme = themeTarget()
    state.ready = true

    new ResizeObserver(() => {
      resize()
      kick()
    }).observe(canvas)
    new ResizeObserver(() => {
      collectStops()
      kick()
    }).observe(document.body)
    addEventListener("resize", () => {
      collectStops()
      kick()
    })
    addEventListener("scroll", kick, { passive: true })
    document.addEventListener("visibilitychange", () => {
      state.last = 0
      kick()
    })
    new MutationObserver(kick).observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "saved-theme", "class"],
    })
    mqDark.addEventListener("change", kick)
    mqReduce.addEventListener("change", kick)
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault()
      state.lost = true
    })
    canvas.addEventListener("webglcontextrestored", () => {
      try {
        initGL()
        state.lost = false
        state.needs = true
        kick()
      } catch (e) {
        log(e && e.message)
        off()
      }
    })
    kick()
  }

  function idle() {
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2000 })
    else setTimeout(start, 300)
  }
  if (document.readyState === "complete") idle()
  else addEventListener("load", idle, { once: true })
})()
