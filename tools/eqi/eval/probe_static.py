import sys, numpy as np
sys.path.insert(0, '.')
import h
from eqi.criteria import _continuous_spans
from eqi import config
for s in ("tiers", "market", "holdout"):
    base, res, prefix = h.SETS[s]
    for k in h.load_json(h.OUT / base / "key.json"):
        fa = h.features(f"{prefix}__{k['id']}")
        if fa is None: continue
        f, a = fa; fps = f.info.fps
        for a0, b in _continuous_spans(f):
            if (b - a0) / fps < 15: continue
            d = f.diff[a0 + 1:b]; c1 = f.change_1s[a0 + int(fps) + 1:b]
            if not c1.size: continue
            print(f"{s:7s} {k['id']} {k['tier']:6s} {a0/fps:6.1f}-{b/fps:6.1f} ({(b-a0)/fps:5.1f}s) diff mean {d.mean():5.2f} med {np.median(d):5.2f} | change1s med {np.median(c1):5.2f} p25 {np.percentile(c1,25):5.2f} | {'STATIC(old)' if d.mean() < config.STATIC_DIFF and (b-a0)/fps >= 20 else ''}")
