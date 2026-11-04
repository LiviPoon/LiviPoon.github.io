# Config & layout

## quartz.config.ts
- `baseUrl: www.livipoon.com`, `pageTitle: Livi Poon`, SPA on, popovers off, analytics `null`.
- `ignorePatterns`: `private`, `templates`, `.obsidian`. `defaultDateType: modified`.
- Typography: Playfair Display (title/header), Figtree (body), IBM Plex Mono (code); Google Fonts.
- Colors: light bg `#eae0ce`; dark bg `#181818`; monochrome secondary (black / white).
  Colors flow into CSS variables via `quartz/util/theme.ts`.

## quartz.layout.ts
Exports `sharedPageComponents`, `defaultContentPageLayout`, `defaultListPageLayout`.
- shared: Head, `afterBody: [SectionDots, HomeNav]`, footer (hidden on powerlifting/quote-journal).
- Content layout: Breadcrumbs, ArticleTitle, ContentMeta, TagList in `beforeBody`;
  left: PageTitle, Search+ReaderMode, Giscus comments (blog posts only, desktop);
  right: Graph, TableOfContents, Backlinks. Explorer is commented out.
- Helper wrappers using `ConditionalRender`: `notHome`, `notArt`, `blogPostsOnly`,
  `notPowerlifting` (also excludes quote-journal). Wrap a component to hide it per-page.
- Giscus repo `LiviPoon/LiviPoon.github.io`, category General, mapping pathname,
  theme CSS served from `/static/giscus`.

## Adding a component
Create `quartz/components/X.tsx`, export in `components/index.ts`, place it in a layout zone
(wrap with a condition helper if page-specific).

See also: [styling.md](styling.md), [inline-scripts.md](inline-scripts.md)
