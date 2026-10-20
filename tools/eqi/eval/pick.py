"""Spec lists for today's K6 runs. main: the 47 tier-set videos without a 12 October
structured-K6 run. drift: 5 per clean tier (fixed seed) among the videos whose 12 October
run had three answers and whose Gemini inputs are unchanged with the final code.
Writes to DATA; the lists used on 13 October are in ref/."""
import json
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402
OUT = h.OUT
SETS = (("holdout", "eval_holdout"), ("market", "eval_market"), ("tiers", "eval_tiers"))
SAME = ("m22 m23 m24 m25 m26 m27 m28 m29 m30 m31 m32 m33 h01 h02 h03 h04 h05 h07 h08 h09 h11 h12 h14 "
        "h15 h16 h17 h18 h20 h22 h23 h25 h27 h28 h29").split()
main, eligible = [], {}
for s, base in SETS:
    for k in json.loads((OUT / base / "key.json").read_text(encoding="utf-8")):
        p = OUT / base / "results_v8" / k["id"] / "report.json"
        run = json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
        if not (run and run.get("ai")):
            main.append(f"{s}:{k['id']}")
            continue
        n = run["criteria"]["narrative"]
        if k["id"] in SAME and len(n.get("overall_levels") or []) == 3:
            eligible.setdefault(k["tier"], []).append(f"{s}:{k['id']}")
rng = np.random.default_rng(20261013)
drift = [x for t in ("pro", "mid", "bad") for x in sorted(rng.choice(eligible[t], 5, replace=False))]
(h.DATA / "main_specs.txt").write_text(" ".join(main), encoding="utf-8")
(h.DATA / "drift_specs.txt").write_text(" ".join(drift), encoding="utf-8")
print("main", len(main), " ".join(main))
print("eligible", {t: len(v) for t, v in eligible.items()})
print("drift", len(drift), " ".join(drift))
