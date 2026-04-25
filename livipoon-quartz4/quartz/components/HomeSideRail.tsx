import { classNames } from "../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import script from "./scripts/homeSideRail.inline"
// @ts-ignore
import style from "./styles/homeSideRail.scss"

export default (() => {
  const HomeSideRail: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const slug = fileData.slug
    if (slug !== "index" && slug !== "index/index") {
      return null
    }

    return (
      <aside class={classNames(displayClass, "bryn-side-rail")} data-home-side-rail="" hidden>
        <div class="bryn-side-rail-inner">
          <span class="bryn-side-rail-label" data-home-side-rail-label="">
            INTRO
          </span>
          <ol class="bryn-side-rail-dots" data-home-side-rail-dots=""></ol>
        </div>
      </aside>
    )
  }

  HomeSideRail.css = style
  HomeSideRail.afterDOMLoaded = script

  return HomeSideRail
}) satisfies QuartzComponentConstructor
