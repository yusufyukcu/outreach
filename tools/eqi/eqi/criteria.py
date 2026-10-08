"""K1–K5: issue detection from measured features and transparent 0–100 scoring.

Each criterion score is a pure function of its issues plus a fixed count of
opportunities (cuts, minutes, shots), so it can be recomputed after the AI
review changes how much an issue counts."""

from dataclasses import dataclass, field
from math import log2

import cv2
import numpy as np
from skimage.color import deltaE_ciede2000

from . import config
from .audio import AudioFeatures
from .features import Shot, VisualFeatures


@dataclass
class Issue:
    id: str
    criterion: str
    kind: str
    t: float
    t_end: float
    severity: float
    detail: dict = field(default_factory=dict)
    verdict: str | None = None      # set by the AI review: error | intentional | false_positive
    note: str | None = None
    ai_review: dict | None = None   # the model's own verdict, confidence and observation

    def effective(self, use_verdict: bool) -> float:
        if use_verdict and self.verdict:
            return self.severity * config.VERDICT_FACTOR.get(self.verdict, 1.0)
        return self.severity


@dataclass
class Assessment:
    criterion: str
    issues: list[Issue]
    context: dict
    available: bool = True

    def score(self, use_verdict: bool = False) -> float | None:
        if not self.available:
            return None
        return round(SCORERS[self.criterion](self.issues, self.context, use_verdict), 1)


def _add(issues: list[Issue], criterion: str, kind: str, t: float, t_end: float, detail: dict, scale: float = 1.0):
    severity = round(min(1.0, config.SEVERITY[kind] * scale), 3)
    issues.append(Issue(f"{criterion}-{len(issues) + 1}", criterion, kind, round(t, 3), round(t_end, 3), severity, detail))


def _sum(issues: list[Issue], kinds: set[str], use_verdict: bool) -> float:
    return sum(i.effective(use_verdict) for i in issues if i.kind in kinds)


def _robust_z(x: np.ndarray, baseline: np.ndarray | None = None) -> np.ndarray:
    """Robust z-score of x against the median and MAD of `baseline` (default: x)."""
    ref = x if baseline is None else baseline
    med = np.median(ref)
    mad = 1.4826 * np.median(np.abs(ref - med))
    return (x - med) / (mad + 1e-6)


def weighted_quantile(values, weights, q: float = 0.5, band: float = 0.10) -> float:
    """Weighted quantile, averaged over the band q ± `band` of the total weight. It
    depends only on how much weight each value carries, so splitting a weight into
    parts with the same value changes nothing; it moves continuously when a value or
    a weight changes (the plain median jumps to the neighbouring value when one is
    added); and a value that covers the whole band is returned as is."""
    v, w = np.asarray(values, float), np.asarray(weights, float)
    if v.size == 0 or w.sum() <= 0:
        return float("nan")
    order = np.argsort(v)
    v, w = v[order], w[order] / w.sum()
    upper = np.cumsum(w)
    lower = upper - w
    lo, hi = max(0.0, q - band), min(1.0, q + band)
    overlap = np.clip(np.minimum(upper, hi) - np.maximum(lower, lo), 0.0, None)
    return float(np.sum(overlap * v) / np.sum(overlap))


def shot_weights(lengths) -> np.ndarray:
    """Weight of each shot in a video's reference statistics: its length, but at most
    the video's median shot length. A long take is one grading or framing decision
    like any other shot, so its length cannot make it the reference and hide its own
    mismatch (plain screen-time weights do); a fragment shorter than a typical shot
    (a split shot, the rest of a cut-up shot) counts only for its share, so it moves
    the statistics far less than a full vote would."""
    lengths = np.asarray(lengths, float)
    return np.minimum(lengths, np.median(lengths)) if lengths.size else lengths


def _ramp(distance: float, full: float) -> float:
    """Severity scale beyond a threshold: 0 at the threshold, 1 at `full` past it."""
    return float(min(1.0, max(0.0, distance / full))) if full > 0 else 1.0


def _moving_average(x: np.ndarray, window: int) -> np.ndarray:
    window = max(1, min(window, x.size))
    pad = window // 2
    padded = np.pad(x, (pad, window - 1 - pad), mode="edge")
    return np.convolve(padded, np.ones(window) / window, mode="valid")


