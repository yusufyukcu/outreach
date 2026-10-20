"""Evaluate the working-tree criteria on cached features of all three tier sets (K6 = median
of the three stored runs) and Tier 1. Nothing is decoded, Gemini is not called.
Usage: python h.py [--show] [--tier1] [--verbose] [--sets tiers,market,holdout] [--save name]

The other scripts here import it. DATA (out/eval_data, or EQI_EVAL_DATA) holds the feature
caches, the re-encodes and the outputs; EQI_CACHE names the cache in DATA (default
fcache_tn2) or gives its path; EQI_CODE is another code tree (default: tools/eqi)."""
import argparse
import json
import os
import pickle
import statistics
import sys
from itertools import product
from pathlib import Path

from scipy import stats

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
EQI = Path(__file__).resolve().parents[1]
OUT = EQI / "out"
SP = Path(__file__).parent
DATA = Path(os.environ.get("EQI_EVAL_DATA", OUT / "eval_data"))


def data_path(p):
    """p inside DATA, unless it is an absolute path."""
    p = Path(p)
    return p if p.is_absolute() else DATA / p


CACHE = data_path(os.environ.get("EQI_CACHE", "fcache_tn2"))
sys.path.insert(0, os.environ.get("EQI_CODE", str(EQI)))

ORDER = {"pro": 3, "mid": 2, "bad": 1, "broken": 0}
SETS = {"tiers": ("eval_tiers", "results_v7", "eval_tiers"), "market": ("eval_market", "results_v7", "eval_market"),
        "holdout": ("eval_holdout", "results", "holdout")}
if os.environ.get("EQI_K6_RESULTS"):  # K6 from another results dir (e.g. the runs of 12 October)
    SETS = {k: (b, os.environ["EQI_K6_RESULTS"], p) for k, (b, r, p) in SETS.items()}
T1 = ("synth", "sintel", "tos", "nasa_vo", "nasa_talk")
_feat = {}


def load_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def features(name):
    if name not in _feat:
        p = CACHE / f"{name}.pkl"
        _feat[name] = pickle.loads(p.read_bytes()) if p.exists() else None
    return _feat[name]


def report_from_cache(name, ai_info=None):
    from eqi.criteria import assess_all
    from eqi.report import build_report
    fa = features(name)
    if fa is None:
        return None
    f, a = fa
    kw = {}
    try:
        import inspect
        if "profile" in inspect.signature(assess_all).parameters and ai_info is not None:
            kw["profile"] = ai_info
    except Exception:
        pass
    return build_report(f, a, assess_all(f, a, **kw), None, None, {})


def stored(base, res, vid):
    return load_json(OUT / base / res / vid / "report.json")


def k6_score(rep_stored):
    levels = rep_stored["criteria"]["narrative"].get("levels") or []
    return (statistics.median(levels) - 1) / 4 * 100 if levels else rep_stored["criteria"]["narrative"]["score"]


def eqi_full(report, k6):
    from eqi import config
    from eqi.report import weighted_index
    scores = {k: report["criteria"][k]["score_signal"] for k in config.SIGNAL_CRITERIA}
    coverage = (report.get("eqi") or {}).get("coverage")
    try:
        return weighted_index({**scores, "narrative": k6}, list(config.WEIGHTS), coverage)
    except TypeError:  # code without coverage
        return weighted_index({**scores, "narrative": k6}, list(config.WEIGHTS))


def tier_stats(rows, key="eqi"):
    tiers = {t: [r[key] for r in rows if r["tier"] == t] for t in ORDER}

    def win(a, b):
        pairs = list(product(tiers[a], tiers[b]))
        return sum(1.0 if x > y else 0.5 if x == y else 0.0 for x, y in pairs) / len(pairs) if pairs else float("nan")

    rho = stats.spearmanr([ORDER[r["tier"]] for r in rows], [r[key] for r in rows]).statistic
    clean = [r for r in rows if r["tier"] != "broken"]
    rho_c = stats.spearmanr([ORDER[r["tier"]] for r in clean], [r[key] for r in clean]).statistic
    return ({t: statistics.median(x) if x else float("nan") for t, x in tiers.items()},
            {f"{a}>{b}": win(a, b) for a, b in (("pro", "mid"), ("mid", "bad"), ("pro", "bad"), ("bad", "broken"))},
            rho, rho_c)


def line(label, rows, key="eqi"):
    med, win, rho, rho_c = tier_stats(rows, key)
    return (f"{label:9s} med " + "/".join(f"{med[t]:4.1f}" for t in ORDER) + " | " +
            " ".join(f"{k}={v:.2f}" for k, v in win.items()) + f" | rho={rho:.2f} clean={rho_c:.2f}")


