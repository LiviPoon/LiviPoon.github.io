type VantaEffect = {
  destroy: () => void
}

type VantaBirdsFactory = (options: Record<string, unknown>) => VantaEffect

type HomeVantaWindow = Window &
  typeof globalThis & {
    THREE?: unknown
    VANTA?: {
      BIRDS?: VantaBirdsFactory
    }
    __homeVantaBirdsEffect?: VantaEffect
    __homeVantaBirdsLayer?: HTMLDivElement
    __homeVantaBirdsLoading?: Promise<boolean>
  }

const homeWindow = window as HomeVantaWindow

const THREE_SOURCES = [
  "/three.r134.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.134.0/build/three.min.js",
]

const BIRDS_SOURCES = [
  "/vanta.birds.min.js",
  "https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.birds.min.js",
]

const colorParseCtx = document.createElement("canvas").getContext("2d")

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const selector = `script[data-home-vanta-src="${src}"]`
    const existing = document.querySelector(selector) as HTMLScriptElement | null
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve()
        return
      }
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error(`Failed loading ${src}`)), {
        once: true,
      })
      return
    }

    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.dataset.homeVantaSrc = src
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true"
        resolve()
      },
      { once: true },
    )
    script.addEventListener(
      "error",
      () => {
        reject(new Error(`Failed loading ${src}`))
      },
      { once: true },
    )
    document.head.appendChild(script)
  })
}

async function loadFromSources(sources: string[], ready: () => boolean): Promise<boolean> {
  if (ready()) return true
  for (const src of sources) {
    try {
      await loadScript(src)
      if (ready()) return true
    } catch {
      // try next source
    }
  }
  return ready()
}

async function ensureVantaBirdsLoaded(): Promise<boolean> {
  if (homeWindow.VANTA?.BIRDS) return true

  if (!homeWindow.__homeVantaBirdsLoading) {
    homeWindow.__homeVantaBirdsLoading = (async () => {
      const hasThree = await loadFromSources(THREE_SOURCES, () => Boolean(homeWindow.THREE))
      if (!hasThree) return false

      const hasBirds = await loadFromSources(BIRDS_SOURCES, () => Boolean(homeWindow.VANTA?.BIRDS))
      return hasBirds
    })()
  }

  return homeWindow.__homeVantaBirdsLoading.finally(() => {
    homeWindow.__homeVantaBirdsLoading = undefined
  })
}

function toColorNumber(value: string, fallback: number): number {
  if (!colorParseCtx) return fallback

  colorParseCtx.fillStyle = "#000000"
  colorParseCtx.fillStyle = value
  const normalized = colorParseCtx.fillStyle.toString().trim()

  if (normalized.startsWith("#")) {
    const raw = normalized.slice(1)
    if (raw.length === 3) {
      const expanded = raw
        .split("")
        .map((c) => `${c}${c}`)
        .join("")
      return Number.parseInt(expanded, 16)
    }
    if (raw.length === 6) {
      return Number.parseInt(raw, 16)
    }
  }

  const rgb = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!rgb) return fallback

  const r = Number.parseInt(rgb[1] ?? "0", 10)
  const g = Number.parseInt(rgb[2] ?? "0", 10)
  const b = Number.parseInt(rgb[3] ?? "0", 10)
  return (r << 16) + (g << 8) + b
}

function getThemeColor(variableName: string, fallbackHex: number): number {
  const style = getComputedStyle(document.documentElement)
  const raw = style.getPropertyValue(variableName).trim()
  if (!raw) return fallbackHex
  return toColorNumber(raw, fallbackHex)
}

function ensureLayer(): HTMLDivElement | null {
  const root = document.getElementById("quartz-root")
  if (!root) return null

  let layer = root.querySelector(".home-vanta-birds-layer") as HTMLDivElement | null
  if (!layer) {
    layer = document.createElement("div")
    layer.className = "home-vanta-birds-layer"
    root.prepend(layer)
  }

  homeWindow.__homeVantaBirdsLayer = layer
  return layer
}

function destroyVantaBirds() {
  if (homeWindow.__homeVantaBirdsEffect) {
    homeWindow.__homeVantaBirdsEffect.destroy()
    homeWindow.__homeVantaBirdsEffect = undefined
  }

  if (homeWindow.__homeVantaBirdsLayer) {
    homeWindow.__homeVantaBirdsLayer.remove()
    homeWindow.__homeVantaBirdsLayer = undefined
  }
}

async function setupHomeVantaBirds() {
  if (document.body.dataset.slug !== "index") {
    destroyVantaBirds()
    return
  }

  const layer = ensureLayer()
  if (!layer) return

  const loaded = await ensureVantaBirdsLoaded()
  if (!loaded || document.body.dataset.slug !== "index") return

  const factory = homeWindow.VANTA?.BIRDS
  if (!factory) return

  if (homeWindow.__homeVantaBirdsEffect) {
    homeWindow.__homeVantaBirdsEffect.destroy()
    homeWindow.__homeVantaBirdsEffect = undefined
  }

  const backgroundColor = getThemeColor("--light", 0xf9fded)
  const birdPalette = 0x359ad4
  const color1 = birdPalette
  const color2 = birdPalette
  const birdColor = birdPalette

  homeWindow.__homeVantaBirdsEffect = factory({
    el: layer,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200,
    minWidth: 200,
    scale: 1,
    scaleMobile: 1,
    backgroundColor,
    backgroundAlpha: 0,
    color1,
    color2,
    birdColor,
    birdSize: 0.9,
    wingSpan: 18,
    speedLimit: 0.9,
    separation: 78,
    alignment: 34,
    cohesion: 11,
    quantity: 3,
  })
}

document.addEventListener("nav", () => {
  void setupHomeVantaBirds()
})
