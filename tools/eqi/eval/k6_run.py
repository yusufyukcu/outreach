"""The rest of pipeline.analyze for the tier-set videos under their neutral names, with
the working-tree code: features from the cache, K1–K5, the Gemini review (median of
three runs, one model, no fallback) and the report, written as pipeline.analyze writes
it to out/<set>/<results dir>/<vid>/ (report.json, report.html; no figures).
Usage: EQI_CACHE=<cache> python k6_run.py <results dir> <set:vid> ... [--workers 4]
It calls Gemini (about $0.5 a video): check the credit first (api_check.py --call)."""
import json
import os
import pickle
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SP = Path(__file__).parent
sys.path.insert(0, str(SP))
import h  # noqa: E402  (code path: EQI_CODE or tools/eqi)
EQI = h.EQI
sys.stdout.reconfigure(encoding="utf-8")
from eqi import config  # noqa: E402
from eqi.__main__ import _load_env_file  # noqa: E402

_load_env_file()
os.environ["GEMINI_FALLBACK_MODEL"] = config.GEMINI_MODEL_DEFAULT  # --strict-model
from eqi import ai as ai_layer  # noqa: E402
from eqi import html_report  # noqa: E402
from eqi.criteria import assess_all  # noqa: E402
from eqi.pipeline import _summary_metrics  # noqa: E402
from eqi.report import build_report  # noqa: E402

SETS = {"tiers": ("eval_tiers", "eval_tiers"), "market": ("eval_market", "eval_market"), "holdout": ("eval_holdout", "holdout")}
if not os.environ.get("EQI_CACHE"):
    sys.exit("Set EQI_CACHE: fcache3 for the drift test (the Gemini inputs of 12-13 October), "
             "fcache_tn2 for the current code.")
CACHE = h.CACHE


def run(results: str, spec: str) -> str:
    s, vid = spec.split(":")
    base, prefix = SETS[s]
    out_dir = EQI / "out" / base / results / vid
    done = out_dir / "report.json"
    if done.exists() and json.loads(done.read_text(encoding="utf-8")).get("ai"):
        return f"{spec} done before"
    video = EQI / "out" / base / "videos" / f"{vid}.mp4"
    f, a = pickle.loads((CACHE / f"{prefix}__{vid}.pkl").read_bytes())
    f.info.path = video
    t0 = time.perf_counter()
    assessments = assess_all(f, a)
    review, ai_error, unparsed = None, None, None
    issues = [i for x in assessments.values() for i in x.issues]
    try:
        review = ai_layer.review(video, f.info.duration, issues, _summary_metrics(f, a, assessments))
        if review is None:
            ai_error = "AI layer returned no review"
        else:
            ai_layer.apply_verdicts(issues, review)
    except ai_layer.UnparseableResponse as err:
        ai_error, unparsed = str(err), [text[:4000] for text in err.raw]
    except Exception as err:
        ai_error = f"{type(err).__name__}: {err}"
    report = build_report(f, a, assessments, review, ai_error, {"ai": round(time.perf_counter() - t0, 2)})
    if unparsed is not None:
        report["ai_unparsed_responses"] = unparsed
    out_dir.mkdir(parents=True, exist_ok=True)
    done.write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    html_report.write(report, out_dir)
    n = report["criteria"]["narrative"]
    return (f"{spec} EQI {report['eqi']['full']} signal {report['eqi']['signal_only']} K6 levels {n.get('levels')} "
            f"overall {n.get('overall_levels')} source {n.get('level_source')} {ai_error or ''}")


if __name__ == "__main__":
    args = sys.argv[1:]
    workers = 4
    if "--workers" in args:
        i = args.index("--workers")
        workers = int(args[i + 1])
        del args[i:i + 2]
    results, specs = args[0], args[1:]
    with ThreadPoolExecutor(workers) as pool:
        futs = {pool.submit(run, results, spec): spec for spec in specs}
        for fut in as_completed(futs):
            try:
                print(fut.result(), flush=True)
            except Exception:
                print(f"FAILED {futs[fut]}\n{traceback.format_exc()}", flush=True)
