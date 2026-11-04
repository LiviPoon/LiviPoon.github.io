"""Catalina OBJ (65x65 height grid) + ESRI aerial texture -> RDWD point-cloud bins.

usage: python3 -I tools/build-catalina.py "Catalina Island.obj" ESRI_AERIAL_WM.png site/catalina
(source: catalina-island-california-pacific-ocean download; needs numpy, scipy, Pillow)
Output layout identical to redwood.js bins (48-byte header, u16 xyz, u8 rgbs).
Extra: s byte; land/sea flag is encoded in point position (sea points have y == 0).
"""
import sys, json, struct
import numpy as np
from PIL import Image
from scipy import ndimage

obj, texp, out = sys.argv[1:4]
rng = np.random.default_rng(7)
Image.MAX_IMAGE_PIXELS = None

# ---------- mesh -> height grid ----------
L = [l.split() for l in open(obj)]
v = np.array([x[1:4] for x in L if x and x[0] == "v"], float)
xs = np.unique(np.round(v[:, 0], -1)); zs = np.unique(np.round(v[:, 2], -1))
nx, nz = len(xs), len(zs)
X0, X1, Z0, Z1 = v[:, 0].min(), v[:, 0].max(), v[:, 2].min(), v[:, 2].max()
G = np.zeros((nz, nx))
ix = np.round((v[:, 0] - X0) / (X1 - X0) * (nx - 1)).astype(int)
iz = np.round((v[:, 2] - Z0) / (Z1 - Z0) * (nz - 1)).astype(int)
G[iz, ix] = np.maximum(G[iz, ix], v[:, 1])

# UV mapping from faces (fit u = a*x + b, v = c*z + d)
vt = np.array([x[1:3] for x in L if x and x[0] == "vt"], float)
pv, pt = [], []
for x in L:
    if x and x[0] == "f":
        for c in x[1:]:
            a = c.split("/"); pv.append(int(a[0]) - 1); pt.append(int(a[1]) - 1)
pv, pt = np.array(pv), np.array(pt)
au = np.polyfit(v[pv, 0], vt[pt, 0], 1); av = np.polyfit(v[pv, 2], vt[pt, 1], 1)
print("uv fit u=%.3e x + %.4f ; v=%.3e z + %.4f" % (*au, *av))

tex = np.asarray(Image.open(texp).convert("RGB"))
TH, TW = tex.shape[:2]

def tex_px(x, z):
    u = np.polyval(au, x); vv = np.polyval(av, z)
    return np.clip(u * (TW - 1), 0, TW - 1), np.clip((1 - vv) * (TH - 1), 0, TH - 1)

# ---------- land mask from imagery (sea = dark blue) ----------
small = np.asarray(Image.fromarray(tex).reduce(4)).astype(float)  # ~20 m/px
r, g, b = small[..., 0], small[..., 1], small[..., 2]
land = (r + g > 1.55 * b + 40) | ((r + g + b) > 330)
land = ndimage.binary_opening(land, iterations=2)
lab, n = ndimage.label(land)
sizes = ndimage.sum(land, lab, range(1, n + 1))
land = lab == (1 + int(np.argmax(sizes)))  # keep the island only
land = ndimage.binary_fill_holes(land)
dist_in = ndimage.distance_transform_edt(land)  # px (~20 m) from coast, inland
dist_out = ndimage.distance_transform_edt(~land)
SH, SW = land.shape
print("land px", land.sum(), "of", land.size)

# height field on the small-texture raster: bicubic up-sample of the grid
gy = np.linspace(0, nz - 1, SH); gx = np.linspace(0, nx - 1, SW)
# texture row 0 is v=1 -> which z? map raster row to z through the uv fit
row_v = 1 - np.arange(SH) / (SH - 1); col_u = np.arange(SW) / (SW - 1)
z_of_row = (row_v - av[1]) / av[0]; x_of_col = (col_u - au[1]) / au[0]
fz = (z_of_row - Z0) / (Z1 - Z0) * (nz - 1); fx = (x_of_col - X0) / (X1 - X0) * (nx - 1)
FZ, FX = np.meshgrid(fz, fx, indexing="ij")
Hs = ndimage.map_coordinates(ndimage.gaussian_filter(G, 0.6), [FZ, FX], order=3, mode="nearest")
Hs = np.maximum(Hs, 0)
# shape coastline from the imagery mask: ramp up over ~200 m inland, zero offshore
ramp = np.clip(dist_in / 22.0, 0, 1) ** 0.85
Hs = Hs * ramp + land * 6.0  # low cliffs/beach a few metres above sea
# small-scale relief from shaded imagery (canyon shadows): gentle, high-passed luminance
lum = (0.3 * r + 0.59 * g + 0.11 * b)
hp = lum - ndimage.gaussian_filter(lum, 6)
Hs = Hs + land * ramp * np.clip(hp, -40, 40) * 0.6
Hs = np.where(land, np.maximum(Hs, 2.0), 0.0)
print("height max", Hs.max())

def bilinear(A, py, px):
    return ndimage.map_coordinates(A, [py, px], order=1, mode="nearest")

