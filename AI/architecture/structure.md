# Repo structure

```
LiviPoon.github.io/
  AGENTS.md, AI/            # agent docs (start at AI/CLAUDE.md)
  .github/workflows/deploy.yml
  livipoon-quartz4/
    content/                # markdown + media (see ../content/conventions.md)
    portfolio-src/          # static research-portfolio app (index.html, app.js, styles.css)
    docs/                   # upstream Quartz documentation (ignore)
    quartz.config.ts        # site config + plugin lists
    quartz.layout.ts        # layout composition
    quartz/
      components/           # Preact TSX components
        pages/              # page-type components (Content, Folder, Masonry, MirrorQuotes, Tag, 404)
        scripts/            # *.inline.ts client scripts
        styles/             # per-component SCSS
      plugins/{transformers,filters,emitters}/
      styles/               # base.scss, custom.scss (huge), variables, callouts, syntax
      util/                 # theme.ts, path.ts, resources.ts ...
      static/               # logo, icon, og-image, loader svg, giscus/, pdfjs/
```

## content/ top-level
`index.md` (home), `blog/`, `art/`, `cv/`, `habits/`, `tracked-habits/`, `mirror/`,
`research/`, `powerlifting/`, `quote-journal/`, `publications/`, `achievements/`,
`songs/` (mp3), `images/`, `fonts/`.

## Untracked/generated (never edit, never commit)
`node_modules/`, `public/`, `quartz/.quartz-cache/`

See also: [build-pipeline.md](build-pipeline.md), [../content/conventions.md](../content/conventions.md)
