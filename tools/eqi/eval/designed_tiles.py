import sys, cv2, numpy as np
sys.path.insert(0, '.')
import h
from eqi.videotype import classify
specs = sys.argv[2:]
tiles = []
for spec in specs:
    s, vid, n = spec.split(":")
    base, res, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}")
    vt = classify(f, a)
    ds = sorted(vt.designed_shots)
    pick = [ds[i] for i in np.linspace(0, len(ds) - 1, min(int(n), len(ds))).round().astype(int)] if ds else []
    cap = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
    by = {k.shot: k for k in f.keyframes}
    for i in dict.fromkeys(pick):
        sh = f.shots[i]
        cap.set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
        ok, img = cap.read()
        img = cv2.resize(img, (320, 180))
        k = by[i]
        cv2.putText(img, f"{vid}#{i} m{k.fill_mid:.2f} w{k.fill_white:.2f} b{k.fill_black:.2f}", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
        tiles.append(img)
while len(tiles) % 4: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite(sys.argv[1], np.vstack([np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]), [cv2.IMWRITE_JPEG_QUALITY, 65])
print(len(tiles))
