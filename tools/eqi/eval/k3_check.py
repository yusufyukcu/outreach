import pickle, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import h  # noqa: E402  (code path: EQI_CODE or tools/eqi)
from eqi.criteria import assess_all
name = sys.argv[1]
for cache in sys.argv[2:]:
    f, a = pickle.loads((h.data_path(cache) / f"{name}.pkl").read_bytes())
    asmt = assess_all(f, a)
    print(Path(cache).name, "cuts", [round(s.t0, 2) for s in f.shots[1:]], "shot_check", getattr(f.info, "shot_check", None))
    print("  K3", asmt["color"].score(use_verdict=False), asmt["color"].context)
    for i in asmt["color"].issues:
        print("   ", i.kind, round(i.t, 2), round(i.t_end, 2), round(i.severity, 2), i.detail)
