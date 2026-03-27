const LOADING_CLASS = "quartz-loading"
const LEAVING_CLASS = "quartz-loading-leaving"
const HOME_MIN_VISIBLE_MS = 2000
const OTHER_SHOW_DELAY_MS = 1000
const OTHER_MIN_VISIBLE_MS = 180
const FADE_MS = 240
const MAX_MEDIA_WAIT_MS = 1400
const FAILSAFE_MS = 10000

let cycleToken = 0
let loadingStartedAt = performance.now()
let minVisibleMs = OTHER_MIN_VISIBLE_MS
let loaderVisible = false
let pendingShowTimeout: number | null = null
let failsafeTimeout: number | null = null
let initialLoadComplete = document.readyState === "complete"

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function isMainSlug(slug: string | undefined): boolean {
  if (!slug) return true
  return slug === "index" || slug === "index/index" || slug === "/"
}

function getCurrentSlug(): string | undefined {
  const bodySlug = document.body?.dataset?.slug
  if (bodySlug && bodySlug.length > 0) {
    return bodySlug
  }

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/"
  if (pathname === "/" || pathname === "/index") {
    return "index"
  }

  return pathname.startsWith("/") ? pathname.slice(1) : pathname
}

function isMainPage(): boolean {
  return isMainSlug(getCurrentSlug())
}

function getRoot(): HTMLElement | null {
  return document.getElementById("quartz-root")
}

function markRootHidden(hidden: boolean) {
  const root = getRoot()
  if (!root) return
  if (hidden) {
    root.setAttribute("aria-hidden", "true")
  } else {
    root.removeAttribute("aria-hidden")
  }
}

function isLikelyInViewport(image: HTMLImageElement): boolean {
  const rect = image.getBoundingClientRect()
  const verticalMargin = window.innerHeight * 0.4
  return rect.bottom >= -verticalMargin && rect.top <= window.innerHeight + verticalMargin
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const done = () => {
      image.removeEventListener("load", done)
      image.removeEventListener("error", done)
      resolve()
    }

    image.addEventListener("load", done, { once: true })
    image.addEventListener("error", done, { once: true })
  })
}

async function waitForCriticalImages() {
  const root = getRoot()
  if (!root) return

  const images = Array.from(root.querySelectorAll("img"))
  if (images.length === 0) return

  const criticalImages = images.filter((image) => {
    if (image.loading !== "lazy") return true
    return isLikelyInViewport(image)
  })

  if (criticalImages.length === 0) return

  await Promise.race([
    Promise.all(criticalImages.map((image) => waitForImage(image))).then(() => {}),
    delay(MAX_MEDIA_WAIT_MS),
  ])
}

function clearPendingShow() {
  if (pendingShowTimeout !== null) {
    window.clearTimeout(pendingShowTimeout)
    pendingShowTimeout = null
  }
}

function clearFailsafe() {
  if (failsafeTimeout !== null) {
    window.clearTimeout(failsafeTimeout)
    failsafeTimeout = null
  }
}

function armFailsafe(token: number) {
  clearFailsafe()
  failsafeTimeout = window.setTimeout(() => {
    if (token !== cycleToken) return

    clearPendingShow()
    loaderVisible = false
    markRootHidden(false)
    document.documentElement.classList.remove(LOADING_CLASS)
    document.documentElement.classList.remove(LEAVING_CLASS)
  }, FAILSAFE_MS)
}

function showLoader(token: number, minimumVisibleMs: number) {
  if (token !== cycleToken) return

  loadingStartedAt = performance.now()
  minVisibleMs = minimumVisibleMs
  loaderVisible = true
  markRootHidden(true)
  document.documentElement.classList.remove(LEAVING_CLASS)
  document.documentElement.classList.add(LOADING_CLASS)
  armFailsafe(token)
}

function startLoadingImmediately(minimumVisibleMs: number) {
  const token = ++cycleToken
  clearPendingShow()
  clearFailsafe()
  showLoader(token, minimumVisibleMs)
}

function startLoadingDeferred(delayMs: number, minimumVisibleMs: number) {
  const token = ++cycleToken
  clearPendingShow()
  clearFailsafe()

  pendingShowTimeout = window.setTimeout(() => {
    pendingShowTimeout = null
    showLoader(token, minimumVisibleMs)
  }, delayMs)
}

async function hideLoader() {
  const token = cycleToken
  await waitForCriticalImages()

  if (token !== cycleToken) return

  if (pendingShowTimeout !== null) {
    clearPendingShow()
    return
  }

  if (!loaderVisible) {
    markRootHidden(false)
    return
  }

  const elapsed = performance.now() - loadingStartedAt
  if (elapsed < minVisibleMs) {
    await delay(minVisibleMs - elapsed)
  }

  if (token !== cycleToken) return

  markRootHidden(false)
  document.documentElement.classList.add(LEAVING_CLASS)
  await delay(FADE_MS)

  if (token !== cycleToken) return

  loaderVisible = false
  clearFailsafe()
  document.documentElement.classList.remove(LOADING_CLASS)
  document.documentElement.classList.remove(LEAVING_CLASS)
}

if (isMainPage()) {
  startLoadingImmediately(HOME_MIN_VISIBLE_MS)
} else {
  startLoadingDeferred(OTHER_SHOW_DELAY_MS, OTHER_MIN_VISIBLE_MS)
}

if (document.readyState === "complete") {
  initialLoadComplete = true
  void hideLoader()
} else {
  window.addEventListener(
    "load",
    () => {
      initialLoadComplete = true
      void hideLoader()
    },
    { once: true },
  )
}

document.addEventListener("prenav", () => {
  startLoadingDeferred(OTHER_SHOW_DELAY_MS, OTHER_MIN_VISIBLE_MS)
})

document.addEventListener("nav", () => {
  if (!initialLoadComplete) return
  void hideLoader()
})
