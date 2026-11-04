# Troubleshooting

| Symptom | Fix |
|---|---|
| Page unstyled / scripts 404 locally | Serve `site/` over HTTP (`python3 -m http.server -d site 8080`), not `file://` |
| Habit numbers/charts stale or empty | `node tools/build-data.mjs`; check `site/data/site-data.js` is loaded before the chart script |
| Art image missing | Filename in `images/art_photos/` must match `data-images` and `art/index.images.json` exactly (no spaces) |
| CV blank | `static/pdfjs/` present? `cv/cv.pdf` path in `data-pdf-src`? |
| Quote journal stuck on "Loading quote..." | `quote-journal/quote.html` must have an `<article>` with `<li>` quotes |
| Soundscape silent | Needs a click/keypress first (autoplay policy); check `localStorage.siteAudioMuted`; clips in `site/soundscape/` |
| Habit missing from chart | `entries:` must be ISO `YYYY-MM-DD` |
| CSS change has no effect on a subpage | Rule probably needs the page's `body[data-slug]` scope; grep `assets/site.css` |
