type HomeSideRailWindow = Window &
  typeof globalThis & {
    __homeSideRailCleanup?: () => void
  }

const homeSideRailWindow = window as HomeSideRailWindow

function normalizeLabel(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (cleaned.length === 0) return "SECTION"

  const upper = cleaned.toUpperCase()
  if (upper.length <= 18) return upper

  const compact = cleaned.split(" ").slice(0, 2).join(" ").toUpperCase()
  return compact.length > 0 ? compact : upper.slice(0, 18)
}

function getSectionLabel(section: HTMLElement, index: number): string {
  if (index === 0) return "INTRO"

  const heading = section.querySelector("h2, h3, h1")
  if (!heading) return `SECTION ${index + 1}`

  return normalizeLabel(heading.textContent ?? "")
}

function setupHomeSideRail() {
  homeSideRailWindow.__homeSideRailCleanup?.()
  homeSideRailWindow.__homeSideRailCleanup = undefined

  const body = document.body
  const slug = body?.dataset.slug
  const rail = document.querySelector<HTMLElement>("[data-home-side-rail]")
  const dotsHost = rail?.querySelector<HTMLOListElement>("[data-home-side-rail-dots]")
  const labelHost = rail?.querySelector<HTMLElement>("[data-home-side-rail-label]")
  if (!rail || !dotsHost || !labelHost) return

  const isMobile = window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches
  if (isMobile) {
    rail.hidden = true
    return
  }

  if (slug !== "index" && slug !== "index/index") {
    rail.hidden = true
    return
  }

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(".pilcrow-page > .pilcrow-section"),
  )
  if (sections.length < 2) {
    rail.hidden = true
    return
  }

  rail.hidden = false
  dotsHost.replaceChildren()

  type DotItem = {
    label: string
    link: HTMLAnchorElement
    section: HTMLElement
  }

  const items: DotItem[] = []

  sections.forEach((section, index) => {
    if (!section.id) {
      section.id = `home-section-${index + 1}`
    }

    const label = getSectionLabel(section, index)
    const li = document.createElement("li")
    li.className = "bryn-side-rail-item"

    const anchor = document.createElement("a")
    anchor.className = "bryn-side-rail-dot"
    anchor.href = `#${section.id}`
    anchor.setAttribute("aria-label", `Jump to ${label.toLowerCase()}`)
    anchor.setAttribute("data-no-popover", "true")

    li.appendChild(anchor)
    dotsHost.appendChild(li)
    items.push({ label, link: anchor, section })
  })

  let activeIndex = -1
  let rafId = 0

  const setActive = (index: number) => {
    if (index === activeIndex) return
    activeIndex = index

    items.forEach((item, itemIndex) => {
      item.link.classList.toggle("is-active", itemIndex === index)
    })

    labelHost.textContent = items[index]?.label ?? "INTRO"
  }

  const refreshActiveSection = () => {
    rafId = 0
    if (items.length === 0) return

    const bottomThreshold = 2
    const viewportBottom = window.scrollY + window.innerHeight
    const pageBottom = document.documentElement.scrollHeight
    if (viewportBottom >= pageBottom - bottomThreshold) {
      setActive(items.length - 1)
      return
    }

    const focusY = window.innerHeight * 0.28
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    items.forEach((item, index) => {
      const rect = item.section.getBoundingClientRect()
      const distance = Math.abs(rect.top - focusY)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })

    setActive(bestIndex)
  }

  const requestRefresh = () => {
    if (rafId !== 0) return
    rafId = window.requestAnimationFrame(refreshActiveSection)
  }

  const onScroll = () => requestRefresh()
  const onResize = () => requestRefresh()

  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("resize", onResize)

  items.forEach((item, index) => {
    item.link.addEventListener("click", () => {
      setActive(index)
    })
  })

  requestRefresh()

  homeSideRailWindow.__homeSideRailCleanup = () => {
    window.removeEventListener("scroll", onScroll)
    window.removeEventListener("resize", onResize)
    if (rafId !== 0) {
      window.cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      homeSideRailWindow.__homeSideRailCleanup?.()
      homeSideRailWindow.__homeSideRailCleanup = undefined
    })
  }
}

document.addEventListener("nav", setupHomeSideRail)
setupHomeSideRail()
