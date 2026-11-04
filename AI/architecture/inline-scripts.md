# Inline script pipeline

Files `quartz/components/scripts/*.inline.ts` are bundled by esbuild into text strings and end
up in the final `postscript.js`.

## Adding a script
1. Create `quartz/components/scripts/myFeature.inline.ts`.
2. In a component (usually `Body.tsx`): `// @ts-ignore` then `import myScript from "./scripts/myFeature.inline"`.
3. Add it to the `afterDOMLoaded` `concatenateResources(...)` call.
4. Rebuild; clear `.quartz-cache` if unchanged.

## Window augmentation
```ts
type MyWindow = Window & typeof globalThis & { myProp: string }
const w = window as MyWindow
```

## SPA caveat
`enableSPA: true` — page navigation doesn't reload scripts. Re-initialize on the `nav` event
(see `spa.inline.ts`, and existing scripts for the pattern) and clean up listeners on `prenav`.

## Scripts imported in Body.tsx
clipboard, siteControls, habitTimeline, customCursor, cvPdf, videoMuteSync,
mirrorQuotesShuffle, homeMirrorQuotes, rollCounter, themeInit, sectionAnimations,
researchPortfolio. Other scripts (search, graph, toc, explorer, etc.) belong to their own components.

See also: [../features/index.md](../features/index.md)
