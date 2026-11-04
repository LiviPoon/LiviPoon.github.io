# Styling

- `quartz/styles/custom.scss` (~3200 lines) is the main custom sheet. **Never read it whole.**
  Use `rtk grep`/grep for a selector, then read a narrow range.
- Landmarks in custom.scss (approx. lines): `<page-break>` tag (~54), blog-only highlight (~74),
  "Kero AI-style" home landing layout (~374), "Pilcrow-style" homepage layout (~946),
  section entrance animations (~3155+). Line numbers drift; grep the comment text.
- Other global files: `base.scss`, `variables.scss`, `callouts.scss`, `syntax.scss`.
- Component styles: `quartz/components/styles/*.scss`, imported by the owning component.
- Theme variables come from `quartz.config.ts` via `quartz/util/theme.ts` (CSS custom properties).
- Light and dark mode both supported (`:root[saved-theme="dark"]`).
- Fonts also live in `content/fonts/` (CMGeom, Garamondt).

Rules: prefer scoping new rules to a page/feature class; test both themes; avoid growing
custom.scss further—put new feature CSS in a component `.scss` file.

See also: [config-and-layout.md](config-and-layout.md)