def dev_eval(sets=("tiers", "market", "holdout"), show=False, save=None, quiet=False):
    allrows = {}
    for s in sets:
        base, res, prefix = SETS[s]
        key = load_json(OUT / base / "key.json")
        rows = []
        for k in key:
            vid = k["id"]
            st = stored(base, res, vid)
            rep = report_from_cache(f"{prefix}__{vid}", st)
            if rep is None:
                continue
            k6 = k6_score(st)
            rows.append({"set": s, "tier": k["tier"], "vid": vid, "eqi": eqi_full(rep, k6), "sig": rep["eqi"]["signal_only"],
                         "scores": {c: rep["criteria"][c]["score_signal"] for c in ("cuts", "pacing", "color", "audio", "framing")},
                         "k6": k6, "levels": st["criteria"]["narrative"].get("levels"), "title": k["title"],
                         "genre": k.get("genre", ""), "report": rep})
        allrows[s] = rows
        if not quiet:
            print(line(s, rows) + f"  n={len(rows)}")
            print(line(" signal", rows, "sig"))
        if show:
            for t in ORDER:
                for r in sorted([r for r in rows if r["tier"] == t], key=lambda r: -r["eqi"]):
                    sc = r["scores"]
                    print(f"     {t:6s} {r['vid']} {r['eqi']:5.1f} sig {r['sig']:5.1f} " + " ".join(
                        f"{c[:2]}={'  n/a' if v is None else f'{v:5.1f}'}" for c, v in sc.items()) +
                          f" K6={r['k6']:5.1f} {r['levels']} {r['genre'][:14]:14s} {r['title'][:38]}")
    if not quiet and len(sets) > 1:
        rows = [r for s in sets for r in allrows[s]]
        print(line("ALL", rows))
        print(line(" signal", rows, "sig"))
    if save:
        out = {f"{r['set']}/{r['vid']}": {"tier": r["tier"], "eqi": r["eqi"], "sig": r["sig"], "scores": r["scores"], "k6": r["k6"]}
               for s in sets for r in allrows[s]}
        DATA.mkdir(parents=True, exist_ok=True)
        (DATA / f"dev_{save}.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    return allrows


def tier1_eval(verbose=False):
    from eqi.evaluate import match
    from eqi.inject import LEVELS
    tot = {"det": 0, "ev": 0, "det_s": 0, "ev_s": 0, "fa": 0, "new_away": 0, "new_sev": 0.0, "lost": 0, "lost_sev": 0.0, "mono": 0, "kinds": 0}
    by_kind, drops = {}, {}
    for s in T1:
        vids = OUT / f"tier1v2_{s}" / "videos"
        clean_stem = next(vids.glob("*__clean.mp4")).stem
        clean = report_from_cache(f"t1_{s}__{clean_stem}")
        if clean is None:
            continue
        src = clean_stem.replace("__clean", "")
        per_kind = {}
        for kind, levels in LEVELS.items():
            for level in levels:
                stem = f"{src}__{kind}_L{level}"
                rep = report_from_cache(f"t1_{s}__{stem}")
                if rep is None:
                    continue
                truth = load_json(vids / f"{stem}.truth.json")
                m = match(truth, rep, clean)
                crit = truth["criterion"]
                drop_c = clean["criteria"][crit]["score_signal"] - rep["criteria"][crit]["score_signal"]
                drop_e = clean["eqi"]["signal_only"] - rep["eqi"]["signal_only"]
                per_kind.setdefault(kind, []).append((level, drop_c))
                strongest = level == max(levels)
                tot["det"] += m["detected"]; tot["ev"] += m["events"]; tot["fa"] += m["false_alarms"]
                tot["new_away"] += m["other_new_away"]; tot["new_sev"] += m["other_new_away_severity"]
                tot["lost"] += m["clean_lost_away"]; tot["lost_sev"] += m["clean_lost_away_severity"]
                if strongest:
                    tot["det_s"] += m["detected"]; tot["ev_s"] += m["events"]
                    if s != "synth":
                        drops.setdefault(kind, []).append(drop_e)
                k = by_kind.setdefault(kind, {"det_s": 0, "ev_s": 0, "det": 0, "ev": 0, "fa": 0})
                k["det"] += m["detected"]; k["ev"] += m["events"]; k["fa"] += m["false_alarms"]
                if strongest:
                    k["det_s"] += m["detected"]; k["ev_s"] += m["events"]
                if verbose and (m["false_alarms"] or m["other_new_away"] or m["clean_lost_away"] or (strongest and m["detected"] < m["events"])):
                    print(f"     {s:9s} {kind}_L{level}: det {m['detected']}/{m['events']} fa {m['false_alarms']} "
                          f"new_away {m['other_new_away_issues']} lost {m['clean_lost_away_issues']}")
        for kind, lv in per_kind.items():
            d = [x for _, x in sorted(lv)]
            tot["kinds"] += 1
            mono = all(b >= a - 1e-9 for a, b in zip(d, d[1:]))
            tot["mono"] += mono
            if not mono and verbose:
                print(f"     NOT MONOTONIC {s} {kind}: criterion drops {[round(x, 1) for x in d]}")
        print(f"  tier1 {s:9s} clean EQI_signal {clean['eqi']['signal_only']:5.1f} issues "
              f"{sum(len(c.get('issues', [])) for c in clean['criteria'].values())}")
    print(f"  TIER1 strongest {tot['det_s']}/{tot['ev_s']} all {tot['det']}/{tot['ev']} | same-kind FA {tot['fa']} | "
          f"new away {tot['new_away']} ({tot['new_sev']:.2f}) lost away {tot['lost']} ({tot['lost_sev']:.2f}) | monotonic {tot['mono']}/{tot['kinds']}")
    print("  by kind (strongest / all / FA): " + " ".join(f"{k}={v['det_s']}/{v['ev_s']},{v['det']}/{v['ev']},{v['fa']}" for k, v in sorted(by_kind.items())))
    print("  mean EQI_signal drop at strongest (real): " + " ".join(f"{k}={statistics.mean(v):.1f}" for k, v in sorted(drops.items())))
    return tot


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier1", action="store_true")
    ap.add_argument("--no-dev", action="store_true")
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--sets", default="tiers,market,holdout")
    ap.add_argument("--save")
    args = ap.parse_args()
    if not args.no_dev:
        dev_eval(args.sets.split(","), args.show, args.save)
    if args.tier1:
        tier1_eval(args.verbose)
