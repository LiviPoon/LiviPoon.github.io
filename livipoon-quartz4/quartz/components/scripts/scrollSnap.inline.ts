;(function () {
  function isHomePage(): boolean {
    const slug = document.body.getAttribute("data-slug") ?? ""
    return slug === "index" || slug === "index/index"
  }

  function getSnapSections(): HTMLElement[] {
    return [
      document.querySelector<HTMLElement>(".pilcrow-clone > .pilcrow-hero"),
      ...Array.from(document.querySelectorAll<HTMLElement>(".pilcrow-clone > .pilcrow-section")),
    ].filter((el): el is HTMLElement => el !== null)
  }

  function getNearestIndex(sections: HTMLElement[]): number {
    let bestIndex = 0
    let bestDist = Infinity
    for (let i = 0; i < sections.length; i++) {
      const dist = Math.abs(sections[i].getBoundingClientRect().top)
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = i
      }
    }
    return bestIndex
  }

  let onWheel: ((e: WheelEvent) => void) | null = null
  let onKeydown: ((e: KeyboardEvent) => void) | null = null
  let onScrollEnd: (() => void) | null = null

  function teardown() {
    if (onWheel) window.removeEventListener("wheel", onWheel)
    if (onKeydown) window.removeEventListener("keydown", onKeydown)
    if (onScrollEnd) window.removeEventListener("scrollend", onScrollEnd)
    onWheel = onKeydown = onScrollEnd = null
  }

  function setup() {
    teardown()
    if (!isHomePage()) return
    if (window.innerWidth <= 980) return

    const COOLDOWN = 700    // ms to block after a snap — covers smooth scroll duration
    const THRESHOLD = 60    // min accumulated deltaY before snap fires
    let lastSnap = 0
    let pendingDelta = 0
    let targetIndex = -1
    let resetTimer: ReturnType<typeof setTimeout> | null = null

    function snapTo(sections: HTMLElement[], index: number) {
      const clamped = Math.max(0, Math.min(index, sections.length - 1))
      targetIndex = clamped
      sections[clamped].scrollIntoView({ behavior: "smooth", block: "start" })
      lastSnap = Date.now()
    }

    onWheel = (e: WheelEvent) => {
      if (!isHomePage()) return
      e.preventDefault()

      const now = Date.now()
      if (now - lastSnap < COOLDOWN) {
        // Still in cooldown — clear delta so trailing gesture events don't stack up
        pendingDelta = 0
        return
      }

      pendingDelta += e.deltaY

      // Reset if user pauses between gestures
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => { pendingDelta = 0 }, 100)

      if (Math.abs(pendingDelta) < THRESHOLD) return

      const dir = pendingDelta > 0 ? 1 : -1
      pendingDelta = 0

      const sections = getSnapSections()
      if (targetIndex < 0) targetIndex = getNearestIndex(sections)
      snapTo(sections, targetIndex + dir)
    }

    onKeydown = (e: KeyboardEvent) => {
      if (!isHomePage()) return
      if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(e.key)) return
      if (Date.now() - lastSnap < COOLDOWN) return
      e.preventDefault()
      const sections = getSnapSections()
      if (targetIndex < 0) targetIndex = getNearestIndex(sections)
      const dir = e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 1
      snapTo(sections, targetIndex + dir)
    }

    // Re-sync if user clicks a section dot
    onScrollEnd = () => {
      if (Date.now() - lastSnap > COOLDOWN) {
        targetIndex = getNearestIndex(getSnapSections())
      }
    }

    window.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKeydown)
    window.addEventListener("scrollend", onScrollEnd)
  }

  document.addEventListener("nav", setup)
  setup()

  if (typeof window.addCleanup === "function") {
    window.addCleanup(teardown)
  }
})()
