"""Measurement stability under re-encoding: the same video as published (cache of the
test sets) and re-encoded at 720p CRF 30 and 480p CRF 28 (features in fcache_reenc).
Prints per-criterion and EQI_signal differences and whether the video type agrees.
Usage: python reenc_eval.py [build]   (build: extract the re-encodes' features first)
Caches: EQI_REENC_CACHE for the re-encodes (default fcache_reenc_tn2), EQI_CACHE for the
originals (default fcache_tn2); before the TransNetV2 check, fcache_reenc and fcache3."""
import os
import pickle
import statistics
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

SP = Path(__file__).parent
sys.path.insert(0, str(SP))
import h  # noqa: E402  (code path: EQI_CODE or tools/eqi)
REENC = h.DATA / "reenc"
CACHE = h.data_path(os.environ.get("EQI_REENC_CACHE", "fcache_reenc_tn2"))
SETS = {"h": ("holdout", "holdout"), "m": ("market", "eval_market"), "v": ("tiers", "eval_tiers")}


def work(video):
    from eqi import audio as audio_layer
    from eqi.features import detect_shots, extract
    from eqi.media import probe
    dest = CACHE / f"{Path(video).stem}.pkl"
    if dest.exists():
        return dest.name
    info = probe(Path(video))
    f = extract(info, detect_shots(info))
    with tempfile.TemporaryDirectory() as tmp:
        a = audio_layer.analyze(Path(video), Path(tmp))
    dest.write_bytes(pickle.dumps((f, a)))
    return dest.name


def report(fa):
    from eqi.criteria import assess_all
    from eqi.report import build_report
    f, a = fa
    assessments = assess_all(f, a)
    return build_report(f, a, assessments, None, None, {})


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "build":
        CACHE.mkdir(exist_ok=True)
        with ProcessPoolExecutor(3) as pool:
            for fut in as_completed([pool.submit(work, str(v)) for v in sorted(REENC.glob("*.mp4"))]):
                print(fut.result(), flush=True)
        sys.exit()
    crits = ("cuts", "pacing", "color", "audio", "framing")
    diffs = {c: [] for c in (*crits, "eqi_signal")}
    agree, rows = [], []
    for p in sorted(CACHE.glob("*.pkl")):
        vid, variant = p.stem.split("__")
        set_name, prefix = SETS[vid[0]]
        orig = h.features(f"{prefix}__{vid}")
        r0, r1 = report(orig), report(pickle.loads(p.read_bytes()))
        line = []
        for c in crits:
            a, b = r0["criteria"][c]["score_signal"], r1["criteria"][c]["score_signal"]
            if a is not None and b is not None:
                diffs[c].append(b - a)
            line.append(f"{c[:2]} {a}→{b}")
        d = r1["eqi"]["signal_only"] - r0["eqi"]["signal_only"]
        diffs["eqi_signal"].append(d)
        vt0, vt1 = r0.get("video_type") or {"label": "-", "designed_share": 0.0}, r1.get("video_type") or {"label": "-", "designed_share": 0.0}
        same = vt0["label"] == vt1["label"]
        agree.append(same)
        print(f"{vid} {variant:10s} EQI_signal {r0['eqi']['signal_only']:5.1f} → {r1['eqi']['signal_only']:5.1f} ({d:+5.1f}) | "
              + " ".join(line) + f" | type {'same' if same else vt0['label'] + ' → ' + vt1['label']}"
              f" designed {vt0['designed_share']:.2f}→{vt1['designed_share']:.2f}")
    print("\nmedian |difference| (mean, max):")
    for c, v in diffs.items():
        if v:
            a = np.abs(v)
            print(f"  {c:10s} median {statistics.median(a):5.1f}  mean {a.mean():5.1f}  max {a.max():5.1f}  (n={len(v)})")
    print(f"  video type label the same in {sum(agree)}/{len(agree)}")
