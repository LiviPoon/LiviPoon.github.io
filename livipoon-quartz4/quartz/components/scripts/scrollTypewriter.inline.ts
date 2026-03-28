/**
 * .scroll-typewriter
 *
 * Add this class to any element. Its text types in as the user scrolls,
 * finishing when the element reaches the vertical centre of the viewport.
 */

type ScrollTypewriterWindow = Window &
  typeof globalThis & {
    __scrollTypewriterCleanup?: () => void
  }

const stWindow = window as ScrollTypewriterWindow
const ST_SELECTOR = ".scroll-typewriter"

type STEntry = {
  el: HTMLElement
  text: string
  rendered: number
  offsetTop: number
}

function stClamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function stCacheTop(el: HTMLElement): number {
  return el.getBoundingClientRect().top + window.scrollY
}

function stProgress(entry: STEntry): number {
  const vh = window.innerHeight || 1
  const viewTop = entry.offsetTop - window.scrollY
  const start = vh
  const end = vh * 0.5
  if (viewTop >= start) return 0
  if (viewTop <= end) return 1
  return (start - viewTop) / (start - end)
}

function stEase(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function initScrollTypewriter() {
  stWindow.__scrollTypewriterCleanup?.()
  stWindow.__scrollTypewriterCleanup = undefined

  const elements = Array.from(document.querySelectorAll(ST_SELECTOR)) as HTMLElement[]
  if (elements.length === 0) return

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

  const entries: STEntry[] = []
  for (const el of elements) {
    let text = el.dataset.stFull
    if (!text) {
      text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      el.dataset.stFull = text
      el.setAttribute("aria-label", text)
    }
    if (text.length === 0) continue

    if (!el.dataset.stHeight) {
      const h = Math.ceil(el.getBoundingClientRect().height)
      el.dataset.stHeight = String(h)
      el.style.minHeight = `${h}px`
    }

    entries.push({ el, text, rendered: -1, offsetTop: stCacheTop(el) })
  }

  if (entries.length === 0) return

  let ticking = false

  const render = () => {
    ticking = false
    for (const entry of entries) {
      const t = stClamp(stProgress(entry), 0, 1)
      const chars = Math.round(stEase(t) * entry.text.length)
      if (chars !== entry.rendered) {
        entry.rendered = chars
        entry.el.textContent = entry.text.slice(0, chars)
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
    const tops = entries.map((e) => stCacheTop(e.el))
    for (let i = 0; i < entries.length; i++) entries[i].offsetTop = tops[i]
    onScroll()
  }

  render()
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("resize", onResize)

  stWindow.__scrollTypewriterCleanup = () => {
    window.removeEventListener("scroll", onScroll)
    window.removeEventListener("resize", onResize)
  }
}

document.addEventListener("nav", initScrollTypewriter)
initScrollTypewriter()
