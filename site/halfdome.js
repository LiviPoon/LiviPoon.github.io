/* ===========================================================
   halfdome.js — scroll-driven WebGL2 point cloud of Half Dome (Yosemite),
   fixed behind the CV page. Sibling of catalina.js / redwood.js (same binary
   format, same page hooks, same look); only the camera, point scale and
   colouring differ. Dependency-free classic script (IIFE).

   DATA (halfdome/ next to this script; built by tools/build-halfdome.py)
   - halfdome.json: { totalHeight, faceDir, files:{hi,lo} }
   - halfdome-{hi,lo}.bin: identical layout to redwood-{hi,lo}.bin
       "RDWD" | u32 version | u32 count | u32 flags | f32 min[3] | f32 max[3] | 8 x 0,
       count*3 u16 positions, count*4 u8 (r,g,b,s).
     Metres (approx.), y up, origin under the summit at the scan's lowest point.
     The sheer northwest face looks along faceDir (≈ -x, -z).

   PAGE HOOKS (shared with redwood.js so styles.css applies unchanged)
   - [data-redwood-stop="0..1"], data-redwood-side, data-redwood-dim on sections.
   - html[data-redwood="on"|"off"] is set for CSS.
   - window.HalfDome = { path, eyeAt(t), refresh() }  (path is read by halfdome-soundscape.js)
   - URL: ?halfdome=hi | lo | off | debug
=========================================================== */
;(function () {
  "use strict"

  /* ---------------- TUNABLES ---------------- */
  // Flight path over descent t (Catmull-Rom): eye xyz, look-at xyz (metres).
  // The classic side profile → round to the foot of the northwest face → climb it →
  // over the summit → pull back to the profile from above.
  //        t      eye x   eye y   eye z    look x  look y  look z
  const PATH = [
    [0.0, -3000, 1100, 1500, -100, 800, -150],
    [0.18, -3500, 750, -600, 0, 800, -200],
    [0.36, -2000, 300, -3000, -150, 850, 0],
    [0.54, -1150, 750, -1900, 0, 1150, 0],
    [0.72, -650, 1450, -1050, 0, 1300, 50],
    [0.86, -700, 1950, -500, 0, 1250, 0],
    [1.0, -2500, 2300, 1300, 0, 1000, -100],
  ]
  const FOV_DEG = 48
  const FOV_DEG_NARROW = 60
  const DRIFT = { yaw: 0.025, height: 10, speed: 0.08 } // idle drift (rad, m, Hz-ish)
  const SPRING = 5.5
  const THEME_FADE = 0.6
  const DEFAULT_OFFSET = 0.25
  const NARROW_PX = 720
  const NARROW_DIM = 0.5
  const POINT = {
    hi: { world: 4.5, alpha: 0.42, dpr: 1.75 }, // world size (m), base alpha, DPR cap
    lo: { world: 8, alpha: 0.55, dpr: 1.25 },
  }
  const OPACITY = (() => {
    const v = parseFloat(new URLSearchParams(location.search).get("halfdome-opacity") || "")
    return v > 0 ? v : 1.3
  })()
  const EDGE_SOFT = 0.6
  const NEAR_FADE = [8, 90] // metres: points closer than this dissolve
  const MAX_POINT_PX = 14
  const BIG_FADE_PX = 4
  const TEX_MIX = 0.3 // how strongly the scan's photo colour tints the points
  const TWINKLE = 0.16
  const DIM_ALPHA = 0.72
  // forest = dark (vegetated) samples, granite = bright rock, summit = high granite
  const PALETTES = {
    light: { bg: "#eae0ce", forest: "#2c3a22", granite: "#3c3f4c", summit: "#5a4a36", gain: 1.0 },
    dark: { bg: "#181818", forest: "#b8c8a2", granite: "#e4e0d8", summit: "#f0d9b4", gain: 0.85 },
  }

  /* ---------------- SETUP ---------------- */
  const root = document.documentElement
  const params = new URLSearchParams(location.search)
  const flag = params.get("halfdome") || ""
  const DEBUG = flag === "debug" || /^(localhost|127\.|\[::1\])/.test(location.hostname)
  const log = (...a) => DEBUG && console.warn("[halfdome]", ...a)
  const scriptSrc = (document.currentScript && document.currentScript.src) || location.href
  const base = new URL("halfdome/", scriptSrc)
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)")
  const mqDark = matchMedia("(prefers-color-scheme: dark)")

  const clamp01 = (x) => Math.max(0, Math.min(1, x))
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lerp = (a, b, k) => a + (b - a) * k
  const lerp3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k))

  // Catmull-Rom through PATH column j at descent t.
  function key(t, j) {
    let i = 0
    while (i < PATH.length - 2 && t > PATH[i + 1][0]) i++
    const k0 = PATH[Math.max(0, i - 1)],
      k1 = PATH[i],
      k2 = PATH[i + 1],
      k3 = PATH[Math.min(PATH.length - 1, i + 2)]
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
  const eyeAt = (t) => [key(t, 1), Math.max(8, key(t, 2)), key(t, 3)]

  const state = {
    t: 0,
    v: 0,
    target: 0,
    offset: 0,
    dim: 0,
    theme: 0,
    stops: [],
    time: 0,
    last: 0,
    raf: 0,
    ready: false,
    lost: false,
    drawn: false,
  }
  let gl, canvas, prog, U, vao, vbo, meta, bin, tier

  // exposed even when rendering is off: the soundscape follows the same flight
  window.HalfDome = {
    path: PATH,
    eyeAt,
    refresh() {
      collectStops()
      resize()
      kick()
    },
  }

  if (flag === "off") return off()

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
    const r = await fetch(new URL("halfdome.json", base))
    if (!r.ok) throw new Error("json " + r.status)
    meta = await r.json()
    const f = (meta.files && (meta.files[tier] || meta.files.lo || meta.files.hi)) || {}
    const b = await fetch(new URL(f.name || "halfdome-" + tier + ".bin", base))
    if (!b.ok) throw new Error("bin " + b.status)
    bin = parseBin(await b.arrayBuffer())
    meta.totalHeight = meta.totalHeight || bin.max[1]
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

  /* ---------------- GL ---------------- */
  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 aQ;
  layout(location=1) in vec4 aC;
  uniform vec3 uMin, uMax, uBg, uForest, uGranite, uSummit;
  uniform mat4 uVP;
  uniform vec2 uFog, uNear, uSize;
  uniform float uOffset, uPx, uWorld, uAlpha, uTime, uTwinkle, uDim, uGain, uTop;
  out vec3 vCol; out float vA;
  void main() {
    vec3 pos = uMin + aQ * (uMax - uMin);
    float s = aC.a;
    vec4 clip = uVP * vec4(pos, 1.0);
    float d = clip.w;
    clip.x += uOffset * 2.0 * clip.w; // lens shift: the dome sits off-centre
    gl_Position = clip;
    float size = uWorld * uPx / max(d, 1.0) * (0.7 + 0.6 * s);
    float a = uAlpha * uGain * ${OPACITY.toFixed(3)};
    if (size < uSize.x) { a *= (size * size) / (uSize.x * uSize.x); size = uSize.x; }
    a *= min(1.0, uSize.x * ${(BIG_FADE_PX / 1.4).toFixed(3)} / size);
    gl_PointSize = min(size, uSize.y);
    a *= smoothstep(uNear.x, uNear.y, d);
    float lum = dot(aC.rgb, vec3(0.299, 0.587, 0.114));
    float rock = smoothstep(0.3, 0.55, lum);
    vec3 col = mix(uForest, uGranite, rock);
    col = mix(col, uSummit, 0.35 * rock * smoothstep(uTop * 0.82, uTop, pos.y));
    vec3 tint = clamp(aC.rgb / max(lum, 0.06), 0.0, 2.0);
    col *= mix(vec3(1.0), tint, ${TEX_MIX.toFixed(3)});
    a *= mix(1.0, 0.45 + 1.1 * lum, 0.5);
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
    gl.uniform1f(U.uTop, meta.totalHeight)
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
    xz /= l
    const yx = zy * xz,
      yy = zz * xx - zx * xz,
      yz = -zy * xx
    return [
      xx, yx, zx, 0,
      0, yy, zy, 0,
      xz, yz, zz, 0,
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

  function camera(t, time) {
    const motion = !mqReduce.matches
    const e = eyeAt(t),
      target = [key(t, 4), key(t, 5), key(t, 6)]
    if (motion) {
      // idle drift: slow yaw of the eye around the look-at point + a gentle bob
      const yaw = DRIFT.yaw * Math.sin(time * DRIFT.speed),
        dx = e[0] - target[0],
        dz = e[2] - target[2]
      e[0] = target[0] + dx * Math.cos(yaw) - dz * Math.sin(yaw)
      e[2] = target[2] + dx * Math.sin(yaw) + dz * Math.cos(yaw)
      e[1] += DRIFT.height * Math.sin(time * DRIFT.speed * 1.3) // gentle bob, metres
    }
    return {
      eye: e,
      target,
      focus: Math.hypot(e[0] - target[0], e[1] - target[1], e[2] - target[2]),
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

  // Side/dim per stop, blended continuously with scroll between neighbouring stops
  // (eased within each gap), so the dome never starts sliding with a jolt.
  function stopLook(st) {
    const side = st.el.dataset.redwoodSide,
      d = st.el.dataset.redwoodDim
    return {
      off: side === "left" ? -DEFAULT_OFFSET : side === "center" ? 0 : DEFAULT_OFFSET,
      dim: d != null && d !== "" ? clamp01(parseFloat(d) || 0) : 0,
    }
  }

  function compositionTargets() {
    const narrow = innerWidth <= NARROW_PX,
      S = state.stops,
      y = scrollY
    let c = { off: DEFAULT_OFFSET, dim: 0 }
    if (S.length) {
      c = stopLook(S[S.length - 1])
      if (y <= S[0].s) c = stopLook(S[0])
      else
        for (let i = 1; i < S.length; i++)
          if (y <= S[i].s) {
            const a = stopLook(S[i - 1]),
              b = stopLook(S[i]),
              u = S[i].s > S[i - 1].s ? (y - S[i - 1].s) / (S[i].s - S[i - 1].s) : 1,
              k = u * u * (3 - 2 * u)
            c = { off: lerp(a.off, b.off, k), dim: lerp(a.dim, b.dim, k) }
            break
          }
    }
    return { off: narrow ? 0 : c.off, dim: narrow ? Math.max(c.dim, NARROW_DIM) : c.dim }
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
      step = dt / THEME_FADE
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
    const cam = camera(state.t, state.time)
    const P = perspective(fov, asp, 2, 30000)
    gl.viewport(0, 0, W, Ht)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const pl = PALETTES.light,
      pd = PALETTES.dark,
      k = state.theme
    gl.uniformMatrix4fv(U.uVP, false, mul(P, lookAt(cam.eye, cam.target)))
    gl.uniform3fv(U.uBg, lerp3(hex(pl.bg), hex(pd.bg), k))
    gl.uniform3fv(U.uForest, lerp3(hex(pl.forest), hex(pd.forest), k))
    gl.uniform3fv(U.uGranite, lerp3(hex(pl.granite), hex(pd.granite), k))
    gl.uniform3fv(U.uSummit, lerp3(hex(pl.summit), hex(pd.summit), k))
    gl.uniform1f(U.uGain, lerp(pl.gain, pd.gain, k))
    // fog starts just past the look-at point
    gl.uniform2f(U.uFog, cam.focus * 1.1, cam.focus * 1.1 + 6000)
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
      canvas.id = "halfdome-canvas"
      canvas.setAttribute("aria-hidden", "true")
      const st = document.createElement("style")
      st.textContent =
        "#halfdome-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:-1;" +
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
