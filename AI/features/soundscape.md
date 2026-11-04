# Redwood soundscape (portfolio home page)

Replaces the old background-music player (removed everywhere, Quartz pages included).

- Engine: `livipoon-quartz4/portfolio-src/soundscape.js` (plain JS, copied verbatim by
  `plugins/emitters/portfolioRoot.ts`, which also copies `portfolio-src/soundscape/*.m4a`).
- Scroll → descent `t` uses the same `[data-redwood-stop]` mapping as `redwood.js`; `t` → listener
  height via `CAM_Y` (mirror of `KEYS[.][1]` in redwood.js — keep in sync if the camera changes).
- Five layers (`ZONES`: sky, canopy, crown, trunk, floor) at fixed heights; each clip in `CLIPS`
  belongs to one layer. Calls spawn near the listener's layer and are positioned in 3D (HRTF
  `PannerNode`, distance roll-off, air-absorption low-pass, synthetic forest reverb), so they
  move overhead/underfoot as you scroll. Wind/rustle/creek ambience is synthesized noise.
- API: `window.__soundscape.setMuted/isMuted/duck`. Nav `#btn-mute` (app.js) toggles it; unmuted
  YouTube cards duck it. Mute pref key: `localStorage.siteAudioMuted` (also read by blogTypewriter speech).
- Clips: xeno-canto (CC BY-NC-SA 4.0) + NPS Yellowstone (public domain), trimmed to the busiest
  16–30 s, high-passed, spectral-gate denoised (noise profile from the quietest frames, −20 dB residual floor), levelled, mono AAC 64 kbps (~200 KB each). Credits render into
  `#sound-credits` in the footer from `CLIPS`; add `by`/`xc` for any new clip (license requires it).
- Adding a clip: put `<id>.m4a` in `portfolio-src/soundscape/`, add an entry to `CLIPS`.
  Avoid CC *-ND* sources (we trim). Sensitive species (e.g. Spotted Owl) are download-restricted on xeno-canto.
- Quartz pages keep only `scripts/siteControls.inline.ts` (theme toggle + license link).
