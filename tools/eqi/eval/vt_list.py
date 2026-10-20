import sys, os
sys.path.insert(0, '.')
import h
from eqi.videotype import classify
for s in ("tiers", "market", "holdout"):
    base, res, prefix = h.SETS[s]
    for k in h.load_json(h.OUT / base / "key.json"):
        fa = h.features(f"{prefix}__{k['id']}")
        if fa is None: print(s, k["id"], "MISSING"); continue
        f, a = fa
        vt = classify(f, a)
        ds = sorted(vt.designed_shots)
        print(f"{s:7s} {k['id']} {k['tier']:6s} {k.get('genre','')[:14]:14s} {vt.label:44s} designed {vt.designed_share:4.2f} ({len(ds)}/{len(f.shots)} shots) montage {vt.music_montage} faces {vt.face_share:.2f}  {k['title'][:34]}")
