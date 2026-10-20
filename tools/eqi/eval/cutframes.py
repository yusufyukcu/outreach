"""Frames either side of a cut, side by side, with the difference amplified ×8."""
import sys
from pathlib import Path
import cv2
import numpy as np
video, out = sys.argv[1], Path(sys.argv[2])
cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS)
rows = []
for c in [int(x) for x in sys.argv[3:]]:
    cap.set(cv2.CAP_PROP_POS_FRAMES, c - 1)
    ok1, a = cap.read(); ok2, b = cap.read()
    if not (ok1 and ok2):
        continue
    d = cv2.absdiff(a, b).astype(np.float32)
    amp = np.clip(d * 8, 0, 255).astype(np.uint8)
    g = cv2.cvtColor(cv2.absdiff(a, b), cv2.COLOR_BGR2GRAY)
    txt = f"frame {c} t={c / fps:.2f}s  mean|dgray| {g.mean():.2f}  changed>20: {(g > 20).mean():.1%}"
    h = 300
    tiles = [cv2.resize(x, (int(x.shape[1] * h / x.shape[0]), h)) for x in (a, b, amp)]
    row = np.hstack(tiles)
    cv2.putText(row, txt, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    rows.append(row)
    print(txt)
w = max(r.shape[1] for r in rows)
img = np.vstack([np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0))) for r in rows])
cv2.imwrite(str(out), img)
