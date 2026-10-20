"""Detected hard cuts whose picture barely changes: diff (mean |Δgray| 0–255 at SMALL_SIZE),
ratio to the larger neighbour, unchanged-pixel share. All cached videos."""
import pickle, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402  (code path for unpickling)
lim = float(sys.argv[1]) if len(sys.argv) > 1 else 3.0
allc = {"orig": [], "t1": [], "reenc": []}
low = []
for cache, group in ((h.DATA / "fcache3", None), (h.DATA / "fcache_reenc", "reenc")):
    for p in sorted(cache.glob("*.pkl")):
        f, a = pickle.loads(p.read_bytes())
        g = group or ("t1" if p.stem.startswith("t1_") else "orig")
        n = len(f.diff)
        for s in f.shots[1:]:
            c = s.start
            if s.gradual or not 1 <= c < n - 1:
                continue
            d = f.diff[c]; nb = max(f.diff[c - 1], f.diff[c + 1])
            allc[g].append(d)
            if d < lim:
                low.append((g, p.stem, c, c / f.info.fps, d, d / (nb + 1e-6), f.stable[c], s.length))
for g, v in allc.items():
    v = np.array(v)
    print(f"{g:6s} hard cuts {len(v):5d} | diff < 1: {(v < 1).sum():3d}, < 2: {(v < 2).sum():3d}, < 3: {(v < 3).sum():3d}, < 5: {(v < 5).sum():3d} | 1st pct {np.percentile(v, 1):.1f}")
print()
for g, stem, c, t, d, r, st, L in sorted(low, key=lambda x: x[4]):
    print(f"  {g:6s} {stem[:44]:44s} frame {c:5d} t={t:7.2f} diff {d:5.2f} ×nb {r:5.2f} stable {st:.3f} shotlen {L}")
