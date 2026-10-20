"""For the 41 videos with 12 October K6 runs: are the inputs the final code sends to
Gemini (flagged issues that get reviewed, video type) the same as at run time?"""
import json, os, sys
from pathlib import Path
os.environ["EQI_CACHE"] = "fcache3"
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402
from eqi import config  # noqa: E402

def issue_key(i):
    return (i["id"], i["kind"], round(i["t"], 2), round(i["t_end"], 2), round(i["severity"], 3), json.dumps(i.get("detail"), sort_keys=True, default=float))

def reviewable(rep):
    from eqi.ai import NOT_REVIEWED
    iss = [i for c in rep["criteria"].values() for i in c.get("issues", []) if i["kind"] not in NOT_REVIEWED]
    return sorted(iss, key=lambda i: -i["severity"])[:config.AI_MAX_REVIEW_ISSUES]

same, diff = [], []
for s, (base, _, prefix) in h.SETS.items():
    for k in h.load_json(h.OUT / base / "key.json"):
        p = h.OUT / base / "results_v8" / k["id"] / "report.json"
        if not p.exists():
            continue
        old = h.load_json(p)
        new = h.report_from_cache(f"{prefix}__{k['id']}")
        a = [issue_key(i) for i in reviewable(old)]
        b = [issue_key(i) for i in reviewable(new)]
        vt_old = (old.get("video_type") or {}).get("label"), round((old.get("video_type") or {}).get("designed_share", 0), 2)
        vt_new = (new.get("video_type") or {}).get("label"), round((new.get("video_type") or {}).get("designed_share", 0), 2)
        ok = a == b and vt_old == vt_new and len(old["shots"]) == len(new["shots"])
        (same if ok else diff).append(f"{s}:{k['id']}:{k['tier']}")
        if not ok:
            print(k["id"], k["tier"], "issues same" if a == b else f"issues {len(a)}->{len(b)}", "| vt", vt_old, "->", vt_new)
print("same inputs:", len(same), " ".join(same))
print("different:", len(diff))
