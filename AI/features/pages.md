# Pages

All paths are under `site/`. Subpages share the skeleton described in
[../architecture/structure.md](../architecture/structure.md).

- **Homepage** (`index.html`): menu, hero, sections, mirror-quote grid (filled by `app.js` from
  `#quartz-body[data-mirror-bold-quotes]`), habit timeline. Links: research, achievements, art,
  CV, mirror. There is deliberately no Thoughts/blog link.
- **Redwood background** (homepage): `redwood.js` is a dependency-free WebGL2 point renderer
  (fixed canvas, z-index -1). Data: `redwood/` (`redwood-{hi,lo}.bin`, `redwood.json`; 48-byte
  "RDWD" header + uint16 xyz + rgbs bytes; format documented at the top of redwood.js). Scan by
  Phil Wilkes. Scroll → camera descent via `data-redwood-stop` (0 crown → 1 trunk base),
  `data-redwood-side`, `data-redwood-dim` on sections. Sets `html[data-redwood="on|off"]`.
  Debug: `?redwood=off|lo|hi|debug|synthetic`.
- **Achievements** (`achievements/index.html`): homepage-style page over the Catalina point cloud,
  see [catalina.md](catalina.md). Chapters reuse `.mirror-quotes` markup; a
  `[data-roll-counter data-habit="…"]` counter needs `data/site-data.js`.
- **Research / Publications / Powerlifting / Easter eggs**: plain article HTML.
- **Art** (`art/index.html`): the grid is built by `masonry.js` from `#masonry-grid[data-images]`
  (inline JSON with width/height), falling back to `art/index.images.json`. To add a piece: put the
  image in `images/art_photos/` (no spaces in filenames) and add an entry to **both** lists.
  The page uses the homepage shell (`/styles.css`, `app.js` nav/menu/theme, no audio); its styles
  are the `.page-art` block at the end of `styles.css`. Artwork license: CC BY-NC-ND 4.0.
- **Mirror** (`mirror/index.html`): testimonial cards are static HTML (`article.pilcrow-quote`,
  plus `pilcrow-quote--highlight` for bold ones), shuffled on load. The homepage's bold quotes come
  from `data/mirror-quotes.json` (`make-bold: true`), so edit both when adding a quote.
- **CV** (`cv/index.html`): homepage-style page over the Half Dome point cloud; the CV is laid
  out as a climb (chapters in HTML). "View CV" opens the PDF in an overlay, see [halfdome.md](halfdome.md).
  To update: replace `cv/cv.pdf` **and** edit the chapter text in `cv/index.html`.
- **Quote journal** (`quote-journal/index.html`): `quote-typewriter.js` fetches
  `quote-journal/quote.html` and types random `<li>` quotes from its `<article>`. Add quotes there.
- **Tracked habits** (`tracked-habits/index.html`): per-habit weekly chart, see [habits.md](habits.md).
- **404** (`404.html`): served by GitHub Pages for unknown paths (including old `/blog/` URLs).
