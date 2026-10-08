"""Visual feature extraction: shot boundaries (PySceneDetect for hard cuts, twin
comparison for dissolves, fades and wipes) plus one decoding pass that collects
cheap per-frame statistics, the frames around each cut and one analyzed
keyframe per shot."""

from dataclasses import dataclass, field

import cv2
import numpy as np
from scenedetect import AdaptiveDetector, detect

from . import config
from .media import VideoInfo


@dataclass
class Shot:
    index: int
    start: int          # first frame
    end: int            # exclusive
    fps: float
    gradual: bool = False   # begins with a dissolve, fade or wipe rather than a hard cut

    @property
    def length(self) -> int:
        return self.end - self.start

    @property
    def t0(self) -> float:
        return self.start / self.fps

    @property
    def t1(self) -> float:
        return self.end / self.fps


@dataclass
class Keyframe:
    shot: int
    frame: int
    t: float
    faces: list[tuple[float, float, float, float]]           # normalized x, y, w, h
    subject: tuple[float, float] | None                     # normalized centre of attention
    subject_box: tuple[float, float, float, float] | None   # normalized x, y, w, h
    subject_source: str | None                              # "face" | "saliency"
    sharpness: float                                        # variance of Laplacian
    clip_high: float                                        # share of pixels ≥ 250
    clip_low: float                                         # share of pixels ≤ 5
    face_luma: float | None = None                          # mean gray inside the largest face


@dataclass
class VisualFeatures:
    info: VideoInfo
    shots: list[Shot]
    lab: np.ndarray          # (n, 3) mean CIELAB per frame
    diff: np.ndarray         # (n,) mean |Δgray| to the previous frame, 0–255
    ncc: np.ndarray          # (n,) correlation with the previous frame's layout
    stable: np.ndarray       # (n,) share of non-dark pixels unchanged since the previous frame; NaN in dark frames
    motion: np.ndarray       # (n, 2) global translation from the previous frame, px at SMALL_SIZE
    motion_conf: np.ndarray  # (n,) phase-correlation peak response: how trustworthy the translation is
    luma: np.ndarray = field(default_factory=lambda: np.array([]))  # (n,) mean gray, 0–255
    boundary: dict[int, np.ndarray] = field(default_factory=dict)   # small gray frames around cuts
    keyframes: list[Keyframe] = field(default_factory=list)

    @property
    def cut_frames(self) -> list[int]:
        return [s.start for s in self.shots[1:]]


def detect_shots(info: VideoInfo) -> list[Shot]:
    scenes = detect(str(info.path), AdaptiveDetector(min_scene_len=config.SCENE_MIN_LEN), show_progress=False)
    thumbs, hists, d = _frame_signals(info)
    reported = [s.frame_num for s, _ in scenes[1:]]
    hard = sorted({_snap(c, d, set(reported) - {c}) for c in reported} | _flash_ends(reported, thumbs, d))
    gradual = set(gradual_transitions(thumbs, hists, d, hard)) - set(hard)
    if not hard and not gradual:
        gradual = set(slow_dissolves(hists, info.fps))
    n = len(d) or info.n_frames
    bounds = [0, *[c for c in sorted(set(hard) | gradual) if 0 < c < n], n]
    return [Shot(i, a, b, info.fps, gradual=a in gradual) for i, (a, b) in enumerate(zip(bounds, bounds[1:]))]


def _snap(c: int, d: np.ndarray, taken: set[int]) -> int:
    """The detector turns timecodes back into frame numbers, which can land one frame
    off when the container's frame rate is not exact (phone footage, some exports).
    A hard cut is where the picture changes most, so move it there."""
    if not 1 <= c < len(d):
        return c
    best = max((k for k in (c - 1, c + 1) if 1 <= k < len(d) and k not in taken), key=lambda k: d[k], default=c)
    return best if d[best] > 2 * d[c] else c


