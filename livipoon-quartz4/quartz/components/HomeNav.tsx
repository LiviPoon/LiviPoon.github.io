import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import style from "./styles/homeNav.scss"

const links = [
  { label: "Curriculum Vitae", href: "/cv/", active: true },
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
        {links.map(({ label, href, active }) => (
          <a class={`home-nav-link${active ? " home-nav-link--active" : ""}`} href={href} data-no-popover="true">
            {label}
          </a>
        ))}
      </nav>
    )
  }

  HomeNav.css = style
  HomeNav.displayName = "HomeNav"
  return HomeNav
}) satisfies QuartzComponentConstructor
