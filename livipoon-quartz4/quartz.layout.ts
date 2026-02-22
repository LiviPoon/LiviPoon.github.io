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
    darkTheme: "light",
  },
})

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [blogPostsOnly(Component.MobileOnly(giscusComments))],
  footer: Component.Footer(),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    notHome(Component.Breadcrumbs()),
    notHome(Component.ArticleTitle()),
    notHome(Component.ContentMeta()),
    notHome(Component.TagList()),
  ],
  left: [
    notHome(notArt(Component.PageTitle())),
    notHome(Component.MobileOnly(Component.Spacer())),
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
    blogPostsOnly(Component.DesktopOnly(giscusComments)),
    // notHome(Component.Explorer()),
  ],
  right: [
    notHome(Component.Graph()),
    notHome(Component.DesktopOnly(Component.TableOfContents())),
    notHome(Component.Backlinks()),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    notArt(Component.PageTitle()),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
      ],
    }),
  ],
  right: [notHome(Component.Graph())],
}
