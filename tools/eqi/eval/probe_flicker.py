import sys, numpy as np
sys.path.insert(0, '.')
import h
from eqi.criteria import assess_color, _moving_average
from eqi import config
rows = []
for s in ("tiers", "market", "holdout"):
    base, res, prefix = h.SETS[s]
    for k in h.load_json(h.OUT / base / "key.json"):
        f, a = h.features(f"{prefix}__{k['id']}")
        fps = f.info.fps
        A = assess_color(f)
        for i in A.issues:
            if i.kind != "flicker": continue
            s0, s1 = int(round(i.t * fps)) + 2, int(round(i.t_end * fps)) - 2
            L = f.lab[s0:s1, 0]
            w = int(fps // 2) | 1
            res_ = L - _moving_average(L, w)
            dl = np.diff(f.luma[s0:s1]); d = f.diff[s0 + 1:s1]
            oneway = np.abs(dl) / np.maximum(d, 1e-6)
            light = oneway >= 0.85
            # residual from lighting-only steps
            lsteps = np.where(light, dl, 0.0)
            # periodicity: spectral concentration of residual
            spec = np.abs(np.fft.rfft(res_ - res_.mean())) ** 2
            conc = float(spec[1:].max() / spec[1:].sum()) if spec[1:].sum() > 0 else 0
            # sign alternation of luma steps
            sg = np.sign(dl[np.abs(dl) > 0.3]); alt = float(np.mean(sg[1:] != sg[:-1])) if sg.size > 2 else 0
            rows.append((k["tier"], f"{s}:{k['id']}", i.t, i.t_end - i.t, i.detail["l_std"], float(light.mean()), float(np.median(d)), conc, alt, float(np.std(lsteps))))
for r in sorted(rows, key=lambda r: (r[0], r[1])):
    print(f"{r[0]:6s} {r[1]:14s} t={r[2]:6.1f} len {r[3]:5.1f}s lstd {r[4]:5.2f} oneway-share {r[5]:.2f} diff-med {r[6]:5.2f} period-conc {r[7]:.2f} sign-alt {r[8]:.2f} lightstep-std {r[9]:.2f}")
