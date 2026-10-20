"""Paired bootstrap of Spearman rho (tier order vs score) between two scorings of the same videos,
videos resampled within tiers (4000 resamples)."""
import json, sys
import numpy as np
from scipy import stats
ORDER = {"pro": 3, "mid": 2, "bad": 1, "broken": 0}
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
key = sys.argv[3] if len(sys.argv) > 3 else "eqi"
filt = sys.argv[4] if len(sys.argv) > 4 else ""
ids = [k for k in a if k in b and (not filt or k.startswith(filt))]
def rho(sel, d, clean=False):
    s = [k for k in sel if not (clean and d[k]["tier"] == "broken")]
    return stats.spearmanr([ORDER[d[k]["tier"]] for k in s], [d[k][key] for k in s]).statistic
rng = np.random.default_rng(1)
by = {}
for k in ids: by.setdefault(a[k]["tier"], []).append(k)
for clean in (False, True):
    base = rho(ids, b, clean); new = rho(ids, a, clean)
    diffs = []
    for _ in range(4000):
        sel = [x for t, ks in by.items() for x in rng.choice(ks, len(ks), replace=True)]
        diffs.append(rho(sel, a, clean) - rho(sel, b, clean))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    print(f"{'clean' if clean else 'all  '} n={len([k for k in ids if not (clean and a[k]['tier']=='broken')])} rho {base:.2f} -> {new:.2f}  diff {new-base:+.2f} (95% CI {lo:+.2f} to {hi:+.2f})")
