function getSectionDotLabel(section: HTMLElement, index: number): string {
  const explicit = section.getAttribute("data-section-label")
  if (explicit) return explicit
  if (index === 0) return "Intro"
  const heading = section.querySelector("h1, h2, h3")
  const text = heading?.textContent?.replace(/\s+/g, " ").trim() ?? ""
  if (!text) return `Section ${index + 1}`
  return text.split(" ").slice(0, 3).join(" ")
}

function buildHomeDotsFromSections(nav: HTMLElement) {
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(".pilcrow-clone > section"),
  ).filter((section) => !section.classList.contains("pilcrow-section-video"))
  if (sections.length === 0) return null

  sections.forEach((section, index) => {
    if (!section.id) section.id = `home-section-${index + 1}`
  })

  nav.replaceChildren()
  sections.forEach((section, index) => {
    const label = getSectionDotLabel(section, index)
    const a = document.createElement("a")
    a.className = "sdot"
    a.href = `#${section.id}`
    a.setAttribute("aria-label", label)
    a.setAttribute("data-no-popover", "true")
    a.tabIndex = -1

    const labelEl = document.createElement("span")
    labelEl.className = "sdot-label"
    labelEl.textContent = label

    const pip = document.createElement("span")
    pip.className = "sdot-pip"

    a.appendChild(labelEl)
    a.appendChild(pip)
    nav.appendChild(a)
  })

  return sections
}

function setupSectionDots() {
  const nav = document.querySelector<HTMLElement>("[data-section-dots]")
  if (!nav) return

  const isMobile = window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches
  if (isMobile) {
    nav.hidden = true
    return
  }

  nav.hidden = false

  const isHome = nav.hasAttribute("data-home-sections")
  let targets: HTMLElement[]

  if (isHome) {
    const sections = buildHomeDotsFromSections(nav)
    if (!sections || sections.length === 0) return
    targets = sections
  } else {
    const dots = Array.from(nav.querySelectorAll<HTMLAnchorElement>(".sdot"))
    if (dots.length === 0) return
    targets = dots
      .map((dot) => document.getElementById(dot.dataset.for ?? ""))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return
  }

  const getDots = () => Array.from(nav.querySelectorAll<HTMLAnchorElement>(".sdot"))

  let activeIndex = -1
  let rafId = 0

  const setActive = (index: number) => {
    if (index === activeIndex) return
    activeIndex = index
    getDots().forEach((dot, i) => dot.classList.toggle("sdot--active", i === index))
  }

  const refresh = () => {
    rafId = 0
    const bottomThreshold = 2
    const viewportBottom = window.scrollY + window.innerHeight
    const pageBottom = document.documentElement.scrollHeight
    if (viewportBottom >= pageBottom - bottomThreshold) {
      setActive(targets.length - 1)
      return
    }

    const focusY = window.innerHeight * 0.3
    let bestIndex = 0
    let bestDist = Number.POSITIVE_INFINITY
    targets.forEach((target, i) => {
      const dist = Math.abs(target.getBoundingClientRect().top - focusY)
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = i
      }
    })
    setActive(bestIndex)
  }

  const requestRefresh = () => {
    if (rafId !== 0) return
    rafId = window.requestAnimationFrame(refresh)
  }

  window.addEventListener("scroll", requestRefresh, { passive: true })
  window.addEventListener("resize", requestRefresh)

  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      window.removeEventListener("scroll", requestRefresh)
      window.removeEventListener("resize", requestRefresh)
      if (rafId !== 0) window.cancelAnimationFrame(rafId)
    })
  }

  requestRefresh()
}

document.addEventListener("nav", setupSectionDots)
setupSectionDots()
