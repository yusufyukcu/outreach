import sys, numpy as np
sys.path.insert(0, '.')
import h
from eqi.videotype import classify
def peaks(c, fps, thr, gap_s=1.0):
    idx = []
    gap = int(gap_s * fps)
    order = np.argsort(c)[::-1]
    for i in order:
        if c[i] < thr: break
        if all(abs(i - j) > gap for j in idx): idx.append(int(i))
    return sorted(idx)
for spec in sys.argv[1:]:
    s, vid = spec.split(":")
    base, res, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}"); fps = f.info.fps
    vt = classify(f, a)
    for sh in f.shots:
        if sh.length / fps < 8: continue
        c = f.change_1s[sh.start + int(fps):sh.end]
        tag = "D" if vt.shot_designed(sh.index) else "C"
        out = []
        for thr in (15, 20, 30):
            p = peaks(c, fps, thr)
            out.append(f"thr{thr}: {len(p)}")
        print(f"{spec:14s} {tag} shot {sh.index} {sh.t0:6.1f}-{sh.t1:6.1f} max {c.max():5.1f} p95 {np.percentile(c,95):5.1f} | " + " ".join(out))
