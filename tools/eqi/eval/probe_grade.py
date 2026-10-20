import sys, numpy as np, glob, os
sys.path.insert(0, '.')
import h
from eqi.criteria import assess_color, grade_statistics, _continuous_spans, shot_weights
from eqi.features import Shot
from eqi import config
from skimage.color import deltaE_ciede2000
def gstats(f):
    fps = f.info.fps
    spans = [Shot(i, a, b, fps) for i, (a, b) in enumerate(_continuous_spans(f))]
    shots = [s for s in spans if s.length / fps >= config.KEYFRAME_MIN_SHOT_S] or spans
    lab = []
    for s in shots:
        lo, hi = (s.start + 2, s.end - 2) if s.length >= 5 else (s.start, s.end)
        lab.append(np.median(f.lab[lo:hi], axis=0))
    lab = np.array(lab)
    graded = [k for k in range(len(shots)) if lab[k][0] >= config.BLACK_SHOT_L]
    if len(graded) < 3: return None
    L = lab[graded]; lens = [shots[k].length for k in graded]
    ref, dev, thr = grade_statistics(L, lens)
    w = shot_weights(lens); w = w / w.sum()
    near = float(w[dev <= config.COLOR_JUMP_MIN_DE].sum())
    near2 = float(w[dev <= 2 * config.COLOR_JUMP_MIN_DE].sum())
    consec = np.array([float(deltaE_ciede2000(L[i], L[i + 1])) for i in range(len(L) - 1)])
    return dict(n=len(graded), thr=round(thr, 1), med_dev=round(float(np.median(dev)), 1), near4=round(near, 2), near8=round(near2, 2), consec_med=round(float(np.median(consec)), 1))
def run(name, label):
    fa = h.features(name)
    if fa is None: return
    f, a = fa
    A = assess_color(f)
    cj = [i for i in A.issues if i.kind == "color_jump"]
    g = [i for i in cj if "threshold" in i.detail]; t = [i for i in cj if "tint_shift_ab" in i.detail]
    print(f"{label:26s} grade-flags {len(g):2d} tint-flags {len(t):2d} {gstats(f)}")
for s in ("tiers", "market", "holdout"):
    base, res, prefix = h.SETS[s]
    for k in h.load_json(h.OUT / base / "key.json"):
        run(f"{prefix}__{k['id']}", f"{k['tier']:6s} {s}:{k['id']} {k.get('genre','')[:8]}")
for s in h.T1:
    for p in sorted(glob.glob(str(h.CACHE / f"t1_{s}__*color_jump_L*.pkl"))) + sorted(glob.glob(str(h.CACHE / f"t1_{s}__*clean.pkl"))):
        run(os.path.basename(p)[:-4], "t1 " + os.path.basename(p)[3:-4][-22:])
