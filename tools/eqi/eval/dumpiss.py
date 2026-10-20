import sys, collections
sys.path.insert(0, '.')
import h
sets = {"tiers": [], "market": [], "holdout": []}
want = sys.argv[1].split(",")
rows = h.dev_eval(quiet=True)
for s, rs in rows.items():
    for r in rs:
        if r["vid"] not in want: continue
        rep = r["report"]
        print(f"=== {r['vid']} {r['tier']} {r['genre']} {r['title'][:50]} EQI {r['eqi']} sig {r['sig']}")
        for c in ("cuts","pacing","color","audio","framing"):
            cr = rep["criteria"][c]
            iss = cr["issues"]
            cnt = collections.Counter(i["kind"] for i in iss)
            sev = collections.defaultdict(float)
            for i in iss: sev[i["kind"]] += i["severity"]
            ctx = {k: v for k, v in cr["context"].items() if k not in ("minutes",)}
            print(f"  {c:8s} {cr['score_signal']}  " + ", ".join(f"{k}×{n} (Σ{sev[k]:.2f})" for k, n in cnt.items()) + f"  ctx={ctx}")
