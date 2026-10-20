import json
from pathlib import Path
for p in sorted((Path(__file__).resolve().parents[1] / "out").glob("*/results_v8_final/*/report.json")):
    r = json.loads(p.read_text(encoding="utf-8"))
    vt = r["video_type"]["label"]; n = r["criteria"]["narrative"]
    cuts = r["criteria"]["cuts"]["context"].get("n_cuts")
    if vt == "single take" or (cuts is not None and cuts <= 2):
        print(p.parent.name, vt, "cuts", cuts, "K6 levels", n["levels"], "parts", n.get("parts_levels"))
