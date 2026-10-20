import sys, cv2, numpy as np, pickle
sys.path.insert(0, '.')
import h
from probe_gfx3 import bars

def ring_soft(img):
    gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    t, b, l, r = bars(gray0)
    gray = gray0[t:b, l:r]
    res = {}
    for name, mask, soft in (("white", gray >= 250, (gray >= 190) & (gray < 250)),
                             ("black", gray <= 5, (gray > 5) & (gray <= 50))):
        share = float(mask.mean())
        if share < 0.05:
            res[name] = (round(share, 3), None); continue
        m = mask.astype(np.uint8)
        ring = (cv2.dilate(m, np.ones((7, 7), np.uint8)) > 0) & ~mask
        res[name] = (round(share, 3), round(float(soft[ring].mean()) if ring.any() else 0.0, 3))
    return res

rows = pickle.load(open(h.DATA / "gfx_rows3.pkl", "rb"))
caps = {}
out = []
for lab, spec, idx, ft in rows:
    s, vid = spec.split(":")
    if ft["white"] < 0.05 and ft["black"] < 0.05: continue
    base, res, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}")
    if spec not in caps: caps[spec] = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
    sh = f.shots[idx]
    caps[spec].set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
    ok, img = caps[spec].read()
    rs = ring_soft(img)
    true_lab = lab
    if (spec, idx) in {("market:m26", 18), ("market:m26", 19), ("market:m26", 20), ("holdout:h02", 0), ("holdout:h02", 1), ("holdout:h33", 0), ("holdout:h29", 0)}:
        true_lab = "G"
    out.append((true_lab, spec, idx, ft, rs))
for lab in ("G", "C"):
    for name in ("white", "black"):
        v = [o[4][name][1] for o in out if o[0] == lab and o[4][name][1] is not None]
        if v: print(lab, name, "n", len(v), "ring soft share p10/50/90", np.percentile(v, [10, 50, 90]).round(3), "min/max", min(v), max(v))
for o in out:
    if o[0] == "G" or (o[4]["white"][1] is not None and o[4]["white"][0] > 0.2) :
        print(o[0], o[1], o[2], "white", o[4]["white"], "black", o[4]["black"], "mid", round(o[3]["mid"], 3))
