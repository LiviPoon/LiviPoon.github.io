;(function () {
  type AnimVariant = "up" | "left" | "right" | "scale" | "mask"

  function mark(el: Element | null, delay: number, variant: AnimVariant = "up") {
    if (!el) return
    el.classList.add("will-anim", `will-anim--${variant}`)
    ;(el as HTMLElement).style.setProperty("--anim-delay", `${delay}ms`)
  }

  function splitWords(el: Element, startDelay: number = 0, perWordDelay: number = 45) {
    const text = (el.textContent ?? "").trim()
    el.innerHTML = text
      .split(/\s+/)
      .map((w, i) => `<span class="word-span" style="--word-delay:${startDelay + i * perWordDelay}ms">${w}</span>`)
      .join(" ")
    el.classList.add("will-anim", "will-anim--words")
  }

  function runSetup() {
    // Hero
    mark(document.querySelector(".pilcrow-hero-main h1"), 240)
    mark(document.querySelector(".pilcrow-hero-copy"), 300)
    mark(document.querySelector(".pilcrow-hero .pilcrow-hero-actions"), 640)

    // Mission quote — word-by-word stagger
    document.querySelectorAll(".pilcrow-video-eyebrow").forEach((el) => mark(el, 0))
    document.querySelectorAll(".pilcrow-video-message").forEach((el) => splitWords(el, 100, 45))

    // Process section — text slides from left, image mask-reveals upward
    mark(document.querySelector(".pilcrow-process-copy"), 0, "left")
    mark(document.querySelector(".pilcrow-process-media img"), 200, "mask")

    // Section headings + subtext
    document.querySelectorAll(".pilcrow-section-head").forEach((head) => {
      head.querySelectorAll("h2, p").forEach((el, i) => mark(el, i * 200))
    })

    // Service cards — staggered
    document.querySelectorAll(".pilcrow-service-card").forEach((el, i) => mark(el, i * 200))

    // Roll counter — scale in (only inside observed sections/hero)
    document
      .querySelectorAll(".pilcrow-section .pilcrow-roll-counter, .pilcrow-hero .pilcrow-roll-counter")
      .forEach((el) => mark(el, 0, "scale"))

    // Testimonials — staggered (only inside observed sections/hero)
    document
      .querySelectorAll(".pilcrow-section .pilcrow-quote, .pilcrow-hero .pilcrow-quote")
      .forEach((el, i) => mark(el, i * 200))
    mark(document.querySelector(".pilcrow-section .pilcrow-btn-italic"), 600)

    // Closing / contact
    mark(document.querySelector(".pilcrow-closing-heading"), 0)
    document.querySelectorAll(".pilcrow-section-closing .pilcrow-btn").forEach((el, i) =>
      mark(el, 240 + i * 130),
    )

    // IntersectionObserver — trigger animations when section enters viewport
    // Double rAF ensures the browser paints the will-anim starting state (opacity:0)
    // before is-visible is added, so the CSS transition always runs.
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const target = entry.target
          obs.unobserve(target)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              target.querySelectorAll<HTMLElement>(".will-anim").forEach((el) =>
                el.classList.add("is-visible"),
              )
            })
          })
        }
      },
      { threshold: 0.18 },
    )

    const hero = document.querySelector(".pilcrow-hero")
    if (hero) obs.observe(hero)
    document.querySelectorAll(".pilcrow-section").forEach((s) => obs.observe(s))

    if (typeof window.addCleanup === "function") {
      window.addCleanup(() => obs.disconnect())
    }
  }

  function setup() {
    runSetup()
  }

  document.addEventListener("nav", setup)
  setup()
})()
