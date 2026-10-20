import sys, cv2, numpy as np, pickle, collections
sys.path.insert(0, '.')
import h

def bars(gray):
    """rows/cols of uniform near-black letterbox/pillarbox bars"""
    H, W = gray.shape
    rows = (gray.max(axis=1) <= 24)
    cols = (gray.max(axis=0) <= 24)
    top = 0
    while top < H and rows[top]: top += 1
    bot = H
    while bot > top and rows[bot - 1]: bot -= 1
    left = 0
    while left < W and cols[left]: left += 1
    right = W
    while right > left and cols[right - 1]: right -= 1
    return top, bot, left, right

def feats(img):
    gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    t, b, l, r = bars(gray0)
    if b - t < 0.3 * img.shape[0] or r - l < 0.3 * img.shape[1]:
        return None
    img = img[t:b, l:r]
    gray = gray0[t:b, l:r]
    n = gray.size
    code = (img[..., 0].astype(np.int32) << 16) | (img[..., 1].astype(np.int32) << 8) | img[..., 2].astype(np.int32)
    vals, cnt = np.unique(code, return_counts=True)
    order = np.argsort(cnt)[::-1][:5]
    top = vals[order]; tc = cnt[order]
    lum = lambda c: 0.114 * (c >> 16 & 255) + 0.587 * (c >> 8 & 255) + 0.299 * (c & 255)
    shares = {"black": 0.0, "white": 0.0, "mid": 0.0}
    for c, k in zip(top, tc):
        L = lum(int(c))
        shares["black" if L <= 20 else "white" if L >= 235 else "mid"] += k / n
    return dict(top5=sum(shares.values()), **shares, bars=(t, b, l, r) != (0, gray0.shape[0], 0, gray0.shape[1]))

rows = pickle.load(open(h.DATA / "gfx_rows.pkl", "rb"))
out = []
cap_cache = {}
for lab, spec, idx, _ in rows:
    s, vid = spec.split(":")
    base, res, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}")
    if spec not in cap_cache: cap_cache[spec] = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
    cap = cap_cache[spec]
    sh = f.shots[idx]
    cap.set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
    ok, img = cap.read()
    ft = feats(img)
    if ft is None: continue
    out.append((lab, spec, idx, ft))
for key in ("top5", "black", "white", "mid"):
    for lab in ("G", "C"):
        v = np.array([r[3][key] for r in out if r[0] == lab])
        print(f"{key:6s} {lab} n={len(v)} " + " ".join(f"p{p}={np.percentile(v,p):.3f}" for p in (5, 10, 25, 50, 75, 90, 95)))
print("camera shots with top5 >= 0.2:")
for lab, spec, idx, ft in out:
    if lab == "C" and ft["top5"] >= 0.2: print("  ", spec, idx, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in ft.items()})
print("graphics shots with top5 < 0.3:")
for lab, spec, idx, ft in out:
    if lab == "G" and ft["top5"] < 0.3: print("  ", spec, idx, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in ft.items()})
pickle.dump(out, open(h.DATA / "gfx_rows3.pkl", "wb"))
