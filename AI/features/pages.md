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
- **Redwood background** (homepage): `portfolio-src/redwood.js` is a dependency-free WebGL2 point
  renderer (fixed canvas, z-index -1). Data in `portfolio-src/redwood/` (`redwood-{hi,lo}.bin`,
  `redwood.json`; 48-byte "RDWD" header + uint16 xyz + rgbs bytes; format documented at the top of
  redwood.js). Scan by Phil Wilkes. Scroll → camera descent via `data-redwood-stop` (0 crown → 1 trunk base),
  `data-redwood-side`, `data-redwood-dim` on homepage sections. Sets `html[data-redwood="on|off"]`;
  all overlay CSS is scoped to `on` (block "REDWOOD POINT-CLOUD BACKGROUND" in styles.css).
  Debug: `?redwood=off|lo|hi|debug|synthetic`. `portfolioRoot.ts` copies redwood.js + `redwood/*.bin|json`.
- **Powerlifting / quote-journal**: layout hides footer, sidebar, etc. via `notPowerlifting`
  in `quartz.layout.ts`.
- **Blog** (`content/blog/`): normal notes; Giscus comments appear on posts (not `blog/index`).
