# Build pipeline

Standard Quartz 4: markdown → **transformers** → **filters** → **emitters** → `public/`.
Defined in `livipoon-quartz4/quartz.config.ts`.

## Transformers (in order)
FrontMatter, CreatedModifiedDate, ObsidianFlavoredMarkdown (`enableInHtmlEmbed:false`),
GitHubFlavoredMarkdown, CrawlLinks (`markdownLinkResolution: "shortest"`), Description.

## Filters
RemoveDrafts.

## Emitters
ComponentResources, ContentPage, ContentIndex, **Masonry**, **MirrorQuotes**,
AliasRedirects, FolderPage, Assets, Static, NotFoundPage, **PortfolioRoot**.
(Bold = site-specific; files in `quartz/plugins/emitters/`.)

## Custom emitters
- `masonry.ts` — renders pages whose frontmatter has `layout: masonry`; reads images from
  listed folders (uses `sharp` for dimensions). Page comp: `components/pages/MasonryPage.tsx`.
- `mirrorQuotes.ts` — builds the mirror-quotes page from `content/mirror/mirror-quotes.json`.
  Page comp: `components/pages/MirrorQuotesPage.tsx`.
- `portfolioRoot.ts` — emits the research portfolio from `portfolio-src/`; also bundles
  `habitTimeline` and `rollCounter` inline scripts and reads songs/habits data.

Note: song list and habit aggregation logic is duplicated in `components/Body.tsx` and
`portfolioRoot.ts`; change both if you change either.

Other emitter files (`ogImage`, `cname`, `favicon`, `tagPage`, `404`) exist but are not enabled.

See also: [config-and-layout.md](config-and-layout.md), [../features/index.md](../features/index.md)
