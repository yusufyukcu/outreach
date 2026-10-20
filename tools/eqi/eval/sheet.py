"""Contact sheet of shot middles for a dev video: python sheet.py set vid [max]"""
import sys, cv2, numpy as np
sys.path.insert(0, '.')
import h
s, vid = sys.argv[1], sys.argv[2]
mx = int(sys.argv[3]) if len(sys.argv) > 3 else 16
base, res, prefix = h.SETS[s]
f, a = h.features(f"{prefix}__{vid}")
video = h.OUT / base / "videos" / f"{vid}.mp4"
cap = cv2.VideoCapture(str(video))
shots = f.shots
idx = np.linspace(0, len(shots) - 1, min(mx, len(shots))).round().astype(int)
tiles = []
for k in idx:
    sh = shots[k]
    fr = (sh.start + sh.end) // 2
    cap.set(cv2.CAP_PROP_POS_FRAMES, fr)
    ok, img = cap.read()
    if not ok: continue
    img = cv2.resize(img, (320, round(img.shape[0] * 320 / img.shape[1])))
    img = cv2.resize(img, (320, 180))
    cv2.putText(img, f"#{k} {sh.t0:.1f}-{sh.t1:.1f}s", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    tiles.append(img)
while len(tiles) % 4: tiles.append(np.zeros_like(tiles[0]))
rows = [np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]
dest = h.DATA / "sheets" / f"{vid}.jpg"
dest.parent.mkdir(parents=True, exist_ok=True)
cv2.imwrite(str(dest), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 70])
print(dest, len(shots), "shots")
