"""Day-to-day drift of the structured K6: the same 15 videos (same model, prompt and
inputs) reviewed on 12 October (results_v8) and again on 13 October (results_v8_day2),
three runs each. Usage: python drift_eval.py   (EQI_CACHE = fcache3)"""
import statistics, sys
from pathlib import Path
import numpy as np
from scipy import stats
NSP = Path(__file__).parent
sys.path.insert(0, str(NSP))
import h  # noqa: E402

def levels(rep):
    n = rep["criteria"]["narrative"]
    return n.get("overall_levels") if "overall_levels" in n else n.get("levels")

def parts(rep):
    n = rep["criteria"]["narrative"]
    return n.get("levels") if "overall_levels" in n else n.get("parts_levels")

def k6(lv):
    return (statistics.median(lv) - 1) / 4 * 100

specs = (NSP / "ref" / "drift_specs.txt").read_text(encoding="utf-8").split()
keys = {s: {k["id"]: k for k in h.load_json(h.OUT / b / "key.json")} for s, (b, _, _) in h.SETS.items()}
rows = []
for spec in specs:
    s, vid = spec.split(":")
    base, _, prefix = h.SETS[s]
    p2 = h.OUT / base / "results_v8_day2" / vid / "report.json"
    if not p2.exists():
        print("no day-2 report", spec); continue
    d1, d2 = h.load_json(h.OUT / base / "results_v8" / vid / "report.json"), h.load_json(p2)
    if not d2.get("ai"):
        print("day-2 run failed", spec, d2.get("ai_error", "")[:80]); continue
    l1, l2 = levels(d1), levels(d2)
    rep = h.report_from_cache(f"{prefix}__{vid}")
    rows.append({"spec": spec, "tier": keys[s][vid]["tier"], "l1": l1, "l2": l2, "m1": statistics.median(l1), "m2": statistics.median(l2),
                 "p1": parts(d1), "p2": parts(d2), "e1": h.eqi_full(rep, k6(l1)), "e2": h.eqi_full(rep, k6(l2)),
                 "models": sorted(set(d1["ai"]["run_models"] + d2["ai"]["run_models"]))})
print(f"{len(rows)} videos with both days; models {sorted({m for r in rows for m in r['models']})}")
for r in rows:
    print(f"  {r['spec']:13s} {r['tier']:4s} 12 Oct {r['l1']} → 13 Oct {r['l2']}  median {r['m1']:.1f} → {r['m2']:.1f}  EQI {r['e1']:5.1f} → {r['e2']:5.1f}")
d = np.array([r["m2"] - r["m1"] for r in rows])
rng = np.random.default_rng(1)

def ci(x):
    if len(x) < 2:
        return float("nan"), float("nan")
    b = [rng.choice(x, len(x), replace=True).mean() for _ in range(4000)]
    return tuple(np.percentile(b, [2.5, 97.5]))

print(f"\nshift of the median level (13 − 12 Oct): mean {d.mean():+.2f} (95% CI {ci(d)[0]:+.2f} to {ci(d)[1]:+.2f}),"
      f" same median in {np.mean(d == 0):.0%}, |shift| ≥ 1 in {np.mean(abs(d) >= 1):.0%}")
nz = d[d != 0]
if len(nz):
    print(f"  Wilcoxon signed-rank p = {stats.wilcoxon(d).pvalue:.2f} ({(d > 0).sum()} up, {(d < 0).sum()} down, {(d == 0).sum()} same)")
for t in ("pro", "mid", "bad"):
    x = np.array([r["m2"] - r["m1"] for r in rows if r["tier"] == t])
    lo, hi = ci(x)
    print(f"  {t:4s} n={len(x)} mean shift {x.mean():+.2f} (95% CI {lo:+.2f} to {hi:+.2f})")
all_runs = [np.mean(r["l2"]) - np.mean(r["l1"]) for r in rows]
print(f"shift of the run mean: {np.mean(all_runs):+.2f} levels")

def icc1(mat):
    mat = np.asarray(mat, float); n, k = mat.shape; g = mat.mean()
    msb = k * ((mat.mean(1) - g) ** 2).sum() / (n - 1); msw = ((mat - mat.mean(1, keepdims=True)) ** 2).sum() / (n * (k - 1))
    return (msb - msw) / (msb + (k - 1) * msw)

def icc2(mat):
    """Two-way random, absolute agreement, single rater: ICC(2,1) (Shrout & Fleiss 1979)."""
    x = np.asarray(mat, float); n, k = x.shape; g = x.mean()
    msr = k * ((x.mean(1) - g) ** 2).sum() / (n - 1); msc = n * ((x.mean(0) - g) ** 2).sum() / (k - 1)
    sse = ((x - x.mean(1, keepdims=True) - x.mean(0, keepdims=True) + g) ** 2).sum(); mse = sse / ((n - 1) * (k - 1))
    return (msr - mse) / (msr + (k - 1) * mse + k * (msc - mse) / n)

three = [r for r in rows if len(r["l1"]) == 3 and len(r["l2"]) == 3]
print(f"\nICC(1,1), single run: within 12 Oct {icc1([r['l1'] for r in three]):.2f}, within 13 Oct {icc1([r['l2'] for r in three]):.2f},"
      f" all six runs of both days {icc1([r['l1'] + r['l2'] for r in three]):.2f} (n={len(three)})")
print(f"ICC(2,1) absolute agreement of the two days' medians: {icc2([[r['m1'], r['m2']] for r in rows]):.2f}")
pp = [r for r in rows if r["p1"] and r["p2"]]
if pp:
    dp = np.array([statistics.median(r["p2"]) - statistics.median(r["p1"]) for r in pp])
    print(f"level from the parts (reported only): mean shift {dp.mean():+.2f}, ICC(2,1) of medians "
          f"{icc2([[statistics.median(r['p1']), statistics.median(r['p2'])] for r in pp]):.2f}")
de = np.array([r["e2"] - r["e1"] for r in rows])
print(f"EQI change from the day: median |Δ| {np.median(abs(de)):.1f}, mean Δ {de.mean():+.1f}, max |Δ| {abs(de).max():.1f} points")
o = h.ORDER
for lab, key in (("12 Oct K6", "e1"), ("13 Oct K6", "e2")):
    print(f"  ρ(tier, EQI) on these {len(rows)} with {lab}: {stats.spearmanr([o[r['tier']] for r in rows], [r[key] for r in rows]).statistic:.2f}")
