"""python tiles.py out.jpg set:vid:shot ..."""
import sys, cv2, numpy as np
sys.path.insert(0, '.')
import h
tiles = []
for spec in sys.argv[2:]:
    s, vid, idx = spec.split(":")
    base, res, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}")
    sh = f.shots[int(idx)]
    cap = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
    cap.set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
    ok, img = cap.read()
    img = cv2.resize(img, (320, 180))
    cv2.putText(img, f"{vid}#{idx} {sh.t0:.1f}s", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    tiles.append(img)
while len(tiles) % 4: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite(sys.argv[1], np.vstack([np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]), [cv2.IMWRITE_JPEG_QUALITY, 70])
