# Styling

- Homepage: `site/styles.css` only.
- Subpages: `site/assets/site.css` (~4900 lines, formatted). **Never read it whole.** grep for a
  selector or a `data-slug` value, then read a narrow range.
- Page-specific rules are scoped like `body:is([data-slug="cv"], [data-slug="cv/index"]) …`.
  A page's `data-slug` lives on its `<body>`; keep it when editing.
- Theme: `:root` vars (`--light`, `--dark`, `--gray`, …) with `:root[saved-theme="dark"]`
  overrides. The theme is set before paint by `assets/js/theme-init.js` (default dark) and
  toggled by `site-controls.js` (stored in `localStorage.theme`).
- Fonts: Google Fonts, linked in each page `<head>` (Playfair Display, Figtree, IBM Plex Mono;
  the homepage also uses Bricolage Grotesque, Cormorant Garamond, Anton).
- `site.css` still has rules for features that are gone (search, graph, popovers, callouts).
  They're harmless; delete them only after checking nothing visible changes.

Rules: scope new rules to a page or feature class, and test both themes.

See also: [structure.md](structure.md)
