# Half Dome (CV page)

`site/cv/index.html` uses the homepage design (nav, menu, enter gate, `styles.css`, `app.js`)
over a point cloud of Half Dome. Scrolling climbs the dome while the CV unfolds as chapters
in **the same order as the PDF** (objectives, skills, research, papers, presentations,
professional, awards, personal projects, certifications, education), then a short summit close.
Keep that order when the PDF changes. Chapter markup reuses the achievements
layout (`.mirror-quotes.ach-chapter`). Entries are `.cv-entry` cards, and `.cv-chapter--wide` gives
a single column. CSS lives in the "CV PAGE" block of `styles.css`.

## The PDF ("View CV")
- `[data-cv-open]` buttons open `#cv-overlay` (`assets/js/cv-overlay.js`). On first open,
  `cv-pdf.js` renders `cv/cv.pdf` with pdf.js, via `window.__renderCvPdf`. Containers with
  `data-defer` are not rendered on load.
- `/cv/#pdf` opens straight to the PDF. Esc or Close shuts it, and the soundscape is ducked while it's open.
- **Updating the CV:** replace `site/cv/cv.pdf`, then update the matching text in `cv/index.html`.

## Point cloud: `site/halfdome.js`, `site/halfdome/`
- Sibling of `catalina.js`: same RDWD binary layout, the same page hooks (`data-redwood-stop`,
  `-side`, `-dim`), and it sets `html[data-redwood="on"]`.
- Data is built by `tools/build-halfdome.py` from the "half-dome-yosemite" download (binary FBX 7.4
  plus 4 diffuse textures; the script includes a small FBX reader). Points are area-weighted samples
  on the mesh, coloured from the textures. The scan is scaled to about 1430 m of relief, and density
  fades out near the scan's edges. hi 680k pts / lo 200k pts.
  `python3 -I tools/build-halfdome.py <scan.fbx> <textures dir> site/halfdome`
- Colour: texture luminance splits forest (dark) from granite (bright), and the summit gets a warm tint.
- Camera: `PATH` keyframes (eye + look-at, metres). It starts on the side profile, moves to the
  foot of the NW face, climbs it, crosses the summit, and pulls back above the profile.
  `window.HalfDome.eyeAt(t)` is shared with the soundscape.
- Debug: `?halfdome=off|lo|hi|debug`, `?halfdome-opacity=2`.

## Soundscape: `site/halfdome-soundscape.js`
- Same engine and API as [catalina.md](catalina.md). Layers by listener altitude: sky (summit),
  face (granite), forest (valley). It has no audio files of its own: it reuses Sierra species from
  `soundscape/` and `catalina/sounds/` (each clip has a `dir`). The river and wind are synthesized,
  and the reverb models granite-wall echoes.

## Credits to keep
Half Dome photogrammetry scan (the Sketchfab-style "half-dome-yosemite" download). Check its licence
before re-use or if it changes.
