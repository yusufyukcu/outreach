"""All 88 tier-set videos with the structured K6 (runs of 12 and 13 October) and the
final code: tier separation per set, against the rules of 10 October and the rules of
12 October with the earlier K6 (paired bootstrap), K6 alone, and run-to-run ICC.
Usage: python final_eval.py   (reads the final reports; needs no feature cache)"""
import json, os, statistics, sys
from pathlib import Path
import numpy as np
from scipy import stats
NSP = Path(__file__).parent
sys.path.insert(0, str(NSP))
import h  # noqa: E402
ORDER = h.ORDER

def run_levels(rep):
    """The model's overall level of every run: 12 October runs keep it in overall_levels."""
    n = rep["criteria"]["narrative"]
    return n.get("overall_levels") if "overall_levels" in n else n.get("levels")

def k6(levels):
    return (statistics.median(levels) - 1) / 4 * 100

rows = []
for s, (base, res_old, prefix) in h.SETS.items():
    for k in h.load_json(h.OUT / base / "key.json"):
        fin = h.OUT / base / "results_v8_final" / k["id"] / "report.json"
        run = h.OUT / base / "results_v8" / k["id"] / "report.json"
        if not fin.exists():
            print("missing final report", s, k["id"]); continue
        f, r = h.load_json(fin), h.load_json(run)
        old = h.stored(base, res_old, k["id"])["criteria"]["narrative"].get("levels") or []
        rows.append({"set": s, "vid": k["id"], "tier": k["tier"], "eqi": f["eqi"]["full"], "sig": f["eqi"]["signal_only"],
                     "k6": f["criteria"]["narrative"]["score"], "levels": run_levels(r), "old_levels": old,
                     "k6_old": k6(old) if old else float("nan"), "vt": (f.get("video_type") or {}).get("label"),
                     "day": "12 Oct" if "overall_levels" in r["criteria"]["narrative"] else "13 Oct",
                     "model": sorted(set(r["ai"]["run_models"]))})
print(len(rows), "videos;", sum(r["day"] == "12 Oct" for r in rows), "with 12 Oct runs,", sum(r["day"] == "13 Oct" for r in rows),
      "with 13 Oct runs; models", sorted({m for r in rows for m in r["model"]}))
print("runs per video:", {n: sum(len(r["levels"]) == n for r in rows) for n in (1, 2, 3)})
assert all(abs(r["k6"] - k6(r["levels"])) < 0.06 for r in rows), "K6 in the final report is not the median overall level"

new = {f"{r['set']}/{r['vid']}": {"tier": r["tier"], "eqi": r["eqi"], "sig": r["sig"], "k6": r["k6"], "k6_old": r["k6_old"]} for r in rows}
h.DATA.mkdir(parents=True, exist_ok=True)
(h.DATA / "final_new.json").write_text(json.dumps(new, indent=0), encoding="utf-8")
base10 = json.loads((NSP / "ref" / "dev_base_A.json").read_text())       # rules of 10 October, earlier K6
rules12 = json.loads((NSP / "ref" / "dev_rules12_oldk6.json").read_text())  # rules of 12 October (final code), earlier K6

def sep(ids, d, key):
    xs = [ORDER[d[i]["tier"]] for i in ids]; ys = [d[i][key] for i in ids]
    clean = [i for i in ids if d[i]["tier"] != "broken"]
    tiers = {t: [d[i][key] for i in ids if d[i]["tier"] == t] for t in ORDER}
    def win(a, b):
        p = [(x, y) for x in tiers[a] for y in tiers[b]]
        return sum(1.0 if x > y else 0.5 if x == y else 0.0 for x, y in p) / len(p) if p else float("nan")
    return ({t: statistics.median(v) if v else float("nan") for t, v in tiers.items()},
            stats.spearmanr(xs, ys).statistic,
            stats.spearmanr([ORDER[d[i]["tier"]] for i in clean], [d[i][key] for i in clean]).statistic,
            {f"{a}>{b}": win(a, b) for a, b in (("pro", "mid"), ("mid", "bad"), ("pro", "bad"), ("bad", "broken"))})

