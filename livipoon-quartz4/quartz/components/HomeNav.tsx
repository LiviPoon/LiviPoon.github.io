import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import style from "./styles/homeNav.scss"

const links = [
  { label: "Curriculum Vitae", href: "/cv/" },
  { label: "Publications", href: "/publications/" },
  { label: "Selected Achievements", href: "/achievements/" },
  { label: "Art", href: "/art/" },
  { label: "Thoughts", href: "/blog/" },
  { label: "Contact", href: "#contact" },
]

export default (() => {
  const HomeNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
    const slug = fileData.slug
    if (slug !== "index" && slug !== "index/index") {
      return null
    }

    return (
      <nav class="home-nav">
        {/* Desktop: inline links */}
        <div class="home-nav-links">
          {links.map(({ label, href }) => (
            <a class="home-nav-link" href={href} data-no-popover="true">
              {label}
            </a>
          ))}
        </div>

        {/* Mobile: label + toggle button + dropdown */}
        <span class="home-nav-mobile-label">Hey, you're on mobile! Scared to read? Check this out :) →</span>
        <button class="home-nav-toggle" aria-label="Open navigation" aria-expanded="false">
          <svg class="home-nav-hamburger" width="20" height="14" viewBox="0 0 20 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <rect y="0" width="20" height="1.75" rx="0.875"/>
            <rect y="6.125" width="20" height="1.75" rx="0.875"/>
            <rect y="12.25" width="20" height="1.75" rx="0.875"/>
          </svg>
        </button>
        <div class="home-nav-dropdown" aria-hidden="true">
          {links.map(({ label, href }) => (
            <a class="home-nav-dropdown-link" href={href} data-no-popover="true">
              {label}
            </a>
          ))}
        </div>
      </nav>
    )
  }

  HomeNav.css = style

  HomeNav.afterDOMLoaded = `
    (function () {
      const nav = document.querySelector('.home-nav')
      const toggle = document.querySelector('.home-nav-toggle')
      const dropdown = document.querySelector('.home-nav-dropdown')
      const label = document.querySelector('.home-nav-mobile-label')
      if (!nav || !toggle || !dropdown) return

      // On mobile, pull the label out of the fixed nav into document flow
      if (label && window.innerWidth <= 600) {
        document.body.appendChild(label)
      }

      function open() {
        nav.setAttribute('data-open', '')
        toggle.setAttribute('aria-expanded', 'true')
        dropdown.setAttribute('aria-hidden', 'false')
      }
      function close() {
        nav.removeAttribute('data-open')
        toggle.setAttribute('aria-expanded', 'false')
        dropdown.setAttribute('aria-hidden', 'true')
      }

      toggle.addEventListener('click', function (e) {
        e.stopPropagation()
        nav.hasAttribute('data-open') ? close() : open()
      })

      document.addEventListener('click', function (e) {
        if (!nav.contains(e.target) && e.target !== label) close()
      })

      dropdown.querySelectorAll('.home-nav-dropdown-link').forEach(function (link) {
        link.addEventListener('click', close)
      })
    })()
  `

  HomeNav.displayName = "HomeNav"
  return HomeNav
}) satisfies QuartzComponentConstructor
