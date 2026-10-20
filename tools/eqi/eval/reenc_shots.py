import pickle, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa
SETS = {"h": "holdout", "m": "eval_market", "v": "eval_tiers"}
for name in sys.argv[1:]:
    vid, variant = name.split("__")
    fo, _ = h.features(f"{SETS[vid[0]]}__{vid}")
    fr, _ = pickle.loads((h.DATA / "fcache_reenc" / f"{name}.pkl").read_bytes())
    print(vid, "fps", fo.info.fps, fr.info.fps, "frames", len(fo.diff), len(fr.diff), "size", fo.info.width, fo.info.height, "→", fr.info.width, fr.info.height)
    co = [s.start for s in fo.shots[1:]]; cr = [s.start for s in fr.shots[1:]]
    for lab, f, cuts, other in (("orig", fo, co, cr), (variant, fr, cr, co)):
        print(f"  {lab}: {len(cuts)} cuts")
        for c in cuts:
            near = min((abs(c - o) for o in other), default=999)
            win = f.diff[max(0, c - 3):c + 4]
            print(f"    {'   ' if near <= 2 else 'NEW'} frame {c:5d} t={c / f.info.fps:6.2f} diff {f.diff[c]:6.2f} stable {f.stable[c]:.3f} "
                  f"gradual {next(s.gradual for s in f.shots if s.start == c)} | window {np.round(win, 1).tolist()}")
