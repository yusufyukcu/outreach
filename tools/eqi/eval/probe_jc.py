import sys, json, numpy as np, glob, os
sys.path.insert(0, '.')
import h
from eqi.criteria import assess_cuts, _robust_z
for s in h.T1:
    for p in sorted(glob.glob(str(h.CACHE / f"t1_{s}__*jump_cut_L*.pkl"))):
        name = os.path.basename(p)[:-4]
        f, a = h.features(name)
        stem = name.split("__", 1)[1]
        truth = json.load(open(h.OUT / f"tier1v2_{s}" / "videos" / f"{stem}.truth.json", encoding="utf-8"))
        ev = truth["events"][0] if "events" in truth else truth
        t = ev.get("t", ev.get("time"))
        fps = f.info.fps
        fr = int(round(t * fps))
        cut = [sh.start for sh in f.shots if abs(sh.start - fr) <= 2]
        A = assess_cuts(f)
        jc = [i for i in A.issues if i.kind == "jump_cut" and abs(i.t - t) < 0.5]
        k = cut[0] if cut else fr
        print(f"{s:9s} {stem[-12:]:12s} t={t:6.2f} detected_as_cut={bool(cut)} stable={f.stable[k]:.3f} diff={f.diff[k]:.1f} motion={np.linalg.norm(f.motion[k-3]):.2f} conf={f.motion_conf[k]:.2f} jump_cut_found={bool(jc)}")
