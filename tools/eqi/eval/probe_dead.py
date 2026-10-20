import sys, numpy as np
sys.path.insert(0, '.')
import h
from eqi.criteria import assess_pacing
def show(name, label):
    fa = h.features(name)
    if fa is None: print("no", name); return
    f, a = fa
    A = assess_pacing(f, a)
    fps = f.info.fps
    ref = np.percentile(a.rms_db, 90)
    for i in A.issues:
        if i.kind != "dead_air": continue
        m = (a.rms_times >= i.t) & (a.rms_times < i.t_end)
        lv = a.rms_db[m]
        d = f.diff[int(i.t * fps) + 1:int(i.t_end * fps)]
        print(f"{label:22s} {i.t:6.1f}-{i.t_end:6.1f} ({i.t_end-i.t:4.1f}s) sev {i.severity:.2f} rms med {np.median(lv):6.1f} max {lv.max():6.1f} dBFS (ref90 {ref:5.1f}) diff med {np.median(d):.3f} p90 {np.percentile(d,90):.3f} frozen {np.mean(d < 0.05):.2f}")
for s, vids in (("holdout", ["h24", "h25", "h28", "h10", "h21", "h13", "h26", "h06", "h19", "h32", "h07", "h08", "h09"]), ("tiers", ["v17", "v04", "v12", "v22", "v01", "v21"]), ("market", ["m15", "m09", "m01", "m08", "m13", "m17", "m25", "m06"])):
    base, res, prefix = h.SETS[s]
    for v in vids:
        show(f"{prefix}__{v}", f"{s}:{v}")
for s in h.T1:
    import glob, os
    for p in sorted(glob.glob(str(h.CACHE / f"t1_{s}__*dead_air_L3.pkl"))):
        show(os.path.basename(p)[:-4], f"t1 {s} L3")
