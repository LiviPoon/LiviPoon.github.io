# Catalina Island (achievements page)

`site/achievements/index.html` uses the homepage design (nav, menu, enter gate, `styles.css`,
`app.js`) over a point cloud of Santa Catalina Island instead of the redwood.

## Point cloud: `site/catalina.js`, `site/catalina/`
- Sibling of `redwood.js`: same RDWD binary layout, same page hooks (`data-redwood-stop`,
  `-side`, `-dim`), and it sets `html[data-redwood="on"]` so the homepage scrim/halo CSS applies.
- Data built by `tools/build-catalina.py` from the Sketchfab-style download
  (`Catalina Island.obj`, a 65×65 height grid with ~2.5× vertical exaggeration, plus
  `ESRI_AERIAL_WM.png`). Heights are bicubic-smoothed, the coastline comes from an imagery
  land mask, and faint canyon relief comes from high-passed imagery luminance. Sea points sit at y = 0
  (the shader bobs them on a swell); their density fades with distance from the coast and to zero
  before the image border (no rectangular edge). hi 680k pts / lo 200k pts.
- Camera: `PATH` keyframes (eye + look-at, metres) over descent t, Catmull-Rom. The flight runs
  from high over the Pacific (west), along the spine, out over the south coast, to the water off
  Avalon. `window.Catalina.eyeAt(t)` is shared with the soundscape.
- Debug: `?catalina=off|lo|hi|debug`, `?catalina-opacity=2`.

## Soundscape: `site/catalina-soundscape.js`, `site/catalina/sounds/`
- Same engine and API as [soundscape.md](soundscape.md) (`window.__soundscape`, nav mute,
  mute key `siteAudioMuted`). Layers by listener altitude (log-scale weight): sky, highlands,
  canyon, shore, sea. Calls from other layers get only a small vertical hint.
- Ambience: real loops `surf-distant` (hills/cliffs) and `waves-close` (sea level) under synthesized
  wind. A synthesized surf stands in until the real loop decodes.
- Clips: xeno-canto (q:A, non-ND licences) and US-government public-domain recordings (NPS/NOAA),
  auditioned for SNR, trimmed to 16–30 s, high-passed, spectral-gate denoised, levelled, mono AAC
  64 kbps. Credits render into `#sound-credits` from `CLIPS`/`BEDS`. Add `by` + `xc` or `src` + `url`.

## Radio
- `RADIO` in `catalina-soundscape.js` plays `catalina/sounds/surfer-girl.m4a` (looped `<audio>`) through
  the same AM-radio chain as the redwood radio ([soundscape.md](soundscape.md)). It sits at a fixed
  world point on the water just ahead of the final camera position (`RADIO.pos`), so it is inaudible
  during the high flight and swells in, panning with the heading, as the flight arrives off Avalon.
  Missing file → radio silently stays off. ("Fun Fun Fun" moved to the CV page, see [halfdome.md](halfdome.md).) The recording is copyrighted; hosting it publicly needs a licence.

## Credits to keep
Terrain mesh: Sketchfab download "catalina-island-california-pacific-ocean" (check its licence
before re-use). Imagery: Esri World Imagery (attribution in the footer).
