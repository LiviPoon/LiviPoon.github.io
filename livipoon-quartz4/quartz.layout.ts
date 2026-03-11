import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import type { QuartzComponent } from "./quartz/components/types"

const notHome = (component: QuartzComponent) =>
  Component.ConditionalRender({
    component,
    condition: (page) => page.fileData.slug !== "index",
  })

const notArt = (component: QuartzComponent) =>
  Component.ConditionalRender({
    component,
    condition: (page) => page.fileData.slug !== "art",
  })

const blogPostsOnly = (component: QuartzComponent) =>
  Component.ConditionalRender({
    component,
    condition: (page) => {
      const slug = page.fileData.slug
      return typeof slug === "string" && slug.startsWith("blog/") && slug !== "blog/index"
    },
  })

const notPowerlifting = (component: QuartzComponent) =>
  Component.ConditionalRender({
    component,
    condition: (page) => {
      const slug = page.fileData.slug
      return (
        slug !== "powerlifting" &&
        slug !== "powerlifting/index" &&
        slug !== "quote-journal" &&
        slug !== "quote-journal/index"
      )
    },
  })

const giscusComments = Component.Comments({
  provider: "giscus",
  options: {
    repo: "LiviPoon/LiviPoon.github.io",
    repoId: "R_kgDOQyBHrg",
    category: "General",
    categoryId: "DIC_kwDOQyBHrs4C2_gw",
    mapping: "pathname",
    strict: false,
    reactionsEnabled: true,
    inputPosition: "bottom",
    lang: "en",
    themeUrl: "https://www.livipoon.com/static/giscus",
    lightTheme: "light",
    darkTheme: "dark",
  },
})

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: notPowerlifting(Component.Footer()),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    notPowerlifting(notHome(Component.Breadcrumbs())),
    notPowerlifting(notHome(Component.ArticleTitle())),
    notPowerlifting(notHome(Component.ContentMeta())),
    notPowerlifting(notHome(Component.TagList())),
  ],
  left: [
    notPowerlifting(notHome(notArt(Component.PageTitle()))),
    notPowerlifting(notHome(Component.MobileOnly(Component.Spacer()))),
    notPowerlifting(
      notHome(
        Component.Flex({
          components: [
            {
              Component: Component.Search(),
              grow: true,
            },
            { Component: Component.ReaderMode() },
          ],
        }),
      ),
    ),
    notPowerlifting(blogPostsOnly(Component.DesktopOnly(giscusComments))),
    // notHome(Component.Explorer()),
  ],
  right: [
    notPowerlifting(notHome(Component.Graph())),
    notPowerlifting(notHome(Component.DesktopOnly(Component.TableOfContents()))),
    notPowerlifting(notHome(Component.Backlinks())),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    notPowerlifting(Component.Breadcrumbs()),
    notPowerlifting(Component.ArticleTitle()),
    notPowerlifting(Component.ContentMeta()),
  ],
  left: [
    notPowerlifting(notArt(Component.PageTitle())),
    notPowerlifting(Component.MobileOnly(Component.Spacer())),
    notPowerlifting(
      Component.Flex({
        components: [
          {
            Component: Component.Search(),
            grow: true,
          },
        ],
      }),
    ),
  ],
  right: [notPowerlifting(notHome(Component.Graph()))],
}
