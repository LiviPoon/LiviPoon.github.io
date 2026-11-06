# Pages

All paths are under `site/`. Subpages share the skeleton described in
[../architecture/structure.md](../architecture/structure.md).

- **Homepage** (`index.html`): an empty scroll track (`.rw-track`) plus fixed, still content blocks
  (`.rw-block` in `.rw-stage`), in the order of the old main-branch page: hero, counters, mission,
  skill set, video I, accomplishments, video II,
  three quote blocks (app.js fills every `[data-mirror-quote-grid]` in order, `data-count` each),
  video III, closing CTA, and a bottom strip (habit chart + footer). Links: CV, achievements, art, mirror.
  There is deliberately no Thoughts/blog link.
- **Homepage blocks** (`redwood-text.js`): text only ever sits on empty background, never on
  the tree. The camera path (redwood.js `KEYS`) stays outside the crown the whole way down, so
  the tree fills ~60% of the width; for each block redwood-text.js calls
  `Redwood.setOffset(+-0.22)` to slide the tree to the side away from the text. With the two
  stops (t = scroll fraction, steady rate) the camera is a pure function of t, so
  redwood-text.js mirrors it (`MIRROR`: keep in sync with redwood.js KEYS/orbit/FOV/spring/point
  fades). A Web Worker projects the same point file (HTTP cache) with each lens offset into a
  coarse ink-coverage grid for 251 values of t and records, per screen row, how far the empty
  background reaches in from the text edge. The planner measures each block at several widths /
  type scales (`--rw-w`, `--rw-fit`; big type also capped with `cqi`). The descent speed is
  fixed: the track is `data-rw-screens` (50) viewport heights. The planner bisects the longest
  equal window per block (~3.9 screens at 1440x900, est.) such that every block, in order, gets an
  edge-anchored spot free for its whole window. Gaps: 0.12 screens when the next block stays on
  the same side (tree stays put, preferred), 0.4 when the tree has to slide across. Fades 0.2.
  `data-rw-with-prev` gets its own spot below, same side. The closing group ends at t = 1 (trunk base
  at the bottom edge) when it fits, else stays up as long as its spot is free. Only if nothing fits is the track
  lengthened. Blocks are fixed
  and still; opacity follows a copy of redwood.js's spring. Hidden = `display:none`. One-time
  fade-in (`html.rw-pre` -> `rw-enter`). Stack mode (<768px, no WebGL/data, or no room):
  blocks take turns in a CSS column and `html.rw-stack` dims the canvas to 15%.
  Debug: `?rw-debug` (grid overlay), `RedwoodText.plan()`.
- **Redwood background** (homepage): `redwood.js` is a dependency-free WebGL2 point renderer
  (fixed full-viewport canvas, z-index -1). Data: `redwood/` (`redwood-{hi,lo}.bin`,
  `redwood.json`; 48-byte "RDWD" header + uint16 xyz + rgbs bytes; format at the top of
  redwood.js). Scroll -> descent t via two `data-redwood-stop` markers
  (top 0, bottom 1; no `data-redwood-side`, so the offset from `setOffset` applies). Sets
  `html[data-redwood="on|off"]`. Debug: `?redwood=off|lo|hi|debug|synthetic`.
  Extra point sets register in `window.RedwoodLayers` (`init(gl, api)`, `draw(gl, frame)`) and are
  drawn after the tree with the same camera/palette/fog.
- **Achievements** (`achievements/index.html`): homepage-style page over the Catalina point cloud,
  see [catalina.md](catalina.md). Chapters reuse `.mirror-quotes` markup; a
  `[data-roll-counter data-habit="…"]` counter needs `data/site-data.js`.
- **Research / Publications / Powerlifting / Easter eggs**: plain article HTML.
- **Art** (`art/index.html`): the grid is built by `masonry.js` from `#masonry-grid[data-images]`
  (inline JSON with width/height), falling back to `art/index.images.json`. To add a piece: put the
  image in `images/art_photos/` (no spaces in filenames) and add an entry to **both** lists.
  The page uses the homepage shell (`/styles.css`, `app.js` nav/menu/theme, no audio); its styles
  are the `.page-art` block at the end of `styles.css`. Artwork license: CC BY-NC-ND 4.0.
- **Mirror** (`mirror/index.html`): achievements-style page (`page-achievements page-mirror`, no audio,
  no 3D background). Quotes are static `article.mirror-quote-card` in four `.mirror-chapter` grids,
  shuffled across them on load by `assets/js/mirror-quotes.js`. The homepage's bold quotes come from
  `data/mirror-quotes.json` (`make-bold: true`), so edit both when adding a quote.
- **CV** (`cv/index.html`): homepage-style page over the Half Dome point cloud; the CV is laid
  out as a climb (chapters in HTML). "View CV" opens the PDF in an overlay, see [halfdome.md](halfdome.md).
  To update: replace `cv/cv.pdf` **and** edit the chapter text in `cv/index.html`.
- **Quote journal** (`quote-journal/index.html`): `quote-typewriter.js` fetches
  `quote-journal/quote.html` and types random `<li>` quotes from its `<article>`. Add quotes there.
- **Tracked habits** (`tracked-habits/index.html`): per-habit weekly chart, see [habits.md](habits.md).
- **404** (`404.html`): served by GitHub Pages for unknown paths (including old `/blog/` URLs).

## Art page radio (`site/art-soundscape.js`)
- Plays `art/sounds/california-girls.m4a` (stereo AAC 96 kbps, from the supplied mp3) through the same
  AM-radio chain as the other radios, then splits L/R into two HRTF panners at ±42° in front, plus the
  side signal (L−R) at ±128° behind and a synthesized hall send, so it sounds like a band around you.
- No distance roll-off: level is constant (0.4 × master 0.9, like the other radios). The stage sways
  slowly, turns up to ±25° with the pointer and lifts ±0.8 m with scroll.
- Page has the enter gate + nav mute button like the CV page; same `window.__soundscape` API.
- The recording is copyrighted; hosting it publicly needs a licence.
