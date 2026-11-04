# Redwood soundscape (portfolio home page)

Replaces the old background-music player (removed everywhere).

- Engine: `site/soundscape.js` (plain JS); clips in `site/soundscape/*.m4a`.
- Scroll → descent `t` uses the same `[data-redwood-stop]` mapping as `redwood.js`; `t` → listener
  height via `CAM_Y` (mirror of `KEYS[.][1]` in redwood.js — keep in sync if the camera changes).
- Five layers (`ZONES`: sky, canopy, crown, trunk, floor) at fixed heights; each clip in `CLIPS`
  belongs to one layer. Calls spawn near the listener's layer and are positioned in 3D (HRTF
  `PannerNode`, distance roll-off, air-absorption low-pass, synthetic forest reverb), so they
  move overhead/underfoot as you scroll. Wind/rustle/creek ambience is synthesized noise; its
  level is the `AMBIENCE` constant. Ambience bypasses the compressor (else loud calls pump it
  down) and the noise loop uses an equal-power seam crossfade (a linear one dips ~3 dB).
- 3D spread: each new call takes the azimuth farthest from active/recent calls (`pickAzimuth`).
  Clips with `fly` (m/s) move along arcs; `duet` (default `DUET`) = chance a second individual
  answers from the far side. Pitch ±3 %, level, length and envelope vary per call; spawn rate
  follows a slow `activity` swell. `MAX_VOICES` = 6.
- Ambience is `WIND_N` + `RUSTLE_N` + 1 creek mono HRTF point sources (roll-off 0 = direction
  only; per-source gain ÷ √N). Wind sources gust independently, the field slowly rotates, and
  gust fronts (`sweep`) cross the head. Creek is fixed in world direction, below you when high.
  `twigDrop` = rare synthesized needle/twig taps falling past the listener.
- Debug: `__soundscape.debug().voices` shows each call's angle relative to the listener's facing.
- Clip selection: audition several xeno-canto q:A candidates per species, keep the highest
  band SNR after windowing+denoise (all current clips ≥43 dB). Skip inherently noisy habitats
  (e.g. American Dipper — always over a loud creek).
- Enter gate (`#enter-gate` in index.html, logic in app.js "ENTER GATE"): once per session
  (`sessionStorage.siteEntered`); its click is the user gesture that unlocks audio. An inline
  `<head>` script sets `html.gate` before paint; hero reveals wait for it; auto-removes after 4 s
  if app.js never sets `window.__gateReady`.
- API: `window.__soundscape.setMuted/isMuted/duck`. Nav `#btn-mute` (app.js) toggles it; unmuted
  YouTube cards duck it. Mute pref key: `localStorage.siteAudioMuted` (also read by `assets/js/quote-typewriter.js` speech).
- Clips: xeno-canto (CC BY-NC-SA 4.0) + NPS Yellowstone (public domain), trimmed to the busiest
  16–30 s, high-passed, spectral-gate denoised (noise profile from the quietest frames, −20 dB residual floor), levelled, mono AAC 64 kbps (~200 KB each). Credits render into
  `#sound-credits` in the footer from `CLIPS`; add `by`/`xc` for any new clip (license requires it).
- Adding a clip: put `<id>.m4a` in `site/soundscape/`, add an entry to `CLIPS`.
  Avoid CC *-ND* sources (we trim). Sensitive species (e.g. Spotted Owl) are download-restricted on xeno-canto.
- Subpages have no soundscape; they use `assets/js/site-controls.js` (theme toggle + license link).
