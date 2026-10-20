"""Exposure / white-balance shifts inside shots: the light level of the whole picture
moving one way while the content stays (static-ish camera)."""
import sys, numpy as np, collections
sys.path.insert(0, '.')
import h
from eqi import config
def events(f, a):
    fps = f.info.fps
    out = []
    for s in f.shots:
        lo, hi = s.start + 2, s.end - 2
        if (hi - lo) / fps < 1.5: continue
        dl = np.diff(f.luma[lo - 1:hi])   # step into frame lo..hi-1
        d = f.diff[lo:hi]
        oneway = np.abs(dl) >= 0.85 * np.maximum(d, 1e-6)
        # lighting-only luma change, accumulated over 1 s windows
        light = np.where(oneway, dl, 0.0)
        w = max(1, round(fps))
        cum = np.convolve(light, np.ones(w), mode="valid")
        content = np.convolve(d, np.ones(w), mode="valid")
        # an exposure shift: >= X gray levels of uniform change within 1 s, and the uniform part dominates
        idx = np.flatnonzero((np.abs(cum) >= 6.0) & (np.abs(cum) >= 0.6 * content))
        last = -10 * w
        for j in idx:
            if j - last < w: continue
            last = j
            out.append((round((lo + j) / fps, 1), round(float(cum[j]), 1), round(float(content[j]), 1)))
    return out
for s in ("tiers", "market", "holdout"):
    base, res, prefix = h.SETS[s]
    rows = []
    for k in h.load_json(h.OUT / base / "key.json"):
        f, a = h.features(f"{prefix}__{k['id']}")
        ev = events(f, a)
        rows.append((k["tier"], k["id"], len(ev), f.info.duration / 60, ev[:6], k.get("genre", "")[:12]))
    for t in ("pro", "mid", "bad", "broken"):
        for r in [r for r in rows if r[0] == t]:
            print(f"{s:7s} {r[0]:6s} {r[1]} n={r[2]:2d} per-min={r[2]/r[3]:4.1f} {r[5]:12s} {r[4]}")
