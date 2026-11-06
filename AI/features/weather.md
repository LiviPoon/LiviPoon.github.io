# Weather layers (`site/weather.js`)

One script, three effects, all drawn as small soft discs (`gl.POINTS`, same look as the scans: no sprites/textures), drawn through the point-cloud engines' layer hooks
(`RedwoodLayers` / `CatalinaLayers` / `HalfDomeLayers`, each `{ init(gl, api), draw(gl, frame) }`,
drawn after the terrain with the same camera, lens shift, theme and dim). Included after the engine
script on `index.html`, `achievements/index.html`, `cv/index.html`.

| Page | Effect | How |
|---|---|---|
| Homepage (redwood) | Ground mist | Same point shader, ~1.6 m tall layer of lobes drifting around the trunk base (`MIST`). |
| Achievements (Catalina) | Moving clouds | Cauliflower clusters (~130k pts hi): each cloud is 8-12 overlapping lobes (dome, soft flat base, shell-biased points, lit by normal) that breathe and shear against each other; cumulus + flat marine-layer sheets at 1.8-2.7 km, wind 55 m/s with altitude shear, billowing, twinkling like the models. |
| CV (Half Dome) | Rolling fog | Same point shader; banks follow a ground height map built from the scan itself (`groundMap`), thin out up the valley walls, roll in slow swells. |

- Cost: static VBOs, all motion from the `uTime` uniform in the vertex shader, one draw call each.
  Lo tier uses ~60% of the puffs. `?weather=off` and `navigator.connection.saveData` disable it.
- Engine contract: `catalina.js`/`halfdome.js` rebind their program + VAO at the top of `draw()`
  because layers leave their own bound. The frame object is built in each engine's `drawLayers`.
- Tune: `CLOUDS`, `FOG`, `MIST` at the top-level consts of `weather.js` (alpha, counts, wind, altitude).

- `redwood-text.js` `data-center` blocks (mission) always sit left, so `g.at` is forced to `L` and the tree steers right.
- Motion: wind drifts each body whole (with altitude shear); inside it a coherent two-octave flow field in cloud-local space (`uTurb`) carries neighbouring points together, while per-point jitter lets individual points wander. Lobes also breathe and shear.

- Mobile: the redwood mist is not registered at <=767px (tree is dimmed to 15% there); coarse-pointer devices use 40% of the puffs on the lo tier. Phone footer/credits rules sit at the end of `styles.css` ("phones: footer, credits ticker and tap targets").