def _mean_flow(a: np.ndarray | None, b: np.ndarray | None) -> np.ndarray | None:
    if a is None or b is None:
        return None
    flow = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    return flow.reshape(-1, 2).mean(axis=0)


# ── K1 Cut & transition smoothness ───────────────────────────────────────────

def _lighting_change(before: np.ndarray, after: np.ndarray) -> bool:
    """A change of light (a lamp switched on, a muzzle flash, an explosion lighting the
    scene) moves the pixel values one way. A jump cut displaces the picture, so some
    pixels get brighter and others darker: |mean Δ| stays well below mean |Δ|."""
    d = after.astype(np.float32) - before.astype(np.float32)
    return abs(float(d.mean())) >= config.LIGHTING_ONE_WAY * float(np.abs(d).mean())


def _lighting_step(f: VisualFeatures, frame: int) -> bool:
    """_lighting_change from the per-frame means, for a spike inside a shot."""
    if f.luma.size <= frame or frame < 1 or f.diff[frame] <= 0:
        return False
    return abs(f.luma[frame] - f.luma[frame - 1]) >= config.LIGHTING_ONE_WAY * f.diff[frame]


def _after_freeze(f: VisualFeatures, frame: int) -> bool:
    """The picture stood still (a freeze frame) right before: when it moves again it jumps
    to where the action has got to. That jump belongs to the freeze, which K2 counts as
    dead air, not to a cut."""
    k = max(3, round(config.FREEZE_BEFORE_S * f.info.fps))
    before = f.diff[max(1, frame - k):frame]
    return before.size >= 3 and float(np.median(before)) < config.FROZEN_DIFF


def _leaves_neighbours(f: VisualFeatures, shot) -> bool:
    """A flash frame is a picture of its own (a white or black frame, a stray frame of
    another shot): its pixels leave the range spanned by the frames before and after
    it. A frame that lies between them is a step of a transition (a lamp switching on,
    a one-frame dissolve), not a flash. Undecidable without the frames: a flash."""
    before, after = f.boundary.get(shot.start - 1), f.boundary.get(shot.end)
    inside = [f.boundary.get(n) for n in range(shot.start, shot.end)]
    if before is None or after is None or any(x is None for x in inside):
        return True
    lo = np.minimum(before, after).astype(np.float32) - config.STABLE_TAU
    hi = np.maximum(before, after).astype(np.float32) + config.STABLE_TAU
    share = max(float(((x.astype(np.float32) < lo) | (x.astype(np.float32) > hi)).mean()) for x in inside)
    return share >= config.FLASH_OUTSIDE_MIN


