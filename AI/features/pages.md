# Special pages

- **Art gallery** (`content/art/index.md`): frontmatter `layout: masonry` and
  `masonry: [images/art_photos]` lists image folders. Emitter `masonry.ts` generates the page;
  styles `components/styles/masonry.scss`, client `scripts/masonry.inline.ts`.
- **Mirror quotes** (`content/mirror/`): testimonials in `mirror-quotes.json`
  (`text`, `speaker`, `role`, optional `make-bold`/`makeBold`). Shuffled client-side by
  `mirrorQuotesShuffle.inline.ts`; home snippet via `homeMirrorQuotes.inline.ts`.
- **CV** (`content/cv/`): `cv.pdf` rendered by `cvPdf.inline.ts` with pdf.js from `static/pdfjs/`.
- **Research portfolio**: static app in `portfolio-src/` (`index.html`, `app.js`, `styles.css`)
  emitted by `portfolioRoot.ts`; content in `content/research/`; client `researchPortfolio.inline.ts`.
- **Powerlifting / quote-journal**: layout hides footer, sidebar, etc. via `notPowerlifting`
  in `quartz.layout.ts`.
- **Blog** (`content/blog/`): normal notes; Giscus comments appear on posts (not `blog/index`).
