type MissionTypewriterWindow = Window &
  typeof globalThis & {
    __pilcrowMissionTypewriterCleanup?: () => void
  }

const missionTypewriterWindow = window as MissionTypewriterWindow
const messageSelector = '.pilcrow-video-message[data-scroll-typewriter="true"]'

type TypewriterEntry = {
  element: HTMLElement
  text: string
  renderedChars: number
  docTop: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim()
}

function getScrollProgress(entry: TypewriterEntry): number {
  const vh = window.innerHeight || document.documentElement.clientHeight || 1
  const viewTop = entry.docTop - window.scrollY
  // Typing starts when element enters the bottom of the viewport,
  // finishes when element reaches near the top.
  const start = vh * 0.95
  const end = vh * 0.35
  if (viewTop >= start) return 0
  if (viewTop <= end) return 1
  return (start - viewTop) / (start - end)
}

function initMissionTypewriter() {
  missionTypewriterWindow.__pilcrowMissionTypewriterCleanup?.()
  missionTypewriterWindow.__pilcrowMissionTypewriterCleanup = undefined

  const elements = Array.from(document.querySelectorAll(messageSelector)) as HTMLElement[]
  if (elements.length === 0) return

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  // Prepare entries — all layout reads happen here before any writes.
  const entries: TypewriterEntry[] = []
  for (const el of elements) {
    const existing = el.dataset.scrollTypewriterFullText
    let text: string
    if (existing && existing.length > 0) {
      text = existing
    } else {
      text = normalizeText(el.textContent ?? "")
      el.dataset.scrollTypewriterFullText = text
      el.setAttribute("aria-label", text)
    }
    if (text.length === 0) continue

    // Lock height so layout doesn't jump as text changes.
    if (!el.dataset.scrollTypewriterMinHeight) {
      const h = Math.ceil(el.getBoundingClientRect().height)
      el.dataset.scrollTypewriterMinHeight = String(h)
      el.style.minHeight = `${h}px`
    }

    entries.push({
      element: el,
      text,
      renderedChars: -1,
      docTop: el.getBoundingClientRect().top + window.scrollY,
    })
  }

  if (entries.length === 0) return

  if (reducedMotion) {
    for (const e of entries) e.element.textContent = e.text
    return
  }

  // --- Core: direct scroll → chars mapping, no rAF loop ---

  let ticking = false

  const render = () => {
    ticking = false
    for (const entry of entries) {
      const progress = clamp(getScrollProgress(entry), 0, 1)
      // Ease-in so the first few characters appear gently.
      const eased = progress * progress
      const chars = Math.round(eased * entry.text.length)
      if (chars !== entry.renderedChars) {
        entry.renderedChars = chars
        entry.element.textContent = entry.text.slice(0, chars)
      }
    }
  }

  const onScroll = () => {
    if (!ticking) {
      ticking = true
      requestAnimationFrame(render)
    }
  }

  const onResize = () => {
    // Re-cache positions (batch reads).
    const tops = entries.map((e) => e.element.getBoundingClientRect().top + window.scrollY)
    for (let i = 0; i < entries.length; i++) entries[i].docTop = tops[i]
    onScroll()
  }

  // Initial render + listeners.
  render()
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("resize", onResize)

  missionTypewriterWindow.__pilcrowMissionTypewriterCleanup = () => {
    window.removeEventListener("scroll", onScroll)
    window.removeEventListener("resize", onResize)
  }
}

document.addEventListener("nav", initMissionTypewriter)
initMissionTypewriter()
