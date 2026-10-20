"""Each rule of 12 October switched off on its own, on the cached features of all three
sets (K6 from the stored reports or a given results dir), plus Tier 1 totals.
Usage: python ablate.py [--tier1] [--k6 results_dir_suffix]"""
import argparse
import contextlib
import io
import sys
from pathlib import Path

SP = Path(__file__).parent
sys.path.insert(0, str(SP))
import h  # noqa: E402
from eqi import config, criteria, videotype  # noqa: E402

ORIG_CFG = {k: getattr(config, k) for k in dir(config) if k.isupper()}
ORIG_CLASSIFY = videotype.classify
ORIG_SCENES = criteria.designed_scene_changes


def reset():
    for k, v in ORIG_CFG.items():
        setattr(config, k, v)
    criteria.classify = ORIG_CLASSIFY
    criteria.designed_scene_changes = ORIG_SCENES


def no_designed(f, a):
    vt = ORIG_CLASSIFY(f, a)
    vt.designed_shots = frozenset()
    vt.designed_share = 0.0
    return vt


def no_montage(f, a):
    vt = ORIG_CLASSIFY(f, a)
    vt.music_montage = False
    return vt


def no_type(f, a):
    vt = no_designed(f, a)
    vt.music_montage = False
    return vt


RULES = {
    "designed pictures": lambda: setattr(criteria, "classify", no_designed),
    "montage cut to music": lambda: setattr(criteria, "classify", no_montage),
    "scene changes without a cut": lambda: setattr(criteria, "designed_scene_changes", lambda f, vt: []),
    "still = same a second later": lambda: setattr(config, "STATIC_CHANGE_1S", -1.0),  # see below
    "dead air = lost sound or freeze": lambda: setattr(config, "NO_SOUND_DBFS", 1e9),
    "flicker = the light": lambda: setattr(config, "FLICKER_LIGHT_SHARE", 0.0),
    "a minute at least": lambda: setattr(config, "MIN_VIEWING_MINUTES", 1 / 60),
}


def patched_static():
    """Old long-static test: per-frame differences (drop change_1s for that test only)."""
    orig = criteria.assess_pacing

    def assess_pacing(f, a, vt=None):
        saved = f.change_1s
        scenes = criteria.designed_scene_changes(f, vt or criteria._camera_only(f))
        f.change_1s = __import__("numpy").array([])
        try:
            keep = criteria.designed_scene_changes
            criteria.designed_scene_changes = lambda ff, vv: scenes
            return orig(f, a, vt)
        finally:
            criteria.designed_scene_changes = keep
            f.change_1s = saved
    return assess_pacing


def summary(label):
    with contextlib.redirect_stdout(io.StringIO()):
        rows = h.dev_eval(quiet=True)
    parts = []
    allrows = []
    for s in ("tiers", "market", "holdout"):
        med, win, rho, rho_c = h.tier_stats(rows[s])
        allrows += rows[s]
        parts.append(f"{s[:4]} " + "/".join(f"{med[t]:4.1f}" for t in h.ORDER) + f" ρ={rho:.2f} c={rho_c:.2f}")
    med, win, rho, rho_c = h.tier_stats(allrows)
    print(f"{label:34s} | " + " | ".join(parts) + f" | ALL ρ={rho:.2f} clean={rho_c:.2f} p>m={win['pro>mid']:.2f} m>a={win['mid>bad']:.2f} a>b={win['bad>broken']:.2f}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier1", action="store_true")
    args = ap.parse_args()
    reset()
    summary("all rules of 12 October")
    for name, off in RULES.items():
        reset()
        if name.startswith("still"):
            orig = criteria.assess_pacing
            criteria.assess_pacing = patched_static()
            summary(f"without: {name}")
            criteria.assess_pacing = orig
            continue
        off()
        summary(f"without: {name}")
    reset()
    criteria.classify = no_type
    summary("without the video type at all")
    reset()
    if args.tier1:
        h.tier1_eval(False)
