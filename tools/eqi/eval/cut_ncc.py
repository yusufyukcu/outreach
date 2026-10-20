import pickle, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402  (code path for unpickling)
lim = float(sys.argv[1])
names = sys.argv[2:]
rows = []
for cache in (h.DATA / "fcache3", h.DATA / "fcache_reenc"):
    for p in sorted(cache.glob("*.pkl")):
        if names and not any(n in p.stem for n in names):
            continue
        f, a = pickle.loads(p.read_bytes())
        n = len(f.diff)
        for s in f.shots[1:]:
            c = s.start
            if s.gradual or not 2 <= c < n - 2:
                continue
            nb_ncc = min(f.ncc[c - 1], f.ncc[c + 1])
            rows.append((p.stem, c / f.info.fps, f.diff[c], f.ncc[c], nb_ncc, f.stable[c], f.luma[c], f.change_1s[c] if len(f.change_1s) else np.nan))
low = [r for r in rows if r[2] < lim]
print(f"{len(rows)} hard cuts, {len(low)} with diff < {lim}")
for r in sorted(low, key=lambda r: r[3]):
    print(f"  {r[0][:52]:52s} t={r[1]:7.2f} diff {r[2]:5.2f} ncc {r[3]:.4f} (neighbours ≥{r[4]:.4f}) stable {r[5]:.3f} luma {r[6]:5.1f}")
ncc_all = np.array([r[3] for r in rows if r[2] >= 5])
print("ncc at ordinary cuts (diff ≥ 5): pct 50/90/99/max", np.round(np.percentile(ncc_all, [50, 90, 99, 100]), 4))