def assess_cuts(f: VisualFeatures) -> Assessment:
    fps, shots, issues = f.info.fps, f.shots, []
    after_flash: set[int] = set()

    for k in range(1, len(shots)):
        c = shots[k].start
        t = c / fps
        if c in after_flash:
            continue
        if shots[k].length <= config.FLASH_MAX_FRAMES and k < len(shots) - 1:
            after_flash.add(shots[k + 1].start)
            if _leaves_neighbours(f, shots[k]):
                _add(issues, "cuts", "flash_frame", t, shots[k].t1, {"frames": shots[k].length})
            continue  # otherwise a step of a lighting change or of a quick transition

        if shots[k].gradual:
            continue  # inside a dissolve neighbouring frames are mixes: no jump-cut or motion test
        lo, hi = config.JUMP_CUT_STABLE
        if lo <= f.stable[c] < hi:
            before, after = f.boundary.get(c - 1), f.boundary.get(c)
            light = before is not None and after is not None and _lighting_change(before, after)
            if not light and not _after_freeze(f, c):
                _add(issues, "cuts", "jump_cut", t, t, {"unchanged_pixels": round(float(f.stable[c]), 3), "detected_cut": True})
            continue

        v_before = _mean_flow(f.boundary.get(c - 2), f.boundary.get(c - 1))
        v_after = _mean_flow(f.boundary.get(c), f.boundary.get(c + 1))
        if v_before is not None and v_after is not None:
            na, nb = np.linalg.norm(v_before), np.linalg.norm(v_after)
            if na > config.MOTION_MIN and nb > config.MOTION_MIN:
                cos = float(v_before @ v_after / (na * nb))
                if cos < config.MOTION_CLASH_COS:
                    _add(issues, "cuts", "motion_clash", t, t, {"cos": round(cos, 2), "flow_before": v_before.round(2).tolist(), "flow_after": v_after.round(2).tolist()})

    # Jump cuts the shot detector missed: a frame-difference spike inside a shot
    # while the layout stays similar (the same scene with a piece removed).
    hidden = 0
    for s in shots:
        lo, hi = s.start + 2, s.end - 2
        if hi - lo < 5:
            continue
        diffs = f.diff[lo:hi]
        # A frozen stretch (dead air, a freeze frame) would shrink the shot's typical
        # change to nearly 0 and make every ordinary movement after it look like a jump.
        moving = diffs >= config.FROZEN_DIFF
        z = _robust_z(diffs, diffs[moving] if moving.sum() >= 5 else None)
        last = -10
        for j in np.flatnonzero((z > min(config.HIDDEN_JUMP_Z, config.MOTION_JUMP_Z)) & (diffs > config.HIDDEN_JUMP_MIN_DIFF)):
            frame = lo + int(j)
            neighbours = max(f.diff[frame - 1], f.diff[frame + 1])
            if frame - last < 5 or f.diff[frame] < config.HIDDEN_JUMP_ISOLATION * neighbours:
                continue
            if _lighting_step(f, frame) or _after_freeze(f, frame):
                continue  # the light changed, or a freeze frame ended: the picture did not jump
            # Same view with a piece removed: the background stays, or (in a panning shot)
            # the whole picture jumps by a reliably measured translation. Written as
            # "not ≥" so that an undefined ratio (dark frame, NaN) also rejects.
            before = f.motion[max(s.start + 1, frame - 5):frame]
            motion_jump = float(np.linalg.norm(f.motion[frame] - np.median(before, axis=0))) if len(before) else 0.0
            panned = f.motion_conf[frame] >= config.MOTION_JUMP_MIN_CONF and motion_jump >= config.MOTION_JUMP_PX
            kept = f.stable[frame] >= config.HIDDEN_JUMP_MIN_STABLE and z[j] > config.HIDDEN_JUMP_Z
            # A moving shot varies more, so its spike stands out less; the measured jump
            # of the whole picture is the stronger evidence there.
            if not (kept or (panned and z[j] > config.MOTION_JUMP_Z)):
                continue
            last = frame
            hidden += 1
            _add(issues, "cuts", "jump_cut", frame / fps, frame / fps,
                 {"diff": round(float(f.diff[frame]), 2), "z": round(float(z[j]), 1),
                  "unchanged_pixels": round(float(f.stable[frame]), 3), "motion_jump_px": round(motion_jump, 1),
                  "detected_cut": False})

    n_cuts = len(shots) - 1 + hidden
    mark_cut_style(issues, n_cuts)
    return Assessment("cuts", issues, {"n_cuts": n_cuts, "minutes": max(f.info.duration / 60.0, 1 / 60)})


def mark_cut_style(issues: list[Issue], n_cuts: int) -> None:
    """A device used again and again is the video's technique (a vlog's jump cuts, a
    trailer's burst of cuts, a music video's strobe): reported, but not counted against
    K1. An isolated one is a slip (see CUT_STYLE_* in config)."""
    for kind in ("flash_frame", "jump_cut", "motion_clash"):
        same = [i for i in issues if i.kind == kind]
        by_share = len(same) >= config.CUT_STYLE_MIN and len(same) >= config.CUT_STYLE_SHARE * n_cuts
        by_repeats = kind != "flash_frame" and len(same) >= config.CUT_STYLE_REPEATS
        if by_share or by_repeats:
            for i in same:
                i.detail["style"] = f"{kind} on {len(same)} of {n_cuts} cuts"
                i.severity = 0.0


def score_cuts(issues, ctx, use_verdict):
    if ctx["n_cuts"] == 0:
        return config.NO_EVIDENCE_SCORE  # no cut: nothing shows how well it is cut
    per_minute = _sum(issues, {"flash_frame", "jump_cut", "motion_clash"}, use_verdict) / ctx["minutes"]
    return 100.0 * max(0.0, 1.0 - per_minute / config.ERRORS_FULL_PER_MIN)


