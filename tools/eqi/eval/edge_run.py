import sys, traceback, time, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402  (code path: EQI_CODE or tools/eqi)
sys.stdout.reconfigure(encoding="utf-8")
from eqi.pipeline import analyze
edge = h.DATA / "edge"
for v in sorted(edge.iterdir()):
    if v.suffix.lower() not in {".mp4", ".webm", ".avi", ".m4a", ".mov", ".mkv"}: continue
    t = time.perf_counter()
    try:
        r = analyze(v, edge / "out" / v.stem, use_ai=False, make_figures=True)
        c = r["criteria"]
        print(f"OK   {v.name:22s} {time.perf_counter()-t:5.1f}s EQI_signal {r['eqi']['signal_only']} type {r['video_type']['label']!r} "
              + " ".join(f"{k[:2]}={c[k]['score']}" for k in ('cuts','pacing','color','audio','framing')) + f" dur {r['video']['duration_s']} {r['video']['width']}x{r['video']['height']} fps {r['video']['fps']}")
    except Exception as e:
        print(f"FAIL {v.name:22s} {type(e).__name__}: {e}")
        traceback.print_exc(limit=3)
