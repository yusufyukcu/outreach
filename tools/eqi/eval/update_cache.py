"""Bring a feature cache built with the first TransNetV2 rule up to the current code. The
current rule only keeps hits the first one removed (those beside black), so only videos
whose cached shot_check removed a hit can change: their shots are detected again and,
when they differ, the visual features are extracted again (audio does not depend on the
shots). Every other video is copied unchanged.
Usage: python update_cache.py <code dir> <old cache> <new cache> <video list: main|reenc> <workers>
(caches: names in DATA or paths)"""
import pickle
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

SP = Path(__file__).parent
sys.path.insert(0, str(SP))
import h  # noqa: E402


def videos(kind):
    if kind == "main":
        import build_cache
        return dict(build_cache.job_list())
    return {v.stem: v for v in sorted((h.DATA / "reenc").glob("*.mp4"))}


def work(code, old, new, name, video):
    sys.path.insert(0, code)
    from eqi.features import detect_shots, extract
    from eqi.media import probe
    f_old, a = pickle.loads((Path(old) / f"{name}.pkl").read_bytes())
    info = probe(Path(video))
    shots = detect_shots(info)
    same = [(s.start, s.gradual) for s in shots] == [(s.start, s.gradual) for s in f_old.shots]
    if same:
        f_old.info.shot_check = info.shot_check
        f, status = f_old, "same shots"
    else:
        f, status = extract(info, shots), f"re-extracted ({len(f_old.shots)} -> {len(f.shots) if False else len(shots)} shots)"
    tmp = (Path(new) / f"{name}.part")
    tmp.write_bytes(pickle.dumps((f, a)))
    tmp.replace(Path(new) / f"{name}.pkl")
    return name, status, info.shot_check


if __name__ == "__main__":
    code, old, new, kind, workers = sys.argv[1], h.data_path(sys.argv[2]), h.data_path(sys.argv[3]), sys.argv[4], int(sys.argv[5])
    sys.path.insert(0, code)
    new.mkdir(exist_ok=True)
    jobs = videos(kind)
    todo = []
    for p in sorted(old.glob("*.pkl")):
        f, _ = pickle.loads(p.read_bytes())
        check = getattr(f.info, "shot_check", None) or {}
        if check.get("removed_s"):
            todo.append(p.stem)
        else:
            shutil.copy2(p, new / p.name)
    print(f"{len(todo)} videos to check, {len(list(new.glob('*.pkl')))} copied", flush=True)
    with ProcessPoolExecutor(workers) as pool:
        futs = [pool.submit(work, code, str(old), str(new), n, str(jobs[n])) for n in todo]
        for fut in as_completed(futs):
            print(*fut.result(), flush=True)
