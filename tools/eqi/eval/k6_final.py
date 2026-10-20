"""Final reports of the test sets: K1–K5 from the cache with the working-tree code, the
AI review (K6 runs, comments, summary) from out/<set>/results_v8, written to
out/<set>/results_v8_final/<vid>/report.json(+html) and scores.csv per set.
Usage: python k6_final.py"""
import csv, json, sys
from pathlib import Path
SP = Path(__file__).parent
sys.path.insert(0, str(SP))
import h  # noqa: E402
from eqi import html_report  # noqa: E402
from eqi.report import rescore  # noqa: E402
for s, (base, _, prefix) in h.SETS.items():
    rows = []
    for k in h.load_json(h.OUT / base / "key.json"):
        run = h.OUT / base / "results_v8" / k["id"] / "report.json"
        if not run.exists():
            print("missing run", s, k["id"]); continue
        ai_from = h.load_json(run)
        if not ai_from.get("ai"):
            continue  # the run failed (API credits ran out): no K6 for this video
        n = ai_from["criteria"]["narrative"]
        if "overall_levels" in n:  # runs of 12 October: K6 = the model's overall level, the parts level reported
            levels = n.pop("overall_levels")
            n["parts_levels"], n["levels"] = n.get("levels"), levels
            n["level"] = round(float(__import__("statistics").median(levels)), 2)
            n["score"] = n["score_with_ai_verdicts"] = round((n["level"] - 1) / 4 * 100, 1)
            n["level_source"] = "overall"
        signal = h.report_from_cache(f"{prefix}__{k['id']}")
        signal["video"]["path"] = str(h.OUT / base / "videos" / f"{k['id']}.mp4")
        report = rescore(signal, ai_from if ai_from.get("ai") else None)
        out = h.OUT / base / "results_v8_final" / k["id"]
        out.mkdir(parents=True, exist_ok=True)
        (out / "report.json").write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
        html_report.write(report, out)
        c = report["criteria"]
        rows.append({"video": k["id"], "tier": k["tier"], "eqi_full": report["eqi"]["full"], "eqi_signal": report["eqi"]["signal_only"],
                     **{x: c[x]["score"] for x in ("cuts", "pacing", "color", "audio", "framing", "narrative")},
                     "k6_levels": c["narrative"].get("levels"), "video_type": report["video_type"]["label"],
                     "ai_error": report.get("ai_error") or ""})
    if not rows:
        continue
    with open(h.OUT / base / "results_v8_final" / "scores.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    print(s, len(rows), "reports")
