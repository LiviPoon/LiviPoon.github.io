type ResearchPortfolioWindow = Window &
  typeof globalThis & {
    __researchPortfolioCleanup?: () => void
  }

const rpWindow = window as ResearchPortfolioWindow

function initResearchPortfolio() {
  rpWindow.__researchPortfolioCleanup?.()

  const page = document.querySelector<HTMLElement>(".rp-page")
  const body = document.body
  if (!page) {
    body.classList.remove("rp-portfolio-active", "rp-ready", "rp-nav-hidden", "rp-nav-blur")
    return
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const cleanup: Array<() => void> = []
  let lastScrollY = window.scrollY
  let ticking = false
  let navHidden = false
  let navBlurred = false
  let cursorRaf = 0
  let idleTimer = 0
  let cursorX = -100
  let cursorY = -100
  let targetX = -100
  let targetY = -100

  body.classList.add("rp-portfolio-active")
  window.setTimeout(() => body.classList.add("rp-ready"), 40)

  const scenes = Array.from(page.querySelectorAll<HTMLElement>(".rp-scene"))

  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add("in-view")
      }
    },
    {
      rootMargin: "0px 0px -15% 0px",
      threshold: 0.12,
    },
  )

  scenes.forEach((scene) => revealObserver.observe(scene))
  cleanup.push(() => revealObserver.disconnect())
  scenes[0]?.classList.add("in-view")

  function updateNav() {
    const current = window.scrollY
    const goingDown = current > lastScrollY && current > 120
    const shouldHide = goingDown
    const shouldBlur = current > 32 && !goingDown
    if (shouldHide !== navHidden) {
      body.classList.toggle("rp-nav-hidden", shouldHide)
      navHidden = shouldHide
    }
    if (shouldBlur !== navBlurred) {
      body.classList.toggle("rp-nav-blur", shouldBlur)
      navBlurred = shouldBlur
    }
    lastScrollY = Math.max(current, 0)
  }

  const parallaxItems = Array.from(page.querySelectorAll<HTMLElement>("[data-rp-parallax]"))
  let parallaxMetrics: Array<{ item: HTMLElement; speed: number; top: number; height: number }> = []

  function measureParallax() {
    parallaxMetrics = parallaxItems.map((item) => {
      const rect = item.getBoundingClientRect()
      return {
        item,
        speed: Number(item.dataset.rpParallax ?? "0.4"),
        top: rect.top + window.scrollY,
        height: rect.height,
      }
    })
  }

  function updateParallax() {
    if (reducedMotion || window.innerWidth <= 768) return
    const scrollY = window.scrollY
    const viewportHeight = window.innerHeight
    for (const { item, speed, top, height } of parallaxMetrics) {
      if (top + height < scrollY - viewportHeight * 0.35 || top > scrollY + viewportHeight * 1.35) {
        continue
      }
      const viewportMid = window.innerHeight * 0.5
      const itemMid = top - scrollY + height * 0.5
      const offset = (viewportMid - itemMid) * speed * 0.18
      item.style.setProperty("--rp-y", `${offset.toFixed(2)}px`)
      item.style.transform = `translate3d(0, var(--rp-y), 0)`
    }
  }

  function handleScroll() {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(() => {
      updateNav()
      updateParallax()
      ticking = false
    })
  }

  function handleResize() {
    measureParallax()
    handleScroll()
  }

  measureParallax()
  window.addEventListener("scroll", handleScroll, { passive: true })
  window.addEventListener("resize", handleResize, { passive: true })
  cleanup.push(() => {
    window.removeEventListener("scroll", handleScroll)
    window.removeEventListener("resize", handleResize)
  })
  handleScroll()

  const cursor = document.createElement("div")
  cursor.className = "rp-cursor"
  cursor.setAttribute("aria-hidden", "true")
  document.body.appendChild(cursor)

  function isFinePointer() {
    return (
      window.matchMedia("(pointer: fine)").matches && window.matchMedia("(hover: hover)").matches
    )
  }

  function animateCursor() {
    cursorX += (targetX - cursorX) * 0.4
    cursorY += (targetY - cursorY) * 0.4
    cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%)`
    cursorRaf = window.requestAnimationFrame(animateCursor)
  }

  function setCursorMode(target: EventTarget | null) {
    const el = target instanceof Element ? target : null
    cursor.classList.toggle("is-view", Boolean(el?.closest(".rp-hover-image")))
    cursor.classList.toggle(
      "is-ring",
      Boolean(el?.closest("a, button, [role='button'], .rp-hover")) &&
        !el?.closest(".rp-hover-image"),
    )
  }

  function showCursor() {
    if (!isFinePointer()) return
    cursor.classList.add("is-visible")
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => cursor.classList.remove("is-visible"), 3000)
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return
    targetX = event.clientX
    targetY = event.clientY
    showCursor()
    setCursorMode(event.target)
    if (!cursorRaf) animateCursor()
  }

  function handlePointerLeave() {
    cursor.classList.remove("is-visible", "is-ring", "is-view")
  }

  document.addEventListener("pointermove", handlePointerMove, { passive: true })
  document.addEventListener("pointerleave", handlePointerLeave)
  document.addEventListener("mouseover", (event) => setCursorMode(event.target))
  cleanup.push(() => {
    document.removeEventListener("pointermove", handlePointerMove)
    document.removeEventListener("pointerleave", handlePointerLeave)
    window.clearTimeout(idleTimer)
    if (cursorRaf) window.cancelAnimationFrame(cursorRaf)
    cursor.remove()
  })

  rpWindow.__researchPortfolioCleanup = () => {
    cleanup.forEach((fn) => fn())
    body.classList.remove("rp-portfolio-active", "rp-ready", "rp-nav-hidden", "rp-nav-blur")
    delete rpWindow.__researchPortfolioCleanup
  }

  if (typeof window.addCleanup === "function") {
    window.addCleanup(rpWindow.__researchPortfolioCleanup)
  }
}

document.addEventListener("nav", initResearchPortfolio)
initResearchPortfolio()
