import json, sys
from pathlib import Path
tot = {"prompt": 0, "out": 0, "thought": 0}
n_vid = 0; n_call = 0; done = []; failed = []
for p in sorted((Path(__file__).resolve().parents[1] / "out").glob("*/results_v8/*/report.json")):
    r = json.loads(Path(p).read_text(encoding="utf-8"))
    vid = Path(p).parent.name
    if not r.get("ai"):
        failed.append(vid); continue
    done.append(vid)
    u = (r.get("ai") or {}).get("usage") or []
    n_vid += 1
    for c in u:
        n_call += 1
        tot["prompt"] += c.get("prompt_token_count") or 0
        tot["out"] += c.get("candidates_token_count") or 0
        tot["thought"] += c.get("thoughts_token_count") or 0
print("videos with AI:", n_vid, "calls:", n_call)
print("tokens:", tot)
if n_call:
    print("per call: prompt %.0f out %.0f thought %.0f" % (tot["prompt"]/n_call, tot["out"]/n_call, tot["thought"]/n_call))
print("done:", " ".join(done))
print("failed (report without ai):", " ".join(failed))