def _flash_ends(reported: list[int], thumbs: list, d: np.ndarray) -> set[int]:
    """The detector may report only one of the two cuts around a 1–2 frame flash. When
    the picture after the flash returns to the picture before it, add the missing cut
    so the flash becomes its own (1–2 frame) shot."""
    def same(a: int, b: int) -> bool:
        return 0 <= a and b < len(d) and float(np.mean(np.abs(thumbs[a] - thumbs[b]))) < config.FLASH_SAME_SHOT_DIFF

    added = set()
    for c in reported:
        for n in range(1, config.FLASH_MAX_FRAMES + 1):
            if c + n < len(d) and c + n not in reported and d[c + n] >= config.FLASH_EDGE_DIFF and same(c - 1, c + n):
                added.add(c + n)  # c was the cut into the flash
                break
            if c - n >= 1 and c - n not in reported and d[c - n] >= config.FLASH_EDGE_DIFF and same(c - n - 1, c):
                added.add(c - n)  # c was the cut out of it
                break
    return added


def _frame_signals(info: VideoInfo):
    """64×36 gray thumbnail, HSV histogram and difference to the previous frame, for every frame."""
    cap = cv2.VideoCapture(str(info.path))
    thumbs, hists, diffs = [], [], []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, (64, 36), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        hist = cv2.calcHist([cv2.cvtColor(small, cv2.COLOR_BGR2HSV)], [0, 1, 2], None, [8, 4, 4], [0, 180, 0, 256, 0, 256])
        diffs.append(float(np.mean(np.abs(gray - thumbs[-1]))) if thumbs else 0.0)
        thumbs.append(gray)
        hists.append(cv2.normalize(hist, hist).flatten())
    cap.release()
    return thumbs, hists, np.array(diffs)


def gradual_transitions(thumbs: list, hists: list, d: np.ndarray, hard_cuts: list[int]) -> list[int]:
    """Twin comparison (Zhang, Kankanhalli & Smoliar 1993): a dissolve, fade or wipe
    spreads a cut over several frames, so no single frame difference stands out.
    A run of moderately raised differences whose two ends differ like two shots
    (pixels and colour histogram) is a gradual transition; its middle is the cut.
    The histogram test keeps a camera move inside one scene from counting."""
    n = len(d)
    if n < 3:
        return []
    low = max(config.GRADUAL_LOW_K * float(np.median(d)), config.GRADUAL_LOW_MIN)
    found, i = [], 1
    while i < n:
        if d[i] < low:
            i += 1
            continue
        j = i  # extend the run, bridging single quiet frames
        while j + 1 < n and (d[j + 1] >= low or (j + 2 < n and d[j + 2] >= low)):
            j += 1
        a, b = i - 1, min(j + 1, n - 1)
        length = j - i + 1
        if length >= config.GRADUAL_MIN_FRAMES and not any(a - 2 <= c <= b + 2 for c in hard_cuts):
            ends = float(np.mean(np.abs(thumbs[a] - thumbs[b])))
            corr = cv2.compareHist(hists[a], hists[b], cv2.HISTCMP_CORREL)
            if length <= config.GRADUAL_MAX_FRAMES and ends >= config.GRADUAL_HIGH and corr <= config.GRADUAL_MAX_HIST_CORR:
                found.append((i + j + 1) // 2)
            elif length > config.GRADUAL_MAX_FRAMES and ends >= config.GRADUAL_LONG_HIGH and corr <= config.GRADUAL_LONG_MAX_HIST_CORR:
                # A long animated change between two unrelated pictures (motion graphics
                # building a new scene): the cut is where the picture changes most.
                found.append(i + int(np.argmax(d[i:j + 1])))
        i = j + 1
    return found


def slow_dissolves(hists: list, fps: float) -> list[int]:
    """Fallback for a video in which no cut was found. In moving footage a dissolve hides
    among the camera's own frame differences, so the twin comparison cannot see it, and
    a video cut only with dissolves would pass for one unedited take. Frames a second
    apart across a dissolve show two different scenes (their colour histograms barely
    correlate), while inside a shot, even a moving one, they stay alike. At least
    SLOW_DISSOLVE_MIN such changes away from the first and last seconds (fades, the
    camera starting) make the video an edit; each is cut where the two sides differ
    most, at least a second from the next."""
    h = max(1, round(fps * config.SLOW_DISSOLVE_SPAN_S / 2))
    edge = max(h, round(config.SLOW_DISSOLVE_EDGE_S * fps))
    corr = {t: cv2.compareHist(hists[t - h], hists[t + h], cv2.HISTCMP_CORREL) for t in range(edge, len(hists) - edge)}
    found: list[int] = []
    for t in sorted(corr, key=corr.get):
        if corr[t] > config.SLOW_DISSOLVE_MAX_CORR:
            break
        if all(abs(t - c) > 2 * h for c in found):
            found.append(t)
    return sorted(found) if len(found) >= config.SLOW_DISSOLVE_MIN else []


def spectral_residual_saliency(gray: np.ndarray) -> np.ndarray:
    """Hou & Zhang (2007), CVPR: saliency from the spectral residual of the log-amplitude spectrum."""
    small = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA).astype(np.float64)
    spectrum = np.fft.fft2(small)
    log_amplitude = np.log(np.abs(spectrum) + 1e-8)
    residual = log_amplitude - cv2.blur(log_amplitude, (3, 3))
    saliency = np.abs(np.fft.ifft2(np.exp(residual + 1j * np.angle(spectrum)))) ** 2
    saliency = cv2.GaussianBlur(saliency, (9, 9), 2.5)
    return cv2.resize(saliency, (gray.shape[1], gray.shape[0]))


