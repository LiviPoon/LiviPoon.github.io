# AGENTS.md

## Project Overview

Personal website for Livi Poon — a customized Quartz 4 static site generator fork. All site code lives in `livipoon-quartz4/`.

- **Live URL:** www.livipoon.com
- **Deploys:** GitHub Pages via `.github/workflows/deploy.yml` on push to main

## Build & Dev

```bash
cd livipoon-quartz4
npx quartz build          # build static site to /public
npx quartz build --serve  # build + local dev server with hot-reload
```

- Node v22 required (see `.node-version`)
- If changes don't appear after rebuild, clear cache: `rm -rf .quartz-cache` then rebuild
- Type-check: `npm run check`
- Format: `npm run format`

## Project Structure

```
livipoon-quartz4/
  content/           # Markdown content, images, fonts, music
    index.md         # Homepage
    blog/            # Blog posts
    art/             # Art portfolio
    cv/              # Resume
    habits/          # Habit tracking data
    songs/           # Background music audio files
  quartz/
    components/      # Preact (JSX/TSX) UI components
      scripts/       # Client-side inline scripts (.inline.ts)
      styles/        # Component-specific SCSS
    styles/          # Global SCSS (base.scss, custom.scss)
    plugins/         # Build plugins (transformers, filters, emitters)
    util/            # Shared utilities (theme.ts, etc.)
  quartz.config.ts   # Main config (fonts, colors, plugins, analytics)
  quartz.layout.ts   # Page layout composition
```

## Key Config Files

- **`quartz.config.ts`** — Typography (Playfair Display headings, Figtree body), color themes, plugins, analytics (GoatCounter)
- **`quartz.layout.ts`** — Layout zones (beforeBody, left/right sidebar, footer), conditional rendering per page type, Giscus comments for blog

## Inline Script Pipeline

Scripts in `quartz/components/scripts/*.inline.ts` are bundled by esbuild as text strings:

1. Create the script file: `quartz/components/scripts/myFeature.inline.ts`
2. Import in a component (typically `Body.tsx`): `import myScript from "./scripts/myFeature.inline"`
3. Register in `afterDOMLoaded`: add to `concatenateResources(...)` call
4. Scripts end up in the final `postscript.js` bundle

Use `@ts-ignore` before inline imports. For window type augmentation, use the cast pattern:
```typescript
type MyWindow = Window & typeof globalThis & { myProp: string }
const w = window as MyWindow
```

## Custom Features

- **Background music** — Audio player with playlist from `/content/songs/`
- **Habit timeline** — D3-based habit tracking visualization
- **Custom cursor** — Animated cursor replacement
- **Site visit counter** — Visit tracking display
- **CV PDF viewer** — Embedded PDF resume
- **Masonry layout** — Grid layout for art/gallery pages

## Styling

- Global styles in `quartz/styles/custom.scss` (~2700 lines) — the main custom stylesheet
- Component styles in `quartz/components/styles/*.scss`
- Theme colors/fonts controlled via CSS variables set in `quartz/util/theme.ts`
- Light and dark mode supported

## Content Conventions

- Content is Markdown with YAML frontmatter (title, description, tags, dates)
- Supports Obsidian-flavored and GitHub-flavored Markdown
- Images go in `content/images/`
- HTML can be used directly in `.md` files (the homepage uses extensive raw HTML)
- Ignored patterns: `private/`, `templates/`, `.obsidian/`
