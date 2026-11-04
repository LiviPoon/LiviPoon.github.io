# Background music

- Audio files: `content/songs/` (mp3/m4a/aac/wav/ogg/flac).
- `Body.tsx` scans that folder at build time (`getBackgroundSongs`), sorts alphabetically, puts
  `reality piano cover for lovers.mp3` first if present, and passes URLs to the client.
- Client logic: `quartz/components/scripts/backgroundMusic.inline.ts` (~670 lines; grep before reading).
- Styles: `quartz/components/styles/backgroundMusic.scss`.
- The same song-scan code exists in `plugins/emitters/portfolioRoot.ts` — keep in sync.
- Add a track: drop the file in `content/songs/` and rebuild. Large files bloat the repo.
