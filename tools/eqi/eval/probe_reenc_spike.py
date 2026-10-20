import sys, pickle, numpy as np
sys.path.insert(0, '.')
import h
from eqi.videotype import classify
for vid, prefix in (("h23", "holdout"), ("h24", "holdout"), ("h02", "holdout"), ("h21", "holdout"), ("h25", "holdout"), ("h28", "holdout")):
    f0, a0 = h.features(f"{prefix}__{vid}")
    vs = {"orig": (f0, a0)}
    for var in ("720crf30", "480crf28"):
        vs[var] = pickle.loads((h.DATA / "fcache_reenc" / f"{vid}__{var}.pkl").read_bytes())
    print("==", vid)
    keys = {name: {k.shot: k for k in f.keyframes} for name, (f, a) in vs.items()}
    vts = {name: classify(f, a) for name, (f, a) in vs.items()}
    for s in f0.shots:
        if s.length < 12: continue
        row = []
        for name in vs:
            k = keys[name].get(s.index)
            if k is None: row.append("   -   "); continue
            row.append(f"{'D' if vts[name].shot_designed(s.index) else 'c'} m{k.fill_mid:.2f} w{k.fill_white:.2f} b{k.fill_black:.2f} wr{(k.white_rolloff if k.white_rolloff is not None else -1):.2f}")
        print(f"  shot {s.index:3d} {s.t0:6.1f}s  " + " | ".join(row))
