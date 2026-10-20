import sys, cv2, numpy as np
sys.path.insert(0, '.')
import h
from eqi.features import active_area

def cues(frame, width=640):
    H0, W0 = frame.shape[:2]
    img = cv2.resize(frame, (width, round(H0 * width / W0)), interpolation=cv2.INTER_NEAREST)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    t, b, l, r = active_area(gray)
    img, gray = img[t:b, l:r], gray[t:b, l:r]
    n = gray.size
    flat = img.reshape(-1, 3).astype(np.int16)
    code = (flat[:, 0].astype(np.int32) << 16) | (flat[:, 1].astype(np.int32) << 8) | flat[:, 2].astype(np.int32)
    vals, cnt = np.unique(code, return_counts=True)
    out = []
    for c in np.argsort(cnt)[::-1][:5]:
        v = int(vals[c]); rgb = np.array([v >> 16 & 255, v >> 8 & 255, v & 255], np.int16)
        L = 0.114 * rgb[0] + 0.587 * rgb[1] + 0.299 * rgb[2]
        if L <= 20 or L >= 235: continue
        d = np.abs(flat - rgb).max(axis=1)
        exact = int(cnt[c]); near = int(((d > 0) & (d <= 2)).sum())
        out.append((exact / n, near / max(exact, 1)))
    mid = sum(e for e, _ in out)
    spike = sum(e for e, r in out if r <= 0.5)
    return mid, spike, [(round(e, 3), round(r, 2)) for e, r in out]

specs = {"FP": ["holdout:h14:6", "holdout:h14:7", "holdout:h16:0", "holdout:h16:1", "holdout:h16:23", "holdout:h16:24", "tiers:v04:4",
                "market:m10:7", "market:m10:13", "market:m10:15", "holdout:h27:71", "holdout:h27:129", "market:m27:0", "holdout:h27:96"],
         "D": ["holdout:h23:1", "holdout:h23:7", "holdout:h23:9", "holdout:h28:2", "holdout:h28:5", "holdout:h28:9", "holdout:h10:4", "holdout:h10:6",
               "holdout:h24:2", "holdout:h24:3", "market:m27:4", "market:m27:16", "market:m02:1", "market:m02:5", "tiers:v18:1", "tiers:v18:5",
               "holdout:h31:5", "holdout:h31:40", "market:m18:41", "holdout:h02:0", "holdout:h33:0", "holdout:h29:0"]}
caps = {}
for lab, lst in specs.items():
    for spec in lst:
        s, vid, i = spec.split(":"); i = int(i)
        base, res, prefix = h.SETS[s]
        f, a = h.features(f"{prefix}__{vid}")
        if spec[:-len(str(i))] not in caps:
            caps[spec[:-len(str(i))]] = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
        cap = caps[spec[:-len(str(i))]]
        sh = f.shots[i]
        res_ = []
        for p in (0.25, 0.5, 0.75):
            cap.set(cv2.CAP_PROP_POS_FRAMES, sh.start + int(p * sh.length))
            ok, img = cap.read()
            res_.append(cues(img))
        mid = np.median([r[0] for r in res_]); spike = np.median([r[1] for r in res_])
        print(f"{lab:2s} {spec:18s} mid {mid:.3f} spike {spike:.3f}  {res_[1][2]}")
