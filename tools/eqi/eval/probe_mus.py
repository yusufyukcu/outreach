import sys, numpy as np, glob, os
sys.path.insert(0, '.')
import h
from eqi.criteria import _continuous_spans
for s in ("tiers", "market", "holdout"):
    base, res, prefix = h.SETS[s]
    for k in h.load_json(h.OUT / base / "key.json"):
        f, a = h.features(f"{prefix}__{k['id']}")
        sp = _continuous_spans(f); fps = f.info.fps
        lens = np.array([(b - a0) / fps for a0, b in sp])
        if a.music_driven:
            print(f"{k['tier']:6s} {s}:{k['id']} {k.get('genre','')[:12]:12s} pc {a.pulse_clarity:.2f} asl {lens.mean():5.2f} median {np.median(lens):5.2f} cuts/min {len(sp)/ (f.info.duration/60):5.1f} {k['title'][:40]}")
for s in h.T1:
    p = glob.glob(str(h.CACHE / f"t1_{s}__*clean.pkl"))[0]
    f, a = h.features(os.path.basename(p)[:-4]); sp = _continuous_spans(f)
    print("t1", s, a.music_driven, round(a.pulse_clarity, 2), round(np.mean([(b - a0) / f.info.fps for a0, b in sp]), 2))