def boot(ids, a, b, key_a="eqi", key_b="eqi", clean=False, n=4000):
    ids = [i for i in ids if not (clean and a[i]["tier"] == "broken")]
    def rho(sel, d, key):
        return stats.spearmanr([ORDER[d[i]["tier"]] for i in sel], [d[i][key] for i in sel]).statistic
    by = {}
    for i in ids: by.setdefault(a[i]["tier"], []).append(i)
    rng = np.random.default_rng(1)
    diffs = []
    for _ in range(n):
        sel = [x for ks in by.values() for x in rng.choice(ks, len(ks), replace=True)]
        diffs.append(rho(sel, a, key_a) - rho(sel, b, key_b))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return rho(ids, a, key_a) - rho(ids, b, key_b), lo, hi

def fmt(med, rho, rc, win=None):
    return "/".join(f"{med[t]:4.1f}" for t in ORDER) + f" ρ {rho:.2f} clean {rc:.2f}" + (" | " + " ".join(f"{k} {v:.2f}" for k, v in win.items()) if win else "")

for s in ("tiers", "market", "holdout", None):
    ids = [i for i in new if s is None or i.startswith(s + "/")]
    print(f"\n== {s or 'ALL 88'} (n={len(ids)})")
    for label, d, key in (("10 Oct rules + earlier K6", base10, "eqi"), ("12 Oct rules + earlier K6", rules12, "eqi"),
                          ("12 Oct rules + structured K6", new, "eqi"), ("K1–K5 only (EQI_signal)", new, "sig"),
                          ("K6 alone, earlier", new, "k6_old"), ("K6 alone, structured", new, "k6")):
        med, rho, rc, win = sep(ids, d, key)
        print(f"  {label:30s} {fmt(med, rho, rc, win)}")
    for clean in (False, True):
        for label, b in (("vs 10 Oct", base10), ("vs 12 Oct rules + earlier K6", rules12)):
            dlt, lo, hi = boot(ids, new, b, clean=clean)
            print(f"  Δρ{' clean' if clean else '      '} {label:30s} {dlt:+.2f} (95% CI {lo:+.2f} to {hi:+.2f})")
    dlt, lo, hi = boot([i for i in ids if new[i]["tier"] != "broken"], new, new, "k6", "k6_old")
    print(f"  Δρ clean K6 alone structured vs earlier   {dlt:+.2f} (95% CI {lo:+.2f} to {hi:+.2f})")

def icc1(mat):
    mat = np.asarray(mat, float); n, k = mat.shape; g = mat.mean()
    msb = k * ((mat.mean(1) - g) ** 2).sum() / (n - 1); msw = ((mat - mat.mean(1, keepdims=True)) ** 2).sum() / (n * (k - 1))
    return (msb - msw) / (msb + (k - 1) * msw), (msb - msw) / msb

print("\n== K6 run-to-run reliability, ICC(1,1) / ICC(1,3) over three runs")
for s in ("tiers", "market", "holdout", None):
    sub = [r for r in rows if s is None or r["set"] == s]
    for label, key in (("structured", "levels"), ("earlier", "old_levels")):
        three = [r[key][:3] for r in sub if len(r[key] or []) >= 3]
        a, b = icc1(three)
        rng_ = [max(x) - min(x) for x in three]
        print(f"  {s or 'ALL':8s} {label:10s} n={len(three):2d} ICC(1,1) {a:.2f} ICC(1,3) {b:.2f} | runs ≥1 level apart {np.mean([x >= 1 for x in rng_]):.0%}, ≥2 {np.mean([x >= 2 for x in rng_]):.0%}")
for day in ("12 Oct", "13 Oct"):
    three = [r["levels"][:3] for r in rows if r["day"] == day and len(r["levels"]) >= 3]
    a, b = icc1(three)
    print(f"  runs of {day}: n={len(three)} ICC(1,1) {a:.2f}")
print("\n== K6 level medians by tier (structured / earlier)")
for t in ORDER:
    sub = [r for r in rows if r["tier"] == t]
    print(f"  {t:6s} n={len(sub):2d} structured median level {statistics.median([statistics.median(r['levels']) for r in sub]):.1f}"
          f" | earlier {statistics.median([statistics.median(r['old_levels']) for r in sub if r['old_levels']]):.1f}")
