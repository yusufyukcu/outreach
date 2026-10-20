"""K6 of the new runs (results dir, parts-based level and the model's overall level from
the same calls) against the stored runs of the earlier prompt: run-to-run spread and
tier separation, K6 alone and in EQI (K1–K5 from the working tree on the cache).
Usage: python k6_eval.py <results dir> [--show]"""
import argparse
import json
import statistics
import sys
from pathlib import Path

import numpy as np
from scipy import stats

SP = Path(__file__).parent
sys.path.insert(0, str(SP))
import h  # noqa: E402

NEW_SETS = {"tiers": "eval_tiers", "market": "eval_market", "holdout": "eval_holdout"}


def load(results):
    rows = []
    for s, (base, res_old, prefix) in h.SETS.items():
        for k in h.load_json(h.OUT / base / "key.json"):
            p = h.OUT / base / results / k["id"] / "report.json"
            if not p.exists():
                continue
            new = h.load_json(p)
            n = new["criteria"]["narrative"]
            if not n.get("levels"):
                continue
            old = h.stored(base, res_old, k["id"])["criteria"]["narrative"]
            rows.append({"set": s, "vid": k["id"], "tier": k["tier"], "title": k["title"], "genre": k.get("genre", ""),
                         "parts": n["levels"], "overall": n.get("overall_levels") or [], "old": old.get("levels") or [],
                         "source": n.get("level_source"), "eqi_new": new["eqi"]["full"], "sig": new["eqi"]["signal_only"],
                         "vt": (new.get("video_type") or {}).get("label"),
                         "both": [(p + o) / 2 for p, o in zip(n["levels"], n.get("overall_levels") or [])]})
    return rows


def spread(levels):
    return (max(levels) - min(levels)) if levels else float("nan"), float(np.std(levels)) if levels else float("nan")


def k6(levels):
    return (statistics.median(levels) - 1) / 4 * 100


def sep(rows, key):
    order = h.ORDER
    xs = [order[r["tier"]] for r in rows]
    ys = [r[key] for r in rows]
    rho = stats.spearmanr(xs, ys).statistic
    clean = [r for r in rows if r["tier"] != "broken"]
    rho_c = stats.spearmanr([order[r["tier"]] for r in clean], [r[key] for r in clean]).statistic
    tiers = {t: [r[key] for r in rows if r["tier"] == t] for t in order}
    med = {t: statistics.median(v) if v else float("nan") for t, v in tiers.items()}

    def win(a, b):
        pairs = [(x, y) for x in tiers[a] for y in tiers[b]]
        return sum(1.0 if x > y else 0.5 if x == y else 0.0 for x, y in pairs) / len(pairs) if pairs else float("nan")
    return med, rho, rho_c, {f"{a}>{b}": win(a, b) for a, b in (("pro", "mid"), ("mid", "bad"), ("pro", "bad"), ("bad", "broken"))}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("--show", action="store_true")
    args = ap.parse_args()
    rows = load(args.results)
    print(f"{len(rows)} videos with new runs; level from parts in {sum(r['source'] == 'parts' for r in rows)}")
    def icc1(mat):
        """One-way random ICC(1,1) and ICC(1,k) of a videos × runs matrix (Shrout & Fleiss 1979)."""
        mat = np.asarray(mat, float)
        n, k = mat.shape
        grand = mat.mean()
        msb = k * ((mat.mean(axis=1) - grand) ** 2).sum() / (n - 1)
        msw = ((mat - mat.mean(axis=1, keepdims=True)) ** 2).sum() / (n * (k - 1))
        return (msb - msw) / (msb + (k - 1) * msw), (msb - msw) / msb

    for label, key in (("parts (new, used)", "parts"), ("overall (new, same calls)", "overall"), ("mean of both", "both"), ("old prompt (stored)", "old")):
        rs = [spread(r[key]) for r in rows if len(r[key]) >= 2]
        rng = [a for a, _ in rs]
        three = [r[key][:3] for r in rows if len(r[key]) >= 3]
        single, of3 = icc1(three) if len(three) >= 3 else (float("nan"), float("nan"))
        print(f"  spread {label:26s} mean range {np.mean(rng):.2f} levels, mean SD {np.mean([b for _, b in rs]):.2f}, "
              f"range ≥ 1 level in {np.mean([x >= 1 for x in rng]):.0%}, ≥ 2 in {np.mean([x >= 2 for x in rng]):.0%} (n={len(rs)}) | "
              f"ICC(1,1) {single:.2f}, ICC(1,3) {of3:.2f}")
    for r in rows:
        r["k6_parts"], r["k6_overall"] = k6(r["parts"]), k6(r["overall"]) if r["overall"] else float("nan")
        r["k6_old"] = k6(r["old"]) if r["old"] else float("nan")
        r["k6_both"] = k6(r["both"]) if r["both"] else float("nan")
        base, _, prefix = h.SETS[r["set"]]
        rep = h.report_from_cache(f"{prefix}__{r['vid']}")
        r["sig_final"] = rep["eqi"]["signal_only"]
        for v in ("parts", "overall", "both", "old"):
            r[f"eqi_{v}"] = h.eqi_full(rep, r[f"k6_{v}"])
    for s in ("tiers", "market", "holdout", None):
        sub = [r for r in rows if s is None or r["set"] == s]
        if not sub:
            continue
        for key in ("k6_parts", "k6_overall", "k6_both", "k6_old", "sig_final", "eqi_parts", "eqi_overall", "eqi_both", "eqi_old"):
            med, rho, rho_c, win = sep(sub, key)
            print(f"  {s or 'ALL':7s} {key:10s} med " + "/".join(f"{med[t]:5.1f}" for t in h.ORDER) +
                  f" | ρ={rho:.2f} clean={rho_c:.2f} | " + " ".join(f"{k}={v:.2f}" for k, v in win.items()))
    if args.show:
        for r in sorted(rows, key=lambda r: (r["set"], -h.ORDER[r["tier"]], -r["eqi_new"])):
            print(f"   {r['set']:7s} {r['vid']} {r['tier']:6s} EQI {r['eqi_new']:5.1f} sig {r['sig']:5.1f} parts {r['parts']} overall {r['overall']} old {r['old']} "
                  f"{(r['vt'] or '')[:24]:24s} {r['title'][:36]}")