# ── K2 Pacing & temporal rhythm ──────────────────────────────────────────────

def _asl_score(asl: float) -> float:
    lo, hi = config.ASL_GOOD_RANGE
    if asl < lo:
        return 100.0 * max(0.0, 1.0 - log2(lo / asl))
    if asl > hi:
        return 100.0 * max(0.0, 1.0 - log2(asl / hi) / 2.0)
    return 100.0


def _continuous_spans(f: VisualFeatures) -> list[tuple[int, int]]:
    """Shot spans for pacing and colour. A flash frame inside one continuous shot (the
    pictures on either side match) does not split it: the flash is K1's business, and
    splitting would make a long static shot look better paced or shift the colour
    statistics."""
    spans, join_next = [], False
    for k, s in enumerate(f.shots):
        if join_next:
            spans[-1], join_next = (spans[-1][0], s.end), False
            continue
        before, after = f.boundary.get(s.start - 1), f.boundary.get(s.end)
        if (spans and k < len(f.shots) - 1 and s.length <= config.FLASH_MAX_FRAMES
                and before is not None and after is not None
                and float(np.mean(np.abs(before.astype(np.float32) - after.astype(np.float32)))) < config.FLASH_SAME_SHOT_DIFF):
            spans[-1], join_next = (spans[-1][0], s.end), True
            continue
        spans.append((s.start, s.end))
    return spans


def assess_pacing(f: VisualFeatures, a: AudioFeatures) -> Assessment:
    fps, issues = f.info.fps, []
    spans = _continuous_spans(f)
    lengths = np.array([(b - a0) / fps for a0, b in spans])
    asl = float(lengths.mean())
    flash = np.zeros(len(f.diff), bool)
    for s in f.shots:
        if s.length <= config.FLASH_MAX_FRAMES:
            flash[s.start:min(s.end + 1, len(flash))] = True  # the flash and the frame after it

    n_frames, edge = len(f.diff), round(config.CARD_EDGE_S * fps)
    for t0, t1 in a.silence_runs:
        if t1 <= config.LEAD_IN_OUT_S or t0 >= f.info.duration - config.LEAD_IN_OUT_S:
            continue  # silent black lead-in or tail of the export
        n0, n1 = int(t0 * fps), min(int(t1 * fps), n_frames)
        # Title and end cards are pictures of their own: a silence that opens the video
        # up to a cut (at most CARD_EDGE_S after the sound starts), or closes it from a
        # cut (at most CARD_EDGE_S before the sound stops), is a card, not a pause in the
        # programme. A shot that freezes and runs silent to the end has no such cut.
        if n0 <= edge:
            cards = [c for c, _ in spans[1:] if c <= n1 + edge]
            if cards:
                n0 = max(n0, cards[-1])
        if n1 >= n_frames - edge:
            cards = [c for c, _ in spans[1:] if c >= n0 - edge]
            if cards:
                n1 = min(n1, cards[0])
        if (n1 - n0) / fps < config.DEAD_AIR_MIN_S:
            continue
        # Median: a single bright frame inside a frozen, silent stretch must not hide it
        if n1 - n0 > 1 and float(np.median(f.diff[n0 + 1:n1])) < config.STATIC_DIFF:
            # Longer dead air is worse: half severity at the minimum length, full at twice it.
            seconds = (n1 - n0) / fps
            _add(issues, "pacing", "dead_air", n0 / fps, n1 / fps, {"seconds": round(seconds, 2)},
                 scale=seconds / (2 * config.DEAD_AIR_MIN_S))
    for a0, b in spans:
        inside = f.diff[a0 + 1:b][~flash[a0 + 1:b]]
        if (b - a0) / fps >= config.LONG_STATIC_SHOT_S and inside.size and float(inside.mean()) < config.STATIC_DIFF:
            _add(issues, "pacing", "long_static_shot", a0 / fps, b / fps, {"seconds": round((b - a0) / fps, 1)})

    ctx = {
        "minutes": max(f.info.duration / 60.0, 1 / 60),
        "asl_s": round(asl, 2),
        "shot_length_cv": round(float(lengths.std() / asl), 3) if asl > 0 else 0.0,
        "asl_score": round(_asl_score(asl), 1),
        "music_driven": a.music_driven,
        "beat_score": None,
    }

    cuts = np.array([a0 / fps for a0, _ in spans[1:]])
    if a.music_driven and cuts.size >= 3 and a.beats.size >= 4:
        nearest = np.abs(cuts[:, None] - a.beats[None, :]).min(axis=1)
        on_beat = float(np.mean(nearest <= config.BEAT_TOLERANCE_S))
        period = float(np.median(np.diff(a.beats)))
        chance = min(1.0, 2 * config.BEAT_TOLERANCE_S / period) if period > 0 else 1.0
        lift = (on_beat - chance) / (1 - chance) if chance < 1 else 0.0
        ctx.update({
            "on_beat_ratio": round(on_beat, 3),
            "on_beat_chance": round(chance, 3),
            "tempo_bpm": round(a.tempo, 1),
            "beat_score": round(100.0 * min(1.0, max(0.0, 0.5 + 0.5 * lift)), 1),
        })
    return Assessment("pacing", issues, ctx)


