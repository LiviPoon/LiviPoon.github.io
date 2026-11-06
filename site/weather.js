/* ===========================================================
   weather.js — atmospheric layers drawn through the point-cloud engines' layer hooks.
   Dependency-free classic script (IIFE). Everything animates on the GPU from one time
   uniform: static vertex buffers, no per-frame CPU work, one draw call per effect.

   Everything is drawn as small soft discs (gl.POINTS), the same look as the scanned models.
   - Redwood (homepage):   GROUND MIST. A low, light layer of points drifting around the trunk base.
   - Catalina (achievements): CLOUDS. Billowing cumulus plus flat marine-layer sheets built from
                           point clusters drifting on a wind with altitude shear.
   - Half Dome (CV):       ROLLING FOG. Point banks that hug the valley floor (height map built from
                           the scan itself), roll in slow swells and thin out up the walls.

   Hooks: window.RedwoodLayers / CatalinaLayers / HalfDomeLayers = [{ init(gl, api), draw(gl, f) }].
   Opt out with ?weather=off. Reduced motion: everything renders frozen.
=========================================================== */
;(function () {
  "use strict"

  if (new URLSearchParams(location.search).get("weather") === "off") return
  const conn = navigator.connection || {}
  if (conn.saveData) return

  /* ---------------- helpers ---------------- */
  const lerp = (a, b, k) => a + (b - a) * k
  const lerp3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k))
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const mulberry = (a) => () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const mix = (spec, k) => lerp3(hex(spec[0]), hex(spec[1]), k) // [light, dark] colours

  function program(gl, vsSrc, fsSrc) {
    const sh = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
      return s
    }
    const p = gl.createProgram()
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
    const U = {}
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const nm = gl.getActiveUniform(p, i).name
      U[nm] = gl.getUniformLocation(p, nm)
    }
    return { p, U }
  }

  /* ---------------- CLOUDS & FOG (point clusters) ---------------- */
  const GRID = 64 // ground height map resolution (fog only)

  const PUFF_VS = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  layout(location=0) in vec4 aA; // cloud centre x,z (fractions of the wrap square), height 0..1, radius (m)
  layout(location=1) in vec4 aB; // point offset in radii (x,y,z), size 0..1
  layout(location=2) in vec3 aC; // alpha multiplier, lit 0..1 (shadowed..sunlit), lobe phase
  uniform mat4 uVP;
  uniform sampler2D uGround;
  uniform vec4 uGrid;            // x0, z0, 1/sizeX, 1/sizeZ of the height map
  uniform vec3 uWrap;            // wrap square centre x, z, side
  uniform vec4 uAlt;             // base, span, follow ground (0/1), wind shear (lower layers slower)
  uniform vec2 uWind, uValley;   // m/s ; fog: valley floor height, fade-out range up the walls
  uniform vec3 uLit, uShade, uRoll; // colours ; roll depth, wavelength (m), speed (rad/s)
  uniform float uTime, uOffset, uPx, uAlpha, uMinPx, uMaxPx, uBillow, uSizeK, uTurb;
  out vec4 vCol;
  float gnd(vec2 xz) {
    vec2 g = (xz - uGrid.xy) * uGrid.zw * float(${GRID}) - 0.5;
    ivec2 i0 = ivec2(floor(g)); vec2 f = fract(g);
    ivec2 a = clamp(i0, 0, ${GRID - 1}), b = clamp(i0 + 1, 0, ${GRID - 1});
    return mix(mix(texelFetch(uGround, ivec2(a.x, a.y), 0).r, texelFetch(uGround, ivec2(b.x, a.y), 0).r, f.x),
               mix(texelFetch(uGround, ivec2(a.x, b.y), 0).r, texelFetch(uGround, ivec2(b.x, b.y), 0).r, f.x), f.y);
  }
  void main() {
    float id = fract(sin(dot(aA.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float sh = mix(1.0, uAlt.w, aA.z);
    vec2 c = aA.xy * uWrap.z + uWind * sh * uTime;               // drifting cloud centre
    vec2 rel = mod(c + 0.5 * uWrap.z, uWrap.z) - 0.5 * uWrap.z;  // wrapped around the square
    vec2 xz = uWrap.xy + rel;
    float edge = 1.0 - smoothstep(0.34, 0.5, max(abs(rel.x), abs(rel.y)) / uWrap.z);
    float gy = 0.0, vis = 1.0;
    if (uAlt.z > 0.5) {
      gy = gnd(xz);
      vis = 1.0 - smoothstep(uValley.x, uValley.x + uValley.y, gy); // fog thins up the valley walls
    }
    // each lobe breathes and shears against its neighbours: the cloud boils slowly
    float bl = 1.0 + uBillow * sin(uTime * (0.16 + 0.08 * id) + aC.z);
    float ang = uBillow * 1.6 * sin(uTime * 0.11 + aC.z * 0.5 + id * 6.0);
    vec3 off = vec3(aB.x * cos(ang) - aB.z * sin(ang), aB.y * (1.0 + 0.5 * uBillow * sin(uTime * 0.2 + aC.z)), aB.x * sin(ang) + aB.z * cos(ang));
    vec3 centre = vec3(xz.x, gy + uAlt.x + aA.z * uAlt.y, xz.y);
    // coherent flow: neighbouring points sample nearly the same field so they move as one body,
    // the finer octave and the per-point jitter let them part company
    vec3 q = off * 1.6 + vec3(id * 17.0, id * 7.0, id * 5.0);
    vec3 f1 = vec3(sin(q.y * 1.7 + q.z * 1.1 + uTime * 0.21), sin(q.z * 1.5 + q.x * 1.3 + uTime * 0.17), sin(q.x * 1.6 + q.y * 1.2 + uTime * 0.19));
    vec3 q2 = q * 2.9;
    vec3 f2 = vec3(sin(q2.y * 1.3 + q2.z + uTime * 0.43), sin(q2.z * 1.1 + q2.x * 1.4 + uTime * 0.37), sin(q2.x * 1.2 + q2.y * 0.9 + uTime * 0.41));
    vec3 jit = vec3(sin(uTime * 0.9 + aB.w * 50.0), sin(uTime * 0.7 + aB.w * 31.0), sin(uTime * 0.8 + aB.w * 17.0));
    off += (f1 + 0.35 * f2 + 0.12 * jit) * uTurb;
    vec3 pos = centre + off * aA.w * bl;
    float roll = 1.0 - uRoll.x + uRoll.x * (0.5 + 0.5 * sin(dot(xz, vec2(0.8, 0.6)) / uRoll.y - uTime * uRoll.z + id * 6.28));
    vec4 clip = uVP * vec4(pos, 1.0);
    float d = clip.w;
    clip.x += uOffset * 2.0 * clip.w;
    gl_Position = clip;
    float size = aA.w * (0.35 + 0.6 * aB.w) * uSizeK * uPx / max(d, 1.0);
    float a = uAlpha * aC.x * edge * vis * roll;
    a *= 1.0 - smoothstep(0.25, 0.7, size / uMaxPx);             // dissolve instead of filling the lens
    if (size < uMinPx) { a *= size * size / (uMinPx * uMinPx); size = uMinPx; }
    gl_PointSize = min(size, uMaxPx);
    a *= 1.0 + 0.16 * sin(uTime * (0.6 + 1.4 * aB.w) + aB.w * 40.0 + id * 9.0); // same twinkle as the models
    vCol = vec4(mix(uShade, uLit, clamp(0.2 + aC.y * 0.95, 0.0, 1.0)), clamp(a, 0.0, 1.0));
  }`
  const PUFF_FS = `#version 300 es
  precision mediump float;
  in vec4 vCol; out vec4 o;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float a = vCol.a * (1.0 - smoothstep(0.6, 1.0, r2));         // same disc as the models
    o = vec4(vCol.rgb * a, a);
  }`

  // Coarse ground height map from the scan: per-cell minimum, gaps filled, blurred.
  function groundMap(bin) {
    const [x0, , z0] = bin.min,
      [x1, , z1] = bin.max
    const q = new Uint16Array(bin.buf, 48, bin.count * 3),
      g = new Float32Array(GRID * GRID).fill(Infinity),
      sx = (x1 - x0) / 65535,
      sy = (bin.max[1] - bin.min[1]) / 65535
    for (let i = 0; i < bin.count; i++) {
      const cx = Math.min(GRID - 1, ((q[i * 3] / 65535) * GRID) | 0),
        cz = Math.min(GRID - 1, ((q[i * 3 + 2] / 65535) * GRID) | 0),
        y = bin.min[1] + q[i * 3 + 1] * sy
      if (y < g[cz * GRID + cx]) g[cz * GRID + cx] = y
    }
    const ok = [...g].filter(isFinite).sort((a, b) => a - b)
    const floor = ok.length ? ok[Math.floor(ok.length * 0.2)] : bin.min[1]
    for (let i = 0; i < g.length; i++) if (!isFinite(g[i])) g[i] = floor
    for (let pass = 0; pass < 2; pass++) {
      const s = g.slice()
      for (let z = 0; z < GRID; z++)
        for (let x = 0; x < GRID; x++) {
          let sum = 0,
            c = 0
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx,
                zz = z + dz
              if (xx >= 0 && zz >= 0 && xx < GRID && zz < GRID) (sum += s[zz * GRID + xx]), c++
            }
          g[z * GRID + x] = sum / c
        }
    }
    return { g, floor, grid: [x0, z0, 1 / (x1 - x0), 1 / (z1 - z0)] }
  }

  // Cauliflower clouds: each cloud is several overlapping lobes, a dome of them with a flat base.
  // Points sit mostly on the lobe shells, so the silhouette is bumpy; lit follows the surface normal.
  function puffData(pops, scale) {
    const rnd = mulberry(23),
      gs = () => rnd() + rnd() + rnd() - 1.5, // ~N(0, 0.5)
      rows = []
    for (const pop of pops)
      for (let c = 0, nc = Math.round(pop.clouds * scale); c < nc; c++) {
        const cx = rnd() - 0.5,
          cz = rnd() - 0.5,
          cy = lerp(pop.cy[0], pop.cy[1], rnd()),
          R = lerp(pop.R[0], pop.R[1], rnd()),
          nl = pop.lobes[0] + Math.floor(rnd() * (pop.lobes[1] - pop.lobes[0] + 1)),
          lobes = []
        for (let l = 0; l < nl; l++) {
          const lx = gs() * pop.spread[0],
            lz = gs() * pop.spread[2],
            d = Math.min(1, Math.hypot(lx / pop.spread[0], lz / pop.spread[2]) * 1.3)
          lobes.push({
            x: lx,
            z: lz,
            y: pop.hs * (1 - d * d) * (0.35 + 0.65 * rnd()), // taller toward the middle: a dome
            r: pop.lobeR * (0.6 + 0.8 * rnd()) * (1 - 0.45 * d),
            ph: rnd() * 6.283,
          })
        }
        const top = Math.max(...lobes.map((b) => b.y + b.r))
        for (let k = 0; k < pop.sprites; k++) {
          const b = lobes[k % nl]
          let dx = gs(),
            dy = gs(),
            dz = gs()
          const m = Math.hypot(dx, dy, dz) || 1,
            shell = b.r * (0.6 + 0.4 * Math.sqrt(rnd()))
          dx /= m
          dy /= m
          dz /= m
          const y = Math.max(b.y + dy * shell, rnd() * 0.14) // soft flat base
          const lit = Math.min(1, 0.6 * (0.5 * dy + 0.5) + 0.4 * (y / top))
          rows.push(
            cx, cz, cy, R,
            b.x + dx * shell, y, b.z + dz * shell, 0.35 + 0.65 * rnd(),
            pop.alpha * (0.7 + 0.6 * rnd()), lit, b.ph,
          ) // prettier-ignore
        }
      }
    return new Float32Array(rows)
  }

  function puffLayer(cfg) {
    let P, vao, n, ground, gm, tier, api
    function build(gl) {
      P = program(gl, PUFF_VS, PUFF_FS)
      const data = puffData(cfg.pops, tier === "hi" ? 1 : matchMedia("(pointer: coarse)").matches ? 0.4 : 0.6)
      n = data.length / 11
      vao = gl.createVertexArray()
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      ;[
        [0, 4, 0],
        [1, 4, 16],
        [2, 3, 32],
      ].forEach(([loc, size, off]) => {
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 44, off)
      })
      // ground height texture (fog), or a flat 2-texel stand-in (clouds)
      gm = cfg.followGround && api.bin ? groundMap(api.bin) : null
      const N = gm ? GRID : 2,
        arr = gm ? gm.g : new Float32Array(4)
      ground = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, ground)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, N, N, 0, gl.RED, gl.FLOAT, arr)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.useProgram(P.p)
      gl.uniform1i(P.U.uGround, 0)
    }
    return {
      init(gl, a) {
        api = a
        tier = a.tier || "lo"
        build(gl)
      },
      draw(gl, f) {
        if (!gl.isProgram(P.p)) build(gl) // context was restored
        const U = P.U,
          th = f.theme
        gl.useProgram(P.p)
        gl.bindVertexArray(vao)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, ground)
        gl.uniformMatrix4fv(U.uVP, false, f.VP)
        gl.uniform4fv(U.uGrid, gm ? gm.grid : [0, 0, 1, 1])
        gl.uniform3fv(U.uWrap, cfg.wrap)
        gl.uniform4fv(U.uAlt, cfg.alt)
        gl.uniform2fv(U.uWind, cfg.wind)
        gl.uniform2f(U.uValley, gm ? gm.floor + cfg.valley[0] : 0, cfg.valley[1])
        gl.uniform3fv(U.uLit, mix(cfg.lit, th))
        gl.uniform3fv(U.uShade, mix(cfg.shade, th))
        gl.uniform3fv(U.uRoll, cfg.roll)
        gl.uniform1f(U.uTime, f.time)
        gl.uniform1f(U.uOffset, f.offset)
        gl.uniform1f(U.uPx, f.px)
        gl.uniform1f(U.uAlpha, cfg.alpha * lerp(1, cfg.darkGain, th) * (1 - f.dim * 0.5))
        gl.uniform1f(U.uMinPx, 1.4 * f.dpr)
        gl.uniform1f(U.uMaxPx, Math.min(f.maxPt, 14 * f.dpr))
        gl.uniform1f(U.uBillow, f.reduced ? 0 : cfg.billow)
        gl.uniform1f(U.uSizeK, cfg.sizeK)
        gl.uniform1f(U.uTurb, f.reduced ? 0 : cfg.turb)
        gl.drawArrays(gl.POINTS, 0, n)
      },
    }
  }

  // Catalina: cumulus + flat marine-layer sheets above the 1440 m peak; the flight descends through them
  const CLOUDS = {
    wrap: [-2500, -2500, 80000],
    alt: [1800, 900, 0, 0.65],
    wind: [55, 20], // m/s: brisk on purpose, the camera is kilometres away
    valley: [0, 1],
    roll: [0, 1000, 0],
    alpha: 1,
    darkGain: 0.85,
    billow: 0.1,
    turb: 0.1,
    sizeK: 0.024,
    lit: ["#9db0be", "#dfe7ee"],
    shade: ["#52626d", "#7a8791"],
    pops: [
      { clouds: 50, sprites: 2600, R: [1500, 3000], cy: [0, 1], lobes: [8, 12], lobeR: 0.5, hs: 0.9, spread: [0.7, 0, 0.7], alpha: 0.5 },
      { clouds: 14, sprites: 2400, R: [3500, 6000], cy: [0, 0.25], lobes: [10, 16], lobeR: 0.3, hs: 0.1, spread: [1.8, 0, 1.8], alpha: 0.35 },
    ],
  }
  // Half Dome: rolling valley fog following the ground
  const FOG = {
    wrap: [0, 0, 7000],
    alt: [15, 300, 1, 0.55],
    wind: [8, 3],
    valley: [100, 520], // above the valley floor: where fog starts to thin / is gone
    roll: [0.55, 900, 0.16],
    alpha: 1,
    darkGain: 0.9,
    billow: 0.09,
    turb: 0.12,
    sizeK: 0.016,
    followGround: true,
    lit: ["#8d9ca3", "#c3ced5"],
    shade: ["#56636a", "#76828a"],
    pops: [{ clouds: 100, sprites: 1100, R: [320, 650], cy: [0, 1], lobes: [5, 8], lobeR: 0.45, hs: 0.3, spread: [1.5, 0, 0.8], alpha: 0.5 }],
  }

  // Redwood: a low, light mist on the forest floor drifting around the trunk (base at 0,0,0)
  const MIST = {
    wrap: [0, 0, 70],
    alt: [0.1, 1.6, 0, 0.6],
    wind: [0.5, 0.2], // m/s
    valley: [0, 1],
    roll: [0.45, 14, 0.35],
    alpha: 1,
    darkGain: 0.9,
    billow: 0.12,
    turb: 0.14,
    sizeK: 0.03,
    lit: ["#9aa8ae", "#cdd7dd"],
    shade: ["#5f6d73", "#7b878f"],
    pops: [{ clouds: 34, sprites: 500, R: [6, 12], cy: [0, 1], lobes: [4, 7], lobeR: 0.4, hs: 0.14, spread: [1, 0, 1], alpha: 0.32 }],
  }

  /* ---------------- registration ---------------- */
  const push = (key, layer) => {
    const arr = (window[key] = window[key] || [])
    arr.push(layer)
  }
  // phones show the tree dimmed to 15% behind the text: the mist would cost GPU and not be seen
  if (window.Redwood && innerWidth > 767) push("RedwoodLayers", puffLayer(MIST))
  if (window.Catalina) push("CatalinaLayers", puffLayer(CLOUDS))
  if (window.HalfDome) push("HalfDomeLayers", puffLayer(FOG))
})()
