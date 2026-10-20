"""K6 run-to-run ICC(1,1) of the earlier prompt, the structured prompt's overall level
(used) and its parts level (reported), on the same videos (three runs of each)."""
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa
def icc1(mat):
    mat = np.asarray(mat, float); n, k = mat.shape; g = mat.mean()
    msb = k * ((mat.mean(1) - g) ** 2).sum() / (n - 1); msw = ((mat - mat.mean(1, keepdims=True)) ** 2).sum() / (n * (k - 1))
    return (msb - msw) / (msb + (k - 1) * msw)
rows = []
for s, (base, res_old, prefix) in h.SETS.items():
    for k in h.load_json(h.OUT / base / "key.json"):
        n = h.load_json(h.OUT / base / "results_v8" / k["id"] / "report.json")["criteria"]["narrative"]
        overall = n["overall_levels"] if "overall_levels" in n else n["levels"]
        parts = n["levels"] if "overall_levels" in n else n.get("parts_levels") or []
        old = h.stored(base, res_old, k["id"])["criteria"]["narrative"].get("levels") or []
        rows.append((s, overall, parts, old))
for s in ("tiers", "market", "holdout", None):
    sub = [r for r in rows if (s is None or r[0] == s) and len(r[1]) >= 3 and len(r[2]) >= 3 and len(r[3]) >= 3]
    print(f"{s or 'ALL':8s} n={len(sub):2d}  earlier {icc1([r[3][:3] for r in sub]):.2f}  structured overall {icc1([r[1][:3] for r in sub]):.2f}  parts {icc1([r[2][:3] for r in sub]):.2f}")
