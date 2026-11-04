# UI effects

Each is a standalone inline script in `quartz/components/scripts/` registered in `Body.tsx`
(see [../architecture/inline-scripts.md](../architecture/inline-scripts.md)).

- **Custom cursor** — `customCursor.inline.ts` + `styles/customCursor.scss`.
- **Section dots** — `SectionDots.tsx` + `sectionDots.inline.ts` + `styles/sectionDots.scss` (afterBody).
- **Section animations** — `sectionAnimations.inline.ts`; CSS at the end of `custom.scss`
  (slide-up fade default, clip-path mask reveal, word stagger).
- **HomeNav** — `HomeNav.tsx` + `styles/homeNav.scss` (afterBody).
- **Blog typewriter** — `blogTypewriter.inline.ts` (~765 lines).
- **Roll counter / visit counter** — `rollCounter.inline.ts`.
- **Video mute sync** — `videoMuteSync.inline.ts` (home background videos
  `content/images/background-{light,dark}.mp4`).
- **Theme init** — `themeInit.inline.ts` (tiny; sets theme early).
- Loading screen and butterfly loaders were removed (recent commits); `static/loader-character.svg` may be unused.
