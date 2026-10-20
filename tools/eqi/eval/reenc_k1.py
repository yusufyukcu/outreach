import pickle, sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa
from eqi.criteria import assess_all
SETS = {"h": "holdout", "m": "eval_market", "v": "eval_tiers"}
crit = sys.argv[1] if len(sys.argv) > 1 else "cuts"
for name in sys.argv[2:]:
    vid, variant = name.split("__")
    orig = h.features(f"{SETS[vid[0]]}__{vid}")
    re = pickle.loads((h.DATA / "fcache_reenc" / f"{name}.pkl").read_bytes())
    for lab, (f, a) in (("orig", orig), (variant, re)):
        A = assess_all(f, a)
        c = A[crit]
        print(f"{vid} {lab:10s} shots {len(f.shots)} {crit} {c.score():.1f} ctx " + json.dumps({k: v for k, v in c.context.items() if k not in ('per_shot',)}, default=str)[:400])
        for i in c.issues:
            print(f"     {i.kind:16s} t={i.t:7.2f} sev={i.severity:.2f} {json.dumps(i.detail, default=float)[:200]}")
    print()
