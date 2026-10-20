"""Every jump cut found at a detected cut (final code), with the frame difference at the
cut and its ratio to the larger neighbouring difference. Tier 1: whether it is an
injected defect (truth) or not."""
import json, pickle, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa
from eqi import config
from eqi.criteria import assess_all
OUT = h.OUT
rows = []
for cache in (h.DATA / "fcache3", h.DATA / "fcache_reenc"):
    for p in sorted(cache.glob("*.pkl")):
        f, a = pickle.loads(p.read_bytes())
        A = assess_all(f, a)
        truth_t = None
        if p.stem.startswith("t1_"):
            s, stem = p.stem[3:].split("__", 1)
            tj = OUT / f"tier1v2_{s}" / "videos" / f"{stem}.truth.json"
            if tj.exists():
                tr = json.loads(tj.read_text(encoding="utf-8"))
                truth_t = [e.get("t", e.get("time")) for e in tr.get("events", [])] if tr.get("kind") == "jump_cut" else []
        for i in A["cuts"].issues:
            if i.kind != "jump_cut" or not i.detail.get("detected_cut"):
                continue
            c = int(round(i.t * f.info.fps))
            c = min(range(max(1, c - 2), min(len(f.diff) - 1, c + 3)), key=lambda k: -f.diff[k])
            nb = max(f.diff[c - 1], f.diff[c + 1])
            inj = None if truth_t is None else any(abs(i.t - t) < 0.5 for t in truth_t if t is not None)
            rows.append((p.stem, i.t, f.diff[c], f.diff[c] / (nb + 1e-6), i.detail["unchanged_pixels"], inj, i.severity))
keep = lambda r: r[2] >= config.HIDDEN_JUMP_MIN_DIFF and r[3] >= config.HIDDEN_JUMP_ISOLATION
for grp, sel in (("originals", lambda r: not r[0].startswith("t1_") and "crf" not in r[0]), ("tier1", lambda r: r[0].startswith("t1_")), ("re-encodes", lambda r: "crf" in r[0])):
    sub = [r for r in rows if sel(r)]
    drop = [r for r in sub if not keep(r)]
    print(f"\n{grp}: {len(sub)} jump cuts at detected cuts, rule drops {len(drop)}")
    for r in sorted(drop, key=lambda r: r[0]):
        print(f"   DROP {r[0][:58]:58s} t={r[1]:7.2f} diff {r[2]:6.2f} ×nb {r[3]:5.2f} unchanged {r[4]:.3f} injected {r[5]} sev {r[6]}")
    kept = [r for r in sub if keep(r)]
    if kept:
        print(f"   kept: diff min {min(r[2] for r in kept):.2f}, ×nb min {min(r[3] for r in kept):.2f}; injected kept {sum(1 for r in kept if r[5])}")
