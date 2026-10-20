import sys, numpy as np, glob, os
sys.path.insert(0, '.')
import h
from eqi.criteria import assess_cuts, _continuous_spans
def show(name, label):
    fa = h.features(name)
    if fa is None: return
    f, a = fa
    A = assess_cuts(f)
    fps = f.info.fps
    fl = [i for i in A.issues if i.kind == "flash_frame"]
    lens = np.array([s.length for s in f.shots]) / fps
    n = len(f.shots)
    short = np.mean(lens < 0.5) if n else 0
    vshort = np.sum([s.length <= 6 for s in f.shots])
    beats = a.beats if a.has_audio else np.array([])
    print(f"{label:24s} shots {n:3d} median len {np.median(lens):5.2f}s  <0.5s share {short:.2f} (<=6fr: {vshort}) music {a.music_driven} pc {a.pulse_clarity:.2f} flashes {len(fl)}")
    for i in fl:
        nb = np.min(np.abs(beats - i.t)) if beats.size else np.nan
        k = next(j for j, s in enumerate(f.shots) if abs(s.t0 - i.t) < 1e-3)
        prev_len, next_len = f.shots[k-1].length, f.shots[k+1].length if k + 1 < n else -1
        L_in = f.lab[f.shots[k].start:f.shots[k].end, 0].mean(); L_prev = f.lab[f.shots[k].start - 1, 0]; L_next = f.lab[f.shots[k].end, 0] if f.shots[k].end < len(f.lab) else np.nan
        print(f"      t={i.t:6.2f} frames {i.detail['frames']} nearest beat {nb*1000:5.0f} ms  neighbours {prev_len}/{next_len} fr  L* prev {L_prev:5.1f} flash {L_in:5.1f} next {L_next:5.1f}")
for spec in ["holdout:h03", "holdout:h15", "holdout:h27", "holdout:h31", "holdout:h18", "market:m04", "market:m16", "market:m28", "market:m29", "market:m26", "holdout:h06", "holdout:h19", "holdout:h32", "tiers:v01", "tiers:v21", "market:m08", "market:m13", "market:m17", "market:m19", "tiers:v09"]:
    s, v = spec.split(":")
    show(f"{h.SETS[s][2]}__{v}", spec)
for s in h.T1:
    for p in sorted(glob.glob(str(h.CACHE / f"t1_{s}__*flash_frame_L*.pkl"))):
        show(os.path.basename(p)[:-4], "t1 " + os.path.basename(p)[3:-4][-14:])
