"""Half Dome photogrammetry scan (binary FBX + 4 diffuse textures) -> RDWD point-cloud bins.

usage: python3 -I tools/build-halfdome.py <scan.fbx> <textures dir> site/halfdome
(source: "half-dome-yosemite" download; needs numpy, scipy, Pillow)
Output layout identical to redwood.js / catalina.js bins (48-byte header, u16 xyz, u8 rgbs).
Points are sampled on the triangles (area-weighted) and coloured from the textures.
"""
import sys, json, struct, zlib
import numpy as np
from PIL import Image
from scipy import ndimage

fbx, texdir, out = sys.argv[1:4]
rng = np.random.default_rng(11)
Image.MAX_IMAGE_PIXELS = None
SCALE = 135.0  # metres per scan unit: puts the summit ~1430 m above the scan's lowest point


# ---------- minimal binary FBX reader (7.x) ----------
def read_fbx(path):
    d = open(path, "rb").read()
    ver = struct.unpack("<I", d[23:27])[0]
    big = ver >= 7500

    def node(o):
        if big:
            end, n_props, _ = struct.unpack("<QQQ", d[o : o + 24]); o += 24
        else:
            end, n_props, _ = struct.unpack("<III", d[o : o + 12]); o += 12
        nl = d[o]; o += 1
        if end == 0:
            return None, o
        name = d[o : o + nl].decode(); o += nl
        props = []
        for _ in range(n_props):
            t = chr(d[o]); o += 1
            if t in "YCIFDL":
                fmt = {"Y": "<h", "C": "<?", "I": "<i", "F": "<f", "D": "<d", "L": "<q"}[t]
                s = struct.calcsize(fmt)
                props.append(struct.unpack(fmt, d[o : o + s])[0]); o += s
            elif t in "fdlib":
                _, enc, cl = struct.unpack("<III", d[o : o + 12]); o += 12
                raw = d[o : o + cl]; o += cl
                if enc:
                    raw = zlib.decompress(raw)
                props.append(np.frombuffer(raw, {"f": "<f4", "d": "<f8", "l": "<i8", "i": "<i4", "b": "u1"}[t]))
            elif t in "SR":
                n = struct.unpack("<I", d[o : o + 4])[0]; o += 4
                v = d[o : o + n]; o += n
                props.append(v.decode("utf8", "replace") if t == "S" else v)
        kids = []
        while o < end:
            k, o = node(o)
            if k is None:
                break
            kids.append(k)
        return dict(name=name, props=props, kids=kids), end

    o, top = 27, []
    while o < len(d) - 200:
        n, o2 = node(o)
        if n is None:
            break
        top.append(n); o = o2
    return {n["name"]: n for n in top}


def child(n, name):
    return next(k for k in n["kids"] if k["name"] == name)


T = read_fbx(fbx)
objs = T["Objects"]["kids"]
geo = next(o for o in objs if o["name"] == "Geometry")
model = next(o for o in objs if o["name"] == "Model" and o["props"][2] == "Mesh")
V = child(geo, "Vertices")["props"][0].reshape(-1, 3).astype(float)
idx = child(geo, "PolygonVertexIndex")["props"][0].astype(np.int64)
assert (np.nonzero(idx < 0)[0] % 3 == 2).all(), "expected triangles"
tri = np.where(idx < 0, ~idx, idx).reshape(-1, 3)
uvl = child(geo, "LayerElementUV")
uv = child(uvl, "UV")["props"][0].reshape(-1, 2)
uvi = child(uvl, "UVIndex")["props"][0].reshape(-1, 3)
mat = child(child(geo, "LayerElementMaterial"), "Materials")["props"][0]

# material slot order = order of Material -> Model connections; texture per material by name
mats = {o["props"][0]: o["props"][1].split("\x00")[0] for o in objs if o["name"] == "Material"}
slots = [c["props"][1] for c in T["Connections"]["kids"] if c["props"][1] in mats and c["props"][2] == model["props"][0]]
tex = [np.asarray(Image.open(f"{texdir}/{mats[s]}.jpeg").convert("RGB")) for s in slots]
print("materials", [mats[s] for s in slots])

# model transform (Lcl Rotation, XYZ order) -> y up
rot = next(p["props"][4:7] for p in child(model, "Properties70")["kids"] if p["props"][0] == "Lcl Rotation")
ax, _, az = np.radians(rot)
Rx = np.array([[1, 0, 0], [0, np.cos(ax), -np.sin(ax)], [0, np.sin(ax), np.cos(ax)]])
Rz = np.array([[np.cos(az), -np.sin(az), 0], [np.sin(az), np.cos(az), 0], [0, 0, 1]])
W = V @ (Rz @ Rx).T * SCALE

