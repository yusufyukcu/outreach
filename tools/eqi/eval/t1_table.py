import sys, statistics
sys.path.insert(0, '.')
import h
from eqi.evaluate import match
from eqi.inject import LEVELS
rows = []
tot = dict(ds=0, es=0, d=0, e=0, fa=0, new=0, newsev=0.0, lost=0, lostsev=0.0, var=0, mono=0, kinds=0)
for s in h.T1:
    vids = h.OUT / f"tier1v2_{s}" / "videos"
    clean_stem = next(vids.glob("*__clean.mp4")).stem
    clean = h.report_from_cache(f"t1_{s}__{clean_stem}")
    src = clean_stem.replace("__clean", "")
    r = dict(ds=0, es=0, d=0, e=0, fa=0, new=0, newsev=0.0, lost=0, lostsev=0.0, var=0, mono=0, kinds=0)
    for kind, levels in LEVELS.items():
        drops = []
        for level in levels:
            rep = h.report_from_cache(f"t1_{s}__{src}__{kind}_L{level}")
            truth = h.load_json(vids / f"{src}__{kind}_L{level}.truth.json")
            m = match(truth, rep, clean)
            crit = truth["criterion"]
            a, b = clean["criteria"][crit]["score_signal"], rep["criteria"][crit]["score_signal"]
            drops.append((a or 0) - (b or 0))
            r["d"] += m["detected"]; r["e"] += m["events"]; r["fa"] += m["false_alarms"]
            if level == max(levels): r["ds"] += m["detected"]; r["es"] += m["events"]
            r["new"] += m["other_new_away"]; r["newsev"] += m["other_new_away_severity"]
            r["lost"] += m["clean_lost_away"]; r["lostsev"] += m["clean_lost_away_severity"]
            r["var"] += 1 if (m["other_new_away"] or m["clean_lost_away"]) else 0
        r["kinds"] += 1; r["mono"] += all(y >= x - 1e-9 for x, y in zip(drops, drops[1:]))
    n_iss = sum(len(c.get("issues", [])) for c in clean["criteria"].values())
    print(f"| {s} | {clean['eqi']['signal_only']} | {n_iss} | {r['ds']}/{r['es']} | {r['d']}/{r['e']} | {r['fa']} | {r['new']} + {r['lost']} in {r['var']}/20 ({r['newsev'] + r['lostsev']:.2f}) | {r['mono']}/{r['kinds']} |")
    if s != "synth":
        for k in tot: tot[k] += r[k]
print(f"| real | | | {tot['ds']}/{tot['es']} | {tot['d']}/{tot['e']} | {tot['fa']}/80 | {tot['new']} + {tot['lost']} in {tot['var']}/80 ({tot['newsev'] + tot['lostsev']:.2f}) | {tot['mono']}/{tot['kinds']} |")
