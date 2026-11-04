# Repo structure

```
LiviPoon.github.io/
  AGENTS.md, AI/              # agent docs (start at AI/CLAUDE.md)
  .github/workflows/deploy.yml
  site/                       # THE WEBSITE (published as-is)
    index.html, app.js, styles.css     # homepage (self-contained design)
    redwood.js, redwood/               # WebGL point-cloud background (homepage)
    soundscape.js, soundscape/         # scroll-driven forest audio (homepage)
    catalina.js, catalina-soundscape.js, catalina/   # island point cloud + audio (achievements)
    research/ achievements/ publications/ art/ cv/ mirror/
    powerlifting/ quote-journal/ tracked-habits/   # subpages: <dir>/index.html
    easter-eggs.html, 404.html
    assets/site.css                    # shared stylesheet for all subpages
    assets/js/*.js                     # small per-feature scripts (see features/index.md)
    data/site-data.js                  # GENERATED habit/quote data (tools/build-data.mjs)
    images/ (art_photos/), cv/cv.pdf, art/index.images.json
    static/                            # favicon, logo, og-image, pdfjs/ (CV viewer)
  data/
    habits/*.md                        # habit logs (source for site-data.js)
    mirror-quotes.json                 # testimonials (source for homepage bold quotes)
  tools/build-data.mjs                 # data/ → site/data/site-data.js (no dependencies)
  tools/build-catalina.py              # Catalina OBJ + aerial texture → site/catalina/*.bin
  archive/blog/                        # old blog posts, not published
```

## Two kinds of pages
- **Homepage** (`site/index.html`): own CSS (`styles.css`) and JS (`app.js`, `redwood.js`,
  `soundscape.js`) plus `assets/js/habit-timeline.js` + `roll-counter.js`.
- **Achievements** (`site/achievements/index.html`) uses the homepage design too: `styles.css`,
  `app.js`, `catalina.js`, `catalina-soundscape.js`, `roll-counter.js` (absolute `/` paths).
- **Subpages**: share one skeleton (`#quartz-root > #quartz-body > .center …`) and
  `assets/site.css`. Every subpage loads `theme-init.js` (head), `custom-cursor.js` and
  `site-controls.js`, plus its feature script. `body[data-slug]` scopes page-specific CSS.

The `quartz-*` ids/classes are leftovers from the old Quartz build. The CSS selects on them, so
keep them unless you also update `assets/site.css`.

See also: [styling.md](styling.md), [../features/index.md](../features/index.md)