def _salient_subject(gray: np.ndarray):
    sal = spectral_residual_saliency(gray)
    if sal.max() <= 0 or np.ptp(sal) < 1e-12:
        return None, None
    mask = (sal >= np.percentile(sal, 95)).astype(np.uint8)
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
    if n <= 1:
        return None, None
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    h, w = gray.shape
    x, y, bw, bh = stats[best, :4]
    cx, cy = centroids[best]
    return (cx / w, cy / h), (x / w, y / h, bw / w, bh / h)


def analyze_keyframe(frame: np.ndarray, shot: Shot, frame_idx: int, cascade) -> Keyframe:
    h, w = frame.shape[:2]
    img = cv2.resize(frame, (config.KEYFRAME_WIDTH, round(h * config.KEYFRAME_WIDTH / w)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    H, W = gray.shape

    min_face = int(0.06 * W)
    raw_faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(min_face, min_face))
    faces = [(x / W, y / H, fw / W, fh / H) for (x, y, fw, fh) in raw_faces]
    face_luma = None
    if faces:
        x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        subject, subject_box, source = (x + fw / 2, y + fh / 2), (x, y, fw, fh), "face"
        face_luma = float(gray[int(y * H):int((y + fh) * H), int(x * W):int((x + fw) * W)].mean())
    else:
        subject, subject_box = _salient_subject(gray)
        source = "saliency" if subject else None

    return Keyframe(
        shot=shot.index,
        frame=frame_idx,
        t=frame_idx / shot.fps,
        faces=faces,
        subject=subject,
        subject_box=subject_box,
        subject_source=source,
        sharpness=float(cv2.Laplacian(gray, cv2.CV_64F).var()),
        clip_high=float(np.mean(gray >= 250)),
        clip_low=float(np.mean(gray <= 5)),
        face_luma=face_luma,
    )


def sample_frames(shot: Shot) -> list[int]:
    """Frames analyzed for a shot: its middle (the frame shown in figures) and the
    other KEYFRAME_POSITIONS, without duplicates in very short shots."""
    middle = (shot.start + shot.end - 1) // 2
    others = {shot.start + int(p * shot.length) for p in config.KEYFRAME_POSITIONS}
    return [middle] + sorted(f for f in others if f != middle and shot.start <= f < shot.end)


def combine_keyframes(samples: list[Keyframe]) -> Keyframe:
    """One judgement per shot from several frames. A face counts when most frames show
    one; otherwise the saliency subject of the median frame is used. Sharpness and
    clipping are medians. The first sample is the shot's middle frame."""
    with_face = [k for k in samples if k.faces]
    if 2 * len(with_face) > len(samples):
        chosen = with_face[0]
    else:
        salient = sorted((k for k in samples if k.subject and not k.faces), key=lambda k: k.subject[0])
        chosen = salient[len(salient) // 2] if salient else samples[0]
        if chosen.faces:  # a minority face: fall back to the frame's saliency, if any
            chosen = Keyframe(chosen.shot, chosen.frame, chosen.t, [], None, None, None,
                              chosen.sharpness, chosen.clip_high, chosen.clip_low)
    return Keyframe(
        shot=chosen.shot, frame=chosen.frame, t=chosen.t, faces=chosen.faces,
        subject=chosen.subject, subject_box=chosen.subject_box, subject_source=chosen.subject_source,
        sharpness=float(np.median([k.sharpness for k in samples])),
        clip_high=float(np.median([k.clip_high for k in samples])),
        clip_low=float(np.median([k.clip_low for k in samples])),
        face_luma=chosen.face_luma,
    )


def extract(info: VideoInfo, shots: list[Shot]) -> VisualFeatures:
    cut_frames = [s.start for s in shots[1:]]
    boundary_needed = {i for c in cut_frames for i in range(c - 3, c + 3)}
    keyframe_of = {f: s for s in shots for f in sample_frames(s)}
    samples: dict[int, list[Keyframe]] = {}
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    window = cv2.createHanningWindow(config.SMALL_SIZE, cv2.CV_32F)

    lab, diff, ncc, stable, motion, motion_conf, luma = [], [], [], [], [], [], []
    boundary: dict[int, np.ndarray] = {}
    keyframes: list[Keyframe] = []

    cap = cv2.VideoCapture(str(info.path))
    prev = prev_mid = None
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, config.SMALL_SIZE, interpolation=cv2.INTER_AREA)
        lab.append(cv2.cvtColor(small.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab).reshape(-1, 3).mean(axis=0))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        g32 = gray.astype(np.float32)
        luma.append(float(g32.mean()))
        mid = cv2.cvtColor(cv2.resize(frame, config.STABLE_SIZE, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        if prev_mid is None:
            stable.append(1.0)
        else:
            # Black areas stay "unchanged" across any cut between two dark shots, so they don't count.
            usable = np.maximum(mid, prev_mid) >= config.DARK_LEVEL
            same = cv2.absdiff(mid, prev_mid) < config.STABLE_TAU
            stable.append(float(same[usable].mean()) if usable.mean() >= config.STABLE_MIN_VALID else float("nan"))
        prev_mid = mid
        if prev is None:
            diff.append(0.0)
            ncc.append(1.0)
            motion.append((0.0, 0.0))
            motion_conf.append(1.0)
        else:
            diff.append(float(np.mean(np.abs(g32 - prev))))
            a, b = prev - prev.mean(), g32 - g32.mean()
            denom = float(np.sqrt((a * a).sum() * (b * b).sum()))
            ncc.append(float((a * b).sum() / denom) if denom > 0 else 1.0)
            # phaseCorrelate applies the window to its inputs in place — pass copies
            (dx, dy), response = cv2.phaseCorrelate(prev.copy(), g32.copy(), window)
            motion.append((dx, dy))
            motion_conf.append(float(response))
        if i in boundary_needed:
            boundary[i] = gray
        if i in keyframe_of:
            shot = keyframe_of[i]
            samples.setdefault(shot.index, []).append(analyze_keyframe(frame, shot, i, cascade))
        prev = g32
        i += 1
    cap.release()

    # The container's frame count can be approximate; trust what was decoded.
    shots[:] = [s for s in shots if s.start < i] or [Shot(0, 0, i, info.fps)]
    shots[-1].end = i
    info.n_frames = i
    info.duration = i / info.fps
    for s in shots:
        if s.index in samples:
            order = {f: n for n, f in enumerate(sample_frames(s))}
            keyframes.append(combine_keyframes(sorted(samples[s.index], key=lambda k: order.get(k.frame, len(order)))))

    return VisualFeatures(
        info=info,
        shots=shots,
        lab=np.array(lab, dtype=np.float64),
        diff=np.array(diff, dtype=np.float64),
        ncc=np.array(ncc, dtype=np.float64),
        stable=np.array(stable, dtype=np.float64),
        motion=np.array(motion, dtype=np.float64),
        motion_conf=np.array(motion_conf, dtype=np.float64),
        luma=np.array(luma, dtype=np.float64),
        boundary=boundary,
        keyframes=keyframes,
    )
