import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import script from "./scripts/sectionDots.inline"
// @ts-ignore
import style from "./styles/sectionDots.scss"

export default (() => {
  const SectionDots: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
    const slug = fileData.slug
    const isHome = slug === "index" || slug === "index/index"

    // Homepage has no TOC (raw HTML sections) — render empty nav, JS populates it
    if (isHome) {
      return <nav class="section-dots" aria-label="Page sections" data-section-dots="" data-home-sections="" />
    }

    if (!fileData.toc || fileData.toc.length === 0) return null

    return (
      <nav class="section-dots" aria-label="Page sections" data-section-dots="">
        {fileData.toc.map((entry) => (
          <a
            key={entry.slug}
            class="sdot"
            href={`#${entry.slug}`}
            data-for={entry.slug}
            aria-label={entry.text}
            data-no-popover="true"
            tabIndex={-1}
          >
            <span class="sdot-label">{entry.text}</span>
            <span class="sdot-pip" />
          </a>
        ))}
      </nav>
    )
  }

  SectionDots.css = style
  SectionDots.afterDOMLoaded = script

  return SectionDots
}) satisfies QuartzComponentConstructor