# ---------- per-triangle geometry ----------
A, B, C = W[tri[:, 0]], W[tri[:, 1]], W[tri[:, 2]]
N = np.cross(B - A, C - A)
area = np.linalg.norm(N, axis=1) / 2
cen = (A + B + C) / 3
summit = cen[np.argmax(cen[:, 1])]
ORIGIN = np.array([summit[0], W[:, 1].min(), summit[2]])

# scan footprint (top view) -> distance to its edge, so the cut-off borders fade out
CELL = 20.0
xz = cen[:, [0, 2]]
lo_xz = xz.min(0) - 3 * CELL
gx, gz = np.ceil((xz.max(0) - lo_xz) / CELL).astype(int) + 3
occ = np.zeros((gz, gx), bool)
cij = ((xz - lo_xz) / CELL).astype(int)
occ[cij[:, 1], cij[:, 0]] = True
occ = ndimage.binary_closing(occ, iterations=3)
occ = ndimage.binary_fill_holes(occ)
edge_d = ndimage.distance_transform_edt(occ) * CELL  # metres from footprint edge


def sample(n):
    # over-sample, then thin near the footprint edge
    m = int(n * 1.6)
    k = rng.choice(len(tri), m, p=area / area.sum())
    b = rng.random((m, 2)); f = b.sum(1) > 1; b[f] = 1 - b[f]
    w = np.c_[1 - b.sum(1), b]
    P = (np.stack([A[k], B[k], C[k]], 1) * w[..., None]).sum(1)
    U = (uv[uvi[k]] * w[..., None]).sum(1)
    q = (P[:, [0, 2]] - lo_xz) / CELL
    e = ndimage.map_coordinates(edge_d, [q[:, 1], q[:, 0]], order=1, mode="constant")
    keep = rng.random(m) < np.clip((e - 30) / 260, 0, 1) ** 1.5
    P, U, k = P[keep][:n], U[keep][:n], k[keep][:n]
    col = np.zeros((len(P), 3), np.uint8)
    for i, t in enumerate(tex):
        s = mat[k] == i
        H, Wd = t.shape[:2]
        col[s] = t[np.clip(((1 - U[s, 1]) * (H - 1)).astype(int), 0, H - 1), np.clip((U[s, 0] * (Wd - 1)).astype(int), 0, Wd - 1)]
    return P - ORIGIN, col


meta = None
for tier, n in (("hi", 680000), ("lo", 200000)):
    P, Cc = sample(n)
    o = rng.permutation(len(P)); P, Cc = P[o], Cc[o]
    mn = P.min(0).astype(np.float32); mx = P.max(0).astype(np.float32)
    q = np.round((P - mn) / (mx - mn) * 65535).clip(0, 65535).astype("<u2")
    s = rng.integers(0, 256, len(P), dtype=np.uint8)
    rgbs = np.concatenate([Cc, s[:, None]], 1)
    hdr = b"RDWD" + struct.pack("<III", 1, len(P), 0) + mn.astype("<f4").tobytes() + mx.astype("<f4").tobytes() + bytes(8)
    with open(f"{out}/halfdome-{tier}.bin", "wb") as f:
        f.write(hdr); f.write(q.tobytes()); f.write(rgbs.tobytes())
    print(tier, len(P), "min", mn, "max", mx)
    if tier == "hi":
        meta = dict(bboxMin=[round(float(a), 1) for a in mn], bboxMax=[round(float(a), 1) for a in mx], count={})
    meta["count"][tier] = len(P)

# direction the big (steep) wall faces, horizontal unit vector (x, z)
steep = np.abs(N[:, 1] / (2 * area + 1e-12)) < 0.35
h = (N[steep][:, [0, 2]]).sum(0); h /= np.linalg.norm(h)
meta.update({
    "version": 1,
    "source": "Half Dome, Yosemite: photogrammetry mesh (Sketchfab-style FBX download) with its diffuse textures",
    "units": "m (approx., scan scaled so the relief is ~1430 m)", "up": "y",
    "totalHeight": round(float(W[:, 1].max() - W[:, 1].min()), 1),
    "faceDir": [round(float(h[0]), 3), round(float(h[1]), 3)],
    "files": {t: {"name": f"halfdome-{t}.bin", "count": meta["count"][t]} for t in ("hi", "lo")},
    "colorMode": "rgb",
    "notes": "x/z horizontal, y up; origin below the summit at the scan's lowest height. "
             "Area-weighted surface samples, true texture RGB, s byte = uniform random. Pre-shuffled. "
             "Density fades out over the last ~300 m of the scan footprint.",
})
meta.pop("count")
json.dump(meta, open(f"{out}/halfdome.json", "w"), indent=1)
print(json.dumps(meta, indent=1))
