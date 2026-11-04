# Troubleshooting

| Symptom | Fix |
|---|---|
| Changes not showing | `rm -rf .quartz-cache quartz/.quartz-cache`, rebuild |
| Inline script not running | Imported with `@ts-ignore` and added to `concatenateResources` in `Body.tsx`? |
| Script works on first load only | SPA navigation: re-init on `nav` event |
| Type errors | `npm run check` (runs tsc and prettier) |
| Prettier failures | `npm run format` |
| Masonry page empty | Check `masonry:` folder paths in frontmatter, relative to `content/` |
| Soundscape silent | Needs a click/keypress first (autoplay policy); check `localStorage.siteAudioMuted`; clips in `portfolio-src/soundscape/` |
| Habit missing from chart | `entries:` must be ISO `YYYY-MM-DD` |
| Build hangs on huge assets | Check image sizes in `content/images/` (sharp) |
