import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

const notHome = (component: ReturnType<typeof Component.PageTitle>) =>
  Component.ConditionalRender({
    component,
    condition: (page) => page.fileData.slug !== "index",
  })

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
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
    notHome(Component.PageTitle()),
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
    Component.PageTitle(),
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
