"""Extract and pickle visual + audio features with the working-tree code (or EQI_CODE).
Usage: python build_cache.py <cache_dir> <workers> [filter]   (cache_dir: a name in DATA or a path)"""
import pickle, sys, tempfile, time, traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402  (code path: EQI_CODE or tools/eqi)
OUT = h.OUT

def job_list():
    jobs = []
    for d, prefix in (("eval_tiers", "eval_tiers"), ("eval_market", "eval_market"), ("eval_holdout", "holdout")):
        for v in sorted((OUT / d / "videos").glob("*.mp4")):
            jobs.append((f"{prefix}__{v.stem}", v))
    for s in ("synth", "sintel", "tos", "nasa_vo", "nasa_talk"):
        for v in sorted((OUT / f"tier1v2_{s}" / "videos").glob("*.mp4")):
            jobs.append((f"t1_{s}__{v.stem}", v))
    return jobs

def work(name, video, cache):
    from eqi import audio as audio_layer
    from eqi.features import detect_shots, extract
    from eqi.media import probe
    dest = Path(cache) / f"{name}.pkl"
    if dest.exists():
        return name, "cached", 0.0
    t0 = time.perf_counter()
    info = probe(Path(video))
    f = extract(info, detect_shots(info))
    with tempfile.TemporaryDirectory() as tmp:
        a = audio_layer.analyze(Path(video), Path(tmp))
    tmp_dest = dest.with_suffix(".part")
    tmp_dest.write_bytes(pickle.dumps((f, a)))
    tmp_dest.replace(dest)
    return name, "ok", time.perf_counter() - t0

if __name__ == "__main__":
    cache, workers = h.data_path(sys.argv[1]), int(sys.argv[2])
    flt = sys.argv[3] if len(sys.argv) > 3 else ""
    cache.mkdir(parents=True, exist_ok=True)
    jobs = [(n, v) for n, v in job_list() if flt in n]
    jobs.sort(key=lambda j: -j[1].stat().st_size)
    print(f"{len(jobs)} videos", flush=True)
    with ProcessPoolExecutor(workers) as pool:
        futs = {pool.submit(work, n, str(v), str(cache)): n for n, v in jobs}
        for fut in as_completed(futs):
            try:
                name, status, secs = fut.result()
                print(f"{name} {status} {secs:.0f}s", flush=True)
            except Exception:
                print(f"FAILED {futs[fut]}\n{traceback.format_exc()}", flush=True)
