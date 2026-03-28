import { classNames } from "../../util/lang"
import { pathToRoot } from "../../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
// @ts-ignore
import script from "../scripts/masonry.inline"
// @ts-ignore
import style from "../styles/masonry.scss"

export default (() => {
  const MasonryPage: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const images = fileData.masonryImages ?? []
    const jsonPath = fileData.masonryJsonPath
    const embeddedImages = JSON.stringify(images)
    const classes: string[] = fileData.frontmatter?.cssclasses ?? []
    const backHref = fileData.slug ? pathToRoot(fileData.slug) : "."
    const className = classNames(displayClass, ...classes, "popover-hint", "masonry-container")
    const content =
      images.length > 0 ? (
        <>
          <div
            class="masonry-grid"
            id="masonry-grid"
            data-json-path={jsonPath}
            data-images={embeddedImages}
          ></div>
          <div class="masonry-caption-modal" id="masonry-caption-modal"></div>
        </>
      ) : (
        <div class="masonry-empty">No images found.</div>
      )

    return (
      <article class={className} data-masonry-layout="">
        <a class="masonry-back-link" href={backHref}>
          back
        </a>
        {content}
      </article>
    )
  }

  MasonryPage.css = style
  MasonryPage.afterDOMLoaded = script

  return MasonryPage
}) satisfies QuartzComponentConstructor