def sample(n_land, n_sea, sea_radius_px):
    # land: uniform over land pixels with jitter, weighted by surface slope
    ys, xs_ = np.nonzero(land)
    gyH, gxH = np.gradient(Hs, 20.0)  # px ~ 20 m (approx)
    w = np.sqrt(1 + gyH[ys, xs_] ** 2 + gxH[ys, xs_] ** 2)
    pick = rng.choice(len(ys), n_land, p=w / w.sum())
    py = ys[pick] + rng.random(n_land) - 0.5; px = xs_[pick] + rng.random(n_land) - 0.5
    hy = bilinear(Hs, py, px)
    # sea: density falls off with distance from the coast
    sy, sx = [], []
    need = n_sea
    while need > 0:
        cy = rng.random(need * 3) * (SH - 1); cx = rng.random(need * 3) * (SW - 1)
        d = bilinear(dist_out, cy, cx)
        # fade to nothing well before the image border (else the sea ends in a hard rectangle)
        edge = np.minimum.reduce([cy, SH - 1 - cy, cx, SW - 1 - cx]) / 260.0
        edge = np.clip(edge, 0, 1); edge = edge * edge * (3 - 2 * edge)
        keep = (d > 0.5) & (rng.random(len(d)) < np.exp(-((d / sea_radius_px) ** 2)) * edge)
        a, b2 = cy[keep][:need], cx[keep][:need]
        sy.append(a); sx.append(b2); need -= len(a)
    sy = np.concatenate(sy)[:n_sea]; sx = np.concatenate(sx)[:n_sea]
    PY = np.concatenate([py, sy]); PX = np.concatenate([px, sx])
    Y = np.concatenate([hy, np.zeros(len(sy))])
    # world coords
    u = PX / (SW - 1); vv = 1 - PY / (SH - 1)
    Xw = (u - au[1]) / au[0]; Zw = (vv - av[1]) / av[0]
    # colours from full-res texture
    tx = np.clip(np.round(u * (TW - 1)).astype(int), 0, TW - 1)
    ty = np.clip(np.round((1 - vv) * (TH - 1)).astype(int), 0, TH - 1)
    col = tex[ty, tx]
    isl = np.concatenate([np.ones(len(py), bool), np.zeros(len(sy), bool)])
    return np.stack([Xw, Y, Zw], 1), col, isl

# centre on the island, metres; y up; z = south (image down), x = east
ys_, xs2 = np.nonzero(land)
cu = xs2.mean() / (SW - 1); cv = 1 - ys_.mean() / (SH - 1)
CX = (cu - au[1]) / au[0]; CZ = (cv - av[1]) / av[0]

meta = None
for tier, nl, ns in (("hi", 520000, 160000), ("lo", 150000, 50000)):
    P, C, isl = sample(nl, ns, 150)  # sea fades over ~3 km (gaussian)
    P[:, 0] -= CX; P[:, 2] -= CZ
    o = rng.permutation(len(P)); P, C, isl = P[o], C[o], isl[o]
    mn = P.min(0).astype(np.float32); mx = P.max(0).astype(np.float32)
    mx[1] = max(mx[1], 1.0)
    q = np.round((P - mn) / (mx - mn) * 65535).clip(0, 65535).astype("<u2")
    s = rng.integers(0, 256, len(P), dtype=np.uint8)
    rgbs = np.concatenate([C.astype(np.uint8), s[:, None]], 1)
    hdr = b"RDWD" + struct.pack("<III", 1, len(P), 0) + mn.astype("<f4").tobytes() + mx.astype("<f4").tobytes() + bytes(8)
    assert len(hdr) == 48
    with open(f"{out}/catalina-{tier}.bin", "wb") as f:
        f.write(hdr); f.write(q.tobytes()); f.write(rgbs.tobytes())
    print(tier, len(P), "min", mn, "max", mx)
    if tier == "hi":
        lp = P[isl]
        meta = dict(bboxMin=[round(float(a), 1) for a in mn], bboxMax=[round(float(a), 1) for a in mx],
                    landMin=[round(float(a), 1) for a in lp.min(0)], landMax=[round(float(a), 1) for a in lp.max(0)])
        # Avalon (town, east end) & peak positions for camera framing
        k = np.argmax(lp[:, 1]); meta["peak"] = [round(float(a), 1) for a in lp[k]]
        # principal axis of the island (radians, in xz)
        c = np.cov(lp[:, [0, 2]].T); w, V = np.linalg.eigh(c); ax = V[:, 1]
        meta["axis"] = round(float(np.arctan2(ax[1], ax[0])), 4)
        meta["halfLength"] = round(float(2 * np.sqrt(w[1])), 1); meta["halfWidth"] = round(float(2 * np.sqrt(w[0])), 1)
        # landmarks picked on a 1024-px-wide copy of the texture
        lm = {}
        for name, (px, py) in dict(avalon=(860, 610), isthmus=(380, 300), westEnd=(105, 180)).items():
            uu = px / 1024; vv2 = 1 - py / 874
            x = (uu - au[1]) / au[0] - CX; z = (vv2 - av[1]) / av[0] - CZ
            lm[name] = [round(float(x), 1), 0.0, round(float(z), 1)]
        meta["landmarks"] = lm

meta.update({
    "version": 1,
    "source": "Santa Catalina Island terrain mesh (Sketchfab download, Blender export) + Esri World Imagery texture",
    "units": "m", "up": "y",
    "verticalExaggeration": round(float(G.max()) / 648.0, 2),
    "totalHeight": round(float(Hs.max()), 1),
    "files": {"hi": {"name": "catalina-hi.bin", "count": 680000}, "lo": {"name": "catalina-lo.bin", "count": 200000}},
    "colorMode": "rgb",
    "notes": "x=east, y=up, z=south; origin at island centroid at sea level. Heights: 65x65 source grid, bicubic-smoothed, "
             "coastline refined from the aerial imagery land mask, faint canyon relief from high-passed imagery luminance. "
             "Sea points have y=0, density decaying ~3.6 km offshore. Colours: true aerial RGB. s byte = uniform random. Pre-shuffled.",
})
json.dump(meta, open(f"{out}/catalina.json", "w"), indent=1)
print(json.dumps({k: meta[k] for k in ("peak", "axis", "halfLength", "halfWidth", "totalHeight", "verticalExaggeration")}))
