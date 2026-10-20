import sys, cv2, numpy as np
sys.path.insert(0, '.')
import h

def feats(img):
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mid = (gray > 20) & (gray < 235)
    code = (img[..., 0].astype(np.int32) << 16) | (img[..., 1].astype(np.int32) << 8) | img[..., 2].astype(np.int32)
    vals, cnt = np.unique(code[mid], return_counts=True)
    top5 = float(np.sort(cnt)[::-1][:5].sum() / (H * W)) if cnt.size else 0.0
    vals_all, cnt_all = np.unique(code, return_counts=True)
    top5all = float(np.sort(cnt_all)[::-1][:5].sum() / (H * W))
    # axis-aligned long straight edges
    edges = cv2.Canny(gray, 60, 180)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=int(0.15 * W), maxLineGap=2)
    axis = 0
    if lines is not None:
        for x1, y1, x2, y2 in lines[:, 0]:
            if x1 == x2 or y1 == y2:
                axis += 1
    # exact-flat 3x3 share in mid-tones
    k = np.ones((3, 3), np.uint8)
    rng = cv2.dilate(gray, k).astype(np.int16) - cv2.erode(gray, k).astype(np.int16)
    flatmid = float(((rng == 0) & mid).sum() / max(1, mid.sum()))
    return dict(top5=top5, top5all=top5all, axis=axis, flatmid=flatmid)

def run(spec, label_fn):
    s, vid = spec.split(":")
    base, res, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}")
    cap = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
    out = []
    for sh in f.shots:
        if sh.length < 6: continue
        cap.set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
        ok, img = cap.read()
        if not ok: continue
        if img.mean() < 15: continue  # black
        lab = label_fn(sh.index)
        if lab is None: continue
        out.append((lab, spec, sh.index, feats(img)))
    return out

G = lambda i: "G"
C = lambda i: "C"
specs = [("holdout:h23", G), ("holdout:h25", G), ("holdout:h28", G), ("holdout:h10", G), ("tiers:v16", G),
         ("holdout:h24", lambda i: "G" if 2 <= i <= 6 else ("C" if i in (1, 7) else None)),
         ("holdout:h21", lambda i: "G" if i in (1, 2) else "C"),
         ("market:m26", C), ("holdout:h11", C), ("holdout:h04", C), ("market:m05", C), ("holdout:h03", C), ("holdout:h02", C),
         ("tiers:v19", C), ("market:m22", C), ("holdout:h12", C), ("holdout:h33", C), ("market:m11", C), ("holdout:h29", C),
         ("tiers:v14", C), ("holdout:h31", None)]
rows = []
for spec, fn in specs:
    if fn is None: continue
    rows += run(spec, fn)
import collections
for key in ("top5", "top5all", "axis", "flatmid"):
    for lab in ("G", "C"):
        v = np.array([r[3][key] for r in rows if r[0] == lab])
        print(f"{key:8s} {lab} n={len(v)} p10={np.percentile(v,10):.3f} p25={np.percentile(v,25):.3f} med={np.median(v):.3f} p75={np.percentile(v,75):.3f} p90={np.percentile(v,90):.3f}")
# per video medians
by = collections.defaultdict(list)
for lab, spec, i, ft in rows: by[(lab, spec)].append(ft)
for (lab, spec), fs in by.items():
    print(lab, spec, " ".join(f"{k}={np.median([x[k] for x in fs]):.3f}" for k in ("top5", "top5all", "axis", "flatmid")), "max top5", f"{max(x['top5'] for x in fs):.3f}")
import pickle; pickle.dump(rows, open(h.DATA / "gfx_rows.pkl", "wb"))