def score_pacing(issues, ctx, use_verdict):
    rate = _sum(issues, {"dead_air", "long_static_shot"}, use_verdict) / ctx["minutes"]
    parts = {
        "dead_air": 100.0 * max(0.0, 1.0 - rate / config.ERRORS_FULL_PER_MIN),
        "asl": ctx["asl_score"],
        "beat": ctx["beat_score"],
    }
    weights = {k: w for k, w in config.PACING_SUBWEIGHTS.items() if parts[k] is not None}
    return sum(parts[k] * w for k, w in weights.items()) / sum(weights.values())


# ── K3 Color & lighting consistency ──────────────────────────────────────────

def grade_statistics(lab: np.ndarray, lengths) -> tuple[np.ndarray, np.ndarray, float]:
    """The video's dominant grade, each shot's CIEDE2000 distance to it and the outlier
    threshold (median + K·MAD of those distances, at least COLOR_JUMP_MIN_DE), all with
    shot weights (see shot_weights)."""
    weights = shot_weights(lengths)
    reference = np.array([weighted_quantile(lab[:, c], weights) for c in range(3)])
    deviation = deltaE_ciede2000(lab, np.broadcast_to(reference, lab.shape))
    med = weighted_quantile(deviation, weights)
    spread = 1.4826 * weighted_quantile(np.abs(deviation - med), weights)
    return reference, deviation, max(config.COLOR_JUMP_MIN_DE, med + config.COLOR_JUMP_MAD_K * spread)


