import json, sys, statistics
sys.path.insert(0, '.')
import h, k6_eval as K
rows = K.load("results_v8")
out = {}
for r in rows:
    base, _, prefix = h.SETS[r["set"]]
    rep = h.report_from_cache(f"{prefix}__{r['vid']}")
    k6_new = (statistics.median(r["overall"]) - 1) / 4 * 100
    k6_old = (statistics.median(r["old"]) - 1) / 4 * 100
    out[f"{r['set']}/{r['vid']}"] = {"tier": r["tier"], "eqi_new_k6": h.eqi_full(rep, k6_new), "eqi_old_k6": h.eqi_full(rep, k6_old),
                                      "k6_new": k6_new, "k6_old": k6_old, "sig": rep["eqi"]["signal_only"]}
json.dump(out, open(sys.argv[1], "w"), indent=0)
print(len(out))
