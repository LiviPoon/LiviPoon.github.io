# Content conventions

- Pages are hand-written HTML. Edit text directly inside `<article>` in `site/<page>/index.html`.
- Copy an existing subpage to make a new one. Keep the `<head>` block, the skeleton, the
  `body[data-slug]` and the script tags at the end of `<body>`.
- Use absolute paths (`/images/…`, `/assets/…`). The site is served from the domain root.
- Images → `site/images/`. Use filenames without spaces. Large photos (several MB) are
  already committed; compress new ones.
- Soundscape audio → `site/soundscape/` (see [../features/soundscape.md](../features/soundscape.md)).
- Generated file: `site/data/site-data.js`. Don't hand-edit it; edit `data/` and run
  `node tools/build-data.mjs`.
- Blog posts live in `archive/blog/` as markdown and are not published. To bring one back, you
  would need to write it as an HTML page.

See also: [../features/pages.md](../features/pages.md), [../features/habits.md](../features/habits.md)