def assess_color(f: VisualFeatures) -> Assessment:
    fps, issues = f.info.fps, []
    # Flash frames are K1's business; compare the shots on either side of them instead.
    spans = [Shot(i, a, b, fps) for i, (a, b) in enumerate(_continuous_spans(f))]
    shots = [s for s in spans if s.length / fps >= config.KEYFRAME_MIN_SHOT_S] or spans
    shot_lab = []
    for s in shots:
        lo, hi = (s.start + 2, s.end - 2) if s.length >= 5 else (s.start, s.end)
        shot_lab.append(np.median(f.lab[lo:hi], axis=0))
    shot_lab = np.array(shot_lab)

    # A mismatched shot (e.g. one camera graded differently) stands out against the
    # video's dominant grade. Comparing with that reference, rather than adjacent
    # pairs, keeps one bad shot from contaminating two of only a few pairs.
    # A dip to black has no grade: it is neither a reference nor a mismatch.
    graded = [k for k in range(len(shots)) if shot_lab[k][0] >= config.BLACK_SHOT_L]
    flagged = set()
    if len(graded) >= 2:
        lab = shot_lab[graded]
        reference, deviation, threshold = grade_statistics(lab, [shots[k].length for k in graded])
        for n in np.flatnonzero(deviation > threshold):
            k = graded[n]
            scale = _ramp(float(deviation[n]) - threshold, (config.COLOR_JUMP_FULL_AT - 1) * threshold)
            if scale < config.REPORT_MIN_SCALE:
                continue  # at the threshold: within the jitter of encoding and shot detection
            neighbours = [lab[j] for j in (n - 1, n + 1) if 0 <= j < len(graded)]
            jump = max(float(deltaE_ciede2000(lab[n], m)) for m in neighbours)
            if jump < config.COLOR_JUMP_MIN_DE:
                continue  # drifts gradually, no visible jump at its cuts
            flagged.add(int(k))
            _add(issues, "color", "color_jump", shots[k].t0, shots[k].t1, {
                "delta_e2000_vs_grade": round(float(deviation[n]), 2), "threshold": round(threshold, 2),
                "delta_e2000_vs_neighbour": round(jump, 2),
                "lab_shot": shot_lab[k].round(1).tolist(), "lab_grade": reference.round(1).tolist(),
            }, scale=scale)

    # Videos whose shots vary a lot (a montage) hide a mismatch from the grade test.
    # Inside a scene the giveaway is a tint (white balance) that differs from both
    # neighbouring shots while those two agree. Lightness is left out: exposure and
    # content change it from shot to shot, a camera or grade mismatch shifts the tint.
    # Near-black shots (a dip to black between soundbites) carry no tint: compare
    # each lit shot with the nearest lit shots on either side.
    lit = [k for k in range(len(shots)) if shot_lab[k][0] >= config.TINT_MIN_L]
    for p, k, q in zip(lit, lit[1:], lit[2:]):
        a, b, c = shot_lab[p], shot_lab[k], shot_lab[q]
        if k in flagged:
            continue
        to_prev, to_next = float(np.linalg.norm(b[1:] - a[1:])), float(np.linalg.norm(b[1:] - c[1:]))
        between = float(np.linalg.norm(a[1:] - c[1:]))
        if min(to_prev, to_next) >= config.TINT_JUMP_AB and between <= config.TINT_NEIGHBOUR_AB:
            _add(issues, "color", "color_jump", shots[k].t0, shots[k].t1, {
                "tint_shift_ab": round(min(to_prev, to_next), 1), "neighbours_tint_ab": round(between, 1),
                "lab_shot": b.round(1).tolist(), "lab_neighbours": [a.round(1).tolist(), c.round(1).tolist()],
            })

    window = int(fps // 2) | 1
    for s in f.shots:
        if s.length >= fps:
            L = f.lab[s.start + 2:s.end - 2, 0]
            if L.size >= window:
                jitter = float(np.std(L - _moving_average(L, window)))
                if jitter > config.FLICKER_STD_L:
                    _add(issues, "color", "flicker", s.t0, s.t1, {"l_std": round(jitter, 2)})
    for k in f.keyframes:
        s = f.shots[k.shot]
        if s.length / fps < config.KEYFRAME_MIN_SHOT_S or k.clip_low > config.BLACK_FRAME_FRAC:
            continue  # flash frames are K1's; an all-black shot is a dip to black
        if k.clip_high > config.OVEREXPOSED_FRAC:
            _add(issues, "color", "overexposed", s.t0, s.t1, {"clipped_high": round(k.clip_high, 3)})
        if k.clip_low > config.UNDEREXPOSED_FRAC and not (k.face_luma or 0) >= config.EXPOSED_FACE_LUMA:
            _add(issues, "color", "underexposed", s.t0, s.t1, {"clipped_low": round(k.clip_low, 3)})

    return Assessment("color", issues, {"n_shots": len(spans), "n_graded": len(graded)})


def score_color(issues, ctx, use_verdict):
    mismatch_rate = _sum(issues, {"color_jump"}, use_verdict) / ctx["n_shots"]
    shot_rate = _sum(issues, {"flicker", "overexposed", "underexposed"}, use_verdict) / ctx["n_shots"]
    score = 100.0 * max(0.0, 1.0 - config.COLOR_PENALTY_SCALE * (0.7 * mismatch_rate + 0.3 * shot_rate))
    if ctx.get("n_graded", 2) < 2:  # one lit shot: shot-to-shot colour matching cannot be observed
        score = min(score, config.NO_EVIDENCE_SCORE)
    return score


# ── K4 Audio-visual balance ──────────────────────────────────────────────────

def assess_audio(a: AudioFeatures, duration: float) -> Assessment:
    if not a.has_audio or a.loudness is None:
        return Assessment("audio", [], {"has_audio": False}, available=False)
    L, issues = a.loudness, []

    lo, hi = config.LOUDNESS_TARGET_RANGE_LUFS
    off = max(lo - L.integrated, L.integrated - hi, 0.0)  # distance from the accepted delivery levels
    if np.isfinite(L.integrated) and off > config.LOUDNESS_TOLERANCE_LU:
        _add(issues, "audio", "loudness_level", 0.0, duration,
             {"integrated_lufs": L.integrated, "target_range_lufs": list(config.LOUDNESS_TARGET_RANGE_LUFS)},
             scale=(off - config.LOUDNESS_TOLERANCE_LU) / config.LOUDNESS_FULL_PENALTY_LU)
    if np.isfinite(L.true_peak) and L.true_peak > config.TRUE_PEAK_MAX_DBTP:
        _add(issues, "audio", "true_peak", 0.0, duration, {"true_peak_dbtp": L.true_peak})
    if np.isfinite(L.lra) and L.lra > config.LRA_MAX_LU:
        _add(issues, "audio", "loudness_range", 0.0, duration, {"lra_lu": L.lra})

    if L.momentary.size > 1:
        step = float(np.median(np.diff(L.times))) or 0.1
        lag = max(1, round(config.LOUDNESS_JUMP_WINDOW_S / step))
        m = L.momentary
        # Compare with the level of the seconds before (short-term loudness), so that
        # speech after a pause is not a jump; momentary where no 3 s window exists yet
        before = (np.where(L.short_term > config.LOUDNESS_CONTEXT_MIN_LUFS, L.short_term, m)
                  if L.short_term.size == m.size else m)
        last_t = -10.0
        for i in range(lag, m.size):
            rise = m[i] - before[i - lag]
            if rise >= config.LOUDNESS_JUMP_LU and before[i - lag] > config.LOUDNESS_JUMP_FLOOR_LUFS and L.times[i] - last_t > 1.0:
                last_t = float(L.times[i])
                _add(issues, "audio", "loudness_jump", L.times[i - lag], L.times[i], {"rise_lu": round(float(rise), 1)})

    # Loud moments that recur through the video are its sound design (a trailer's hits,
    # laughter in a vlog), as a recurring cut device is a technique: reported, not counted.
    jumps = [i for i in issues if i.kind == "loudness_jump"]
    if len(jumps) >= config.LOUDNESS_STYLE_REPEATS:
        for i in jumps:
            i.detail["style"] = f"loudness_jump {len(jumps)} times"
            i.severity = 0.0

    ctx = {"has_audio": True, "minutes": max(duration / 60.0, 1 / 60),
           "integrated_lufs": L.integrated, "lra_lu": L.lra, "true_peak_dbtp": L.true_peak}
    return Assessment("audio", issues, ctx)


def score_audio(issues, ctx, use_verdict):
    global_penalty = _sum(issues, {"loudness_level", "true_peak", "loudness_range"}, use_verdict)
    jump_rate = _sum(issues, {"loudness_jump"}, use_verdict) / ctx["minutes"]
    jump_penalty = min(1.0, jump_rate / config.ERRORS_FULL_PER_MIN)
    return 100.0 * max(0.0, 1.0 - config.AUDIO_GLOBAL_WEIGHT * global_penalty - config.AUDIO_JUMP_WEIGHT * jump_penalty)


# ── K5 Framing & composition ─────────────────────────────────────────────────

def assess_framing(f: VisualFeatures) -> Assessment:
    fps, issues = f.info.fps, []
    # The video's typical sharpness, from lit shots (flash frames are K1's), with shot
    # weights (see shot_weights) so that one long soft shot cannot set the norm
    lit = [(k.sharpness, f.shots[k.shot].length) for k in f.keyframes
           if k.clip_low <= config.DARK_FRAME_FRAC and f.shots[k.shot].length / fps >= config.KEYFRAME_MIN_SHOT_S]
    soft_threshold = 0.0
    if lit:
        sharpness, lengths = zip(*lit)
        soft_threshold = config.SHARPNESS_REL * weighted_quantile(sharpness, shot_weights(lengths))

    for k in f.keyframes:
        s = f.shots[k.shot]
        if s.length / fps < config.KEYFRAME_MIN_SHOT_S or k.clip_low > config.BLACK_FRAME_FRAC:
            continue  # flash frames are K1's; an all-black shot has nothing to frame
        face = k.subject_source == "face"
        # Saliency is a weaker cue than a detected face, so its findings count half.
        cue = 1.0 if face else 0.5
        cut_off = False
        if k.subject_box:
            x, y, w, h = k.subject_box
            m = config.EDGE_MARGIN
            # A salient region touching top/bottom is often sky or floor, so only sides count for it.
            cut_off = x < m or x + w > 1 - m or (face and y < m)
            if cut_off:
                _add(issues, "framing", "subject_cut_off", s.t0, s.t1,
                     {"subject_box": [round(v, 3) for v in k.subject_box], "source": k.subject_source}, scale=cue)
            elif face and y + h / 2 > config.HEADROOM_MAX_CENTER_Y:
                _add(issues, "framing", "headroom", s.t0, s.t1, {"face_center_y": round(y + h / 2, 3)})
        if k.subject and not cut_off:
            x = k.subject[0]
            distance = min(abs(x - 0.5), abs(x - 1 / 3), abs(x - 2 / 3))
            if distance > config.PLACEMENT_TOLERANCE:
                _add(issues, "framing", "placement", s.t0, s.t1,
                     {"subject_x": round(x, 3), "source": k.subject_source}, scale=cue)
        # Softness relative to the video's own lit shots; meaningless in a mostly black frame
        if k.clip_low <= config.DARK_FRAME_FRAC and k.sharpness < soft_threshold:
            scale = _ramp(soft_threshold - k.sharpness, (1 - config.SOFT_FULL_AT) * soft_threshold)
            if scale >= config.REPORT_MIN_SCALE:
                _add(issues, "framing", "soft_focus", s.t0, s.t1,
                     {"sharpness": round(k.sharpness, 1), "threshold": round(soft_threshold, 1)}, scale=scale)

    for s in f.shots:
        lo, hi = s.start + 2, s.end - 2
        if hi - lo >= max(5, int(fps // 2)):
            # Fast action and dark frames give untrustworthy motion estimates; judge
            # shake only from trusted frames, and not at all when too few are trusted.
            trusted = f.motion_conf[lo:hi] >= config.MOTION_MIN_CONF
            if trusted.mean() < config.SHAKE_MIN_RELIABLE:
                continue
            motion = f.motion[lo:hi].copy()
            idx = np.arange(len(motion))
            for i in range(2):
                motion[~trusted, i] = np.interp(idx[~trusted], idx[trusted], motion[trusted, i])
            window = int(fps // 4) | 1
            residual = np.column_stack([motion[:, i] - _moving_average(motion[:, i], window) for i in range(2)])
            # Trimmed RMS: shake is sustained, while a single jump — e.g. the end of a
            # freeze — is a rare outlier that must not read as a shaky shot.
            norms = np.sort(np.linalg.norm(residual[trusted], axis=1))
            kept = norms[:max(1, int(len(norms) * 0.95))]
            jitter = float(np.sqrt(np.mean(kept ** 2)))
            if jitter > config.SHAKE_JITTER_PX:
                _add(issues, "framing", "shaky", s.t0, s.t1, {"jitter_px": round(jitter, 2)},
                     scale=jitter / (2 * config.SHAKE_JITTER_PX))

    return Assessment("framing", issues, {"n_shots": len(_continuous_spans(f))})  # a flash does not add a shot


def score_framing(issues, ctx, use_verdict):
    per_shot: dict[float, float] = {}
    for i in issues:
        per_shot[i.t] = min(1.0, per_shot.get(i.t, 0.0) + i.effective(use_verdict))
    mean_penalty = sum(per_shot.values()) / ctx["n_shots"]
    return 100.0 * max(0.0, 1.0 - config.FRAMING_PENALTY_SCALE * mean_penalty)


SCORERS = {
    "cuts": score_cuts,
    "pacing": score_pacing,
    "color": score_color,
    "audio": score_audio,
    "framing": score_framing,
}


def assess_all(f: VisualFeatures, a: AudioFeatures) -> dict[str, Assessment]:
    return {
        "cuts": assess_cuts(f),
        "pacing": assess_pacing(f, a),
        "color": assess_color(f),
        "audio": assess_audio(a, f.info.duration),
        "framing": assess_framing(f),
    }
