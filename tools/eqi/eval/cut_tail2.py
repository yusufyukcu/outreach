import pickle, sys
from collections import Counter
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402  (code path for unpickling)
from eqi.criteria import assess_all
lim = float(sys.argv[1])
cnt, tot, info = Counter(), Counter(), {}
for cache in (h.DATA / "fcache3", h.DATA / "fcache_reenc"):
    for p in sorted(cache.glob("*.pkl")):
        f, a = pickle.loads(p.read_bytes())
        n = len(f.diff)
        hard = [s for s in f.shots[1:] if not s.gradual and 1 <= s.start < n - 1]
        tot[p.stem] = len(hard)
        low = [s for s in hard if f.diff[s.start] < lim]
        if low:
            cnt[p.stem] = len(low)
            info[p.stem] = [(round(s.start / f.info.fps, 2), round(f.diff[s.start], 2), round(float(f.stable[s.start]), 3) if not np.isnan(f.stable[s.start]) else None) for s in low[:6]]
for stem, c in sorted(cnt.items()):
    if stem.startswith("t1_") and not stem.endswith("__clean") and "L3" not in stem:
        continue
    print(f"{stem[:60]:60s} {c:3d}/{tot[stem]:3d} low cuts  e.g. {info[stem][:4]}")
