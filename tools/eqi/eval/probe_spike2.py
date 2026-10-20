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
    res = {"mid": 0.0, "white": 0.0, "black": 0.0}
    rs = {"mid": [], "white": [], "black": []}
    for c in np.argsort(cnt)[::-1][:5]:
        v = int(vals[c]); rgb = np.array([v >> 16 & 255, v >> 8 & 255, v & 255], np.int16)
        L = 0.114 * rgb[0] + 0.587 * rgb[1] + 0.299 * rgb[2]
        tone = "black" if L <= 20 else "white" if L >= 235 else "mid"
        d = np.abs(flat - rgb).max(axis=1)
        exact = int(cnt[c]); near = int(((d > 0) & (d <= 2)).sum())
        r = near / max(exact, 1)
        rs[tone].append((round(exact / n, 3), round(r, 2)))
        if r <= 0.6: res[tone] += exact / n
    return res, rs

specs = {"Dw": ["holdout:h25:0", "holdout:h25:1", "holdout:h25:2", "holdout:h25:3", "holdout:h25:4", "tiers:v16:0", "holdout:h21:1", "market:m26:18", "market:m26:19", "holdout:h29:0", "holdout:h10:8", "holdout:h23:12", "tiers:v18:5"],
         "Cw": ["tiers:v19:1", "holdout:h12:15", "holdout:h12:2", "holdout:h12:5", "market:m05:8", "holdout:h03:23", "holdout:h03:62"],
         "Db": ["holdout:h21:2", "market:m18:31", "tiers:v09:0", "holdout:h27:0", "holdout:h10:1"],
         "Cb": ["market:m26:14", "market:m05:17", "holdout:h29:14", "market:m05:6", "holdout:h03:19", "holdout:h02:6", "tiers:v19:14", "holdout:h12:28"]}
caps = {}
for lab, lst in specs.items():
    for spec in lst:
        s, vid, i = spec.split(":"); i = int(i)
        base, res_, prefix = h.SETS[s]
        f, a = h.features(f"{prefix}__{vid}")
        key = s + vid
        if key not in caps: caps[key] = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
        sh = f.shots[i]
        caps[key].set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
        ok, img = caps[key].read()
        r, rs = cues(img)
        print(f"{lab:2s} {spec:17s} spike mid {r['mid']:.3f} white {r['white']:.3f} black {r['black']:.3f} | white {rs['white']} black {rs['black']}")
