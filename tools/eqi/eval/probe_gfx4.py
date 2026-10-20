import sys, cv2, numpy as np, pickle
sys.path.insert(0, '.')
import h
from probe_gfx3 import bars

def stats(frame, width=640):
    H0, W0 = frame.shape[:2]
    img = cv2.resize(frame, (width, round(H0 * width / W0)), interpolation=cv2.INTER_NEAREST)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    t, b, l, r = bars(gray)
    if b - t < 0.3 * gray.shape[0] or r - l < 0.3 * gray.shape[1]:
        t, b, l, r = 0, gray.shape[0], 0, gray.shape[1]
    img, gray = img[t:b, l:r], gray[t:b, l:r]
    n = gray.size
    code = (img[..., 0].astype(np.int32) << 16) | (img[..., 1].astype(np.int32) << 8) | img[..., 2].astype(np.int32)
    vals, cnt = np.unique(code, return_counts=True)
    order = np.argsort(cnt)[::-1][:5]
    out = {"mid": 0.0, "white": 0.0, "black": 0.0}
    for c, k in zip(vals[order], cnt[order]):
        L = 0.114 * (c >> 16 & 255) + 0.587 * (c >> 8 & 255) + 0.299 * (c & 255)
        out["black" if L <= 20 else "white" if L >= 235 else "mid"] += k / n
    for name, mask, soft in (("white", gray >= 250, (gray >= 190) & (gray < 250)), ("black", gray <= 5, (gray > 5) & (gray <= 50))):
        if mask.mean() < 0.05:
            out[name + "_soft"] = None; out[name + "_ink"] = None; continue
        m = mask.astype(np.uint8)
        ring = (cv2.dilate(m, np.ones((5, 5), np.uint8)) > 0) & ~mask
        out[name + "_soft"] = float(soft[ring].mean()) if ring.any() else 0.0
        ring1 = (cv2.dilate(m, np.ones((3, 3), np.uint8)) > 0) & ~mask
        ink = (gray < 128) if name == "white" else (gray > 128)
        out[name + "_ink"] = float(ink[ring1].mean()) if ring1.any() else 0.0
    return out

rows = pickle.load(open(h.DATA / "gfx_rows3.pkl", "rb"))
fix = {("market:m26", 18), ("market:m26", 19), ("market:m26", 20), ("holdout:h02", 0), ("holdout:h02", 1), ("holdout:h33", 0), ("holdout:h29", 0)}
caps, res = {}, []
for lab, spec, idx, _ in rows:
    s, vid = spec.split(":")
    base, r_, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}")
    if spec not in caps: caps[spec] = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
    sh = f.shots[idx]
    caps[spec].set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
    ok, img = caps[spec].read()
    res.append(("G" if (spec, idx) in fix else lab, spec, idx, stats(img)))
pickle.dump(res, open(h.DATA / "gfx_rows4.pkl", "wb"))
for lab in "GC":
    for k in ("mid", "white", "black"):
        v = [r[3][k] for r in res if r[0] == lab]
        print(lab, k, np.percentile(v, [5, 10, 50, 90, 95, 99]).round(3), "max", round(max(v), 3))
    for k in ("white_soft", "white_ink", "black_soft", "black_ink"):
        v = [r[3][k] for r in res if r[0] == lab and r[3][k] is not None and r[3][k.split('_')[0]] >= 0.3]
        if v: print(lab, k, "(tone share>=0.3) n", len(v), np.percentile(v, [0, 10, 50, 90, 100]).round(3))
print("white>=0.3 cases:")
for r in res:
    if r[3]["white"] >= 0.3 or r[3]["black"] >= 0.3:
        print(" ", r[0], r[1], r[2], {k: (round(v, 3) if v is not None else None) for k, v in r[3].items()})
