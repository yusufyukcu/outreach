import sys, json
sys.path.insert(0, '.')
import h
from eqi.evaluate import match
from eqi.inject import LEVELS
out = {}
for s in h.T1:
    vids = h.OUT / f"tier1v2_{s}" / "videos"
    clean_stem = next(vids.glob("*__clean.mp4")).stem
    clean = h.report_from_cache(f"t1_{s}__{clean_stem}")
    src = clean_stem.replace("__clean", "")
    for kind, levels in LEVELS.items():
        for level in levels:
            stem = f"{src}__{kind}_L{level}"
            rep = h.report_from_cache(f"t1_{s}__{stem}")
            truth = h.load_json(vids / f"{stem}.truth.json")
            m = match(truth, rep, clean)
            crit = truth["criterion"]
            vt = (rep.get("video_type") or {}).get("label")
            out[f"{s} {kind}_L{level}"] = (m["detected"], m["events"], m["false_alarms"], len(m["other_new_away_issues"]), len(m["clean_lost_away_issues"]),
                                          round(clean["criteria"][crit]["score_signal"] - rep["criteria"][crit]["score_signal"], 1) if rep["criteria"][crit]["score_signal"] is not None and clean["criteria"][crit]["score_signal"] is not None else None,
                                          round(clean["eqi"]["signal_only"] - rep["eqi"]["signal_only"], 1), vt)
json.dump(out, open(sys.argv[1], "w"), indent=0)
