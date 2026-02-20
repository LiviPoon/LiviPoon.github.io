import { classNames } from "../../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
// @ts-ignore
import script from "../scripts/masonry.inline"
// @ts-ignore
import style from "../styles/masonry.scss"

export default (() => {
  const MasonryPage: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const images = fileData.masonryImages ?? []
    const jsonPath = fileData.masonryJsonPath
    const classes: string[] = fileData.frontmatter?.cssclasses ?? []

    if (images.length === 0 || !jsonPath) {
      return (
        <article
          class={classNames(displayClass, ...classes, "popover-hint", "masonry-container")}
          data-masonry-layout=""
        >
          <div class="masonry-empty">No images found.</div>
        </article>
      )
    }

    return (
      <article
        class={classNames(displayClass, ...classes, "popover-hint", "masonry-container")}
        data-masonry-layout=""
      >
        <div class="masonry-grid" id="masonry-grid" data-json-path={jsonPath}></div>
        <div class="masonry-caption-modal" id="masonry-caption-modal"></div>
      </article>
    )
  }

  MasonryPage.css = style
  MasonryPage.afterDOMLoaded = script

  return MasonryPage
}) satisfies QuartzComponentConstructor
