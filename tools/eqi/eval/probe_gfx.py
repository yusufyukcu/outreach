"""Candidate 'designed picture' features on shot-middle frames."""
import sys, cv2, numpy as np
sys.path.insert(0, '.')
import h

def feats(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    H, W = gray.shape
    g = gray.astype(np.int16)
    k = np.ones((3, 3), np.uint8)
    mx = cv2.dilate(gray, k); mn = cv2.erode(gray, k)
    rng = (mx.astype(np.int16) - mn.astype(np.int16))
    clipped = (gray >= 250) | (gray <= 5)
    flat0 = float((rng == 0).mean())
    flat1 = float((rng <= 1).mean())
    flat1_nc = float(((rng <= 1) & ~clipped).mean() / max(1e-6, (~clipped).mean()))
    # Immerkaer noise estimate on non-edge pixels
    N = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], np.float32)
    conv = np.abs(cv2.filter2D(gray.astype(np.float32), -1, N))
    edges = cv2.Canny(gray, 50, 150) > 0
    edges = cv2.dilate(edges.astype(np.uint8), k) > 0
    sel = ~edges & ~clipped
    sigma = float(np.sqrt(np.pi / 2) / 6 * conv[sel].mean()) if sel.any() else 0.0
    # colours at 5 bits per channel, 160x90
    small = cv2.resize(img, (160, 90), interpolation=cv2.INTER_NEAREST) >> 3
    ncol = len(np.unique(small.reshape(-1, 3).astype(np.int32) @ np.array([1, 32, 1024])))
    # share of pixels in the 8 most common colours
    q = (cv2.resize(img, (160, 90), interpolation=cv2.INTER_NEAREST) >> 4).reshape(-1, 3).astype(np.int32) @ np.array([1, 16, 256])
    _, cnt = np.unique(q, return_counts=True)
    top8 = float(np.sort(cnt)[::-1][:8].sum() / cnt.sum())
    return dict(flat0=flat0, flat1=flat1, flat1nc=flat1_nc, sigma=sigma, ncol=ncol, top8=top8, H=H)

for spec in sys.argv[1:]:
    s, vid = spec.split(":")
    base, res, prefix = h.SETS[s]
    f, a = h.features(f"{prefix}__{vid}")
    cap = cv2.VideoCapture(str(h.OUT / base / "videos" / f"{vid}.mp4"))
    vals = []
    for sh in f.shots:
        if sh.length < 6: continue
        cap.set(cv2.CAP_PROP_POS_FRAMES, (sh.start + sh.end) // 2)
        ok, img = cap.read()
        if not ok: continue
        vals.append(feats(img))
    keys = ["flat0", "flat1", "flat1nc", "sigma", "ncol", "top8"]
    print(f"{spec:14s} n={len(vals):3d} H={vals[0]['H']:4d} " + " ".join(
        f"{k}={np.percentile([v[k] for v in vals], 25):.2f}/{np.median([v[k] for v in vals]):.2f}/{np.percentile([v[k] for v in vals], 75):.2f}" for k in keys), flush=True)
