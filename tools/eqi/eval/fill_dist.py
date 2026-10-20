import sys, numpy as np, glob, os, pickle
sys.path.insert(0, '.')
import h
vals = []
for p in sorted(glob.glob(str(h.CACHE / "*.pkl"))):
    name = os.path.basename(p)[:-4]
    if name.startswith("t1_") and not name.endswith("__clean"): continue
    f, a = h.features(name)
    for k in f.keyframes:
        s = f.shots[k.shot]
        vals.append((k.fill_mid, name, k.shot, round(s.t0, 1), s.length))
v = np.array([x[0] for x in vals])
print("keyframes", len(v), "zero", np.mean(v == 0).round(3))
for lo, hi in ((0, 0.01), (0.01, 0.03), (0.03, 0.05), (0.05, 0.08), (0.08, 0.12), (0.12, 0.15), (0.15, 0.3), (0.3, 1.01)):
    print(f"  [{lo:.2f},{hi:.2f}) {np.sum((v >= lo) & (v < hi))}")
mids = sorted([x for x in vals if 0.02 <= x[0] < 0.15], key=lambda x: -x[0])
for x in mids[:60]: print("  ", round(x[0], 3), x[1], "shot", x[2], "t", x[3], "len", x[4])
pickle.dump(mids, open(h.DATA / "fill_mid_band.pkl", "wb"))
