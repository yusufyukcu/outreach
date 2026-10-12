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
from .features import Keyframe, Shot, VisualFeatures, combine_keyframes
from .videotype import VideoType, classify


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


def _add(issues: list[Issue], criterion: str, kind: str, t: float, t_end: float, detail: dict, scale: float = 1.0,
         cap: float = 1.0):
    severity = round(min(cap, config.SEVERITY[kind] * scale), 3)
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


def viewing_minutes(duration_s: float) -> float:
    """Minutes over which event errors are counted, at least MIN_VIEWING_MINUTES."""
    return max(duration_s / 60.0, config.MIN_VIEWING_MINUTES)


def _camera_only(f: VisualFeatures) -> VideoType:
    """The type assumed when none is given: every shot camera footage, not a montage
    (the checks then run everywhere, as they did before video types)."""
    return VideoType(label="unknown", designed_share=0.0, music_montage=False, music_driven=False,
                     average_shot_s=0.0, cuts_per_min=0.0, face_share=0.0, white_background=False, strong_share=0.0)


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


def assess_cuts(f: VisualFeatures, vt: VideoType | None = None) -> Assessment:
    fps, shots, issues = f.info.fps, f.shots, []
    vt = vt or _camera_only(f)
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
                if vt.music_montage:
                    # Cut to music at a quick pace, a one- or two-frame shot is part of the
                    # rhythm (a flash cut on the music), not a frame left over from a trim
                    issues[-1].detail["style"] = "flash in a montage cut to music"
                    issues[-1].severity = 0.0
            continue  # otherwise a step of a lighting change or of a quick transition

        if shots[k].gradual:
            continue  # inside a dissolve neighbouring frames are mixes: no jump-cut or motion test
        if vt.shot_designed(shots[k - 1].index) or vt.shot_designed(shots[k].index):
            continue  # a slide, screen or graphic keeps its layout by design: no jump-cut or motion test
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
        if hi - lo < 5 or vt.shot_designed(s.index):
            continue  # in a screen capture or animation new content appears in a jump by design
        diffs = f.diff[lo:hi]
        # A frozen stretch (dead air, a freeze frame) would shrink the shot's typical
        # change to nearly 0 and make every ordinary movement after it look like a jump.
        moving = diffs >= config.FROZEN_DIFF
        z = _robust_z(diffs, diffs[moving] if moving.sum() >= 5 else None)
        last = -10
        found = []
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
            found.append((frame, {"diff": round(float(f.diff[frame]), 2), "z": round(float(z[j]), 1),
                                  "unchanged_pixels": round(float(f.stable[frame]), 3), "motion_jump_px": round(motion_jump, 1),
                                  "detected_cut": False}))
        # A jump cut leaves pieces long enough to be watched. Jumps a few frames apart are
        # the footage's own cadence (frames repeated to fill a higher frame rate, a
        # timelapse, stop motion), not cuts, and in a shot that has such a cadence the
        # frame differences cannot single out a jump cut at all.
        frames = [frame for frame, _ in found]
        if any((b - a) / fps < config.JUMP_MIN_PIECE_S for a, b in zip(frames, frames[1:])):
            continue
        for frame, detail in found:
            hidden += 1
            _add(issues, "cuts", "jump_cut", frame / fps, frame / fps, detail)

    # A designed picture's change of scene without a cut is its transition: evidence too
    scenes = len(designed_scene_changes(f, vt))
    n_cuts = len(shots) - 1 + hidden + scenes
    mark_cut_style(issues, n_cuts)
    return Assessment("cuts", issues, {"n_cuts": n_cuts, "scene_changes_without_cut": scenes,
                                       "minutes": viewing_minutes(f.info.duration)})


def repetition_factor(n: int) -> float:
    """How much each of n uses of one device counts. A device used again and again is
    the video's technique (a vlog's jump cuts, a trailer's sound hits), a lone one is a
    slip, and each repeat halves the chance that any one use is a slip: n uses count
    n · 2^−(n−1) slips in total (1, 1, 0.75, 0.5, 0.31 …). One detection more or less
    then moves the score a little instead of switching between a full penalty and none."""
    return 2.0 ** -(max(n, 1) - 1)


def discount_repeats(same: list[Issue], label: str) -> None:
    factor = repetition_factor(len(same))
    if factor < 1.0:
        for i in same:
            i.detail["repeats"] = f"{label}: each counts {factor:.3g}"
            i.severity = round(i.severity * factor, 3)


def mark_cut_style(issues: list[Issue], n_cuts: int) -> None:
    """A device on a large share of the cuts is how the video is cut (a vlog cut with
    jump cuts, a music video's strobe): reported as style, not counted (see CUT_STYLE_*
    in config). Otherwise jump cuts and opposing camera motion count less the more
    often the video uses them (repetition_factor), and flash frames are a slip however
    often they occur."""
    for kind in ("flash_frame", "jump_cut", "motion_clash"):
        same = [i for i in issues if i.kind == kind]
        if len(same) >= config.CUT_STYLE_MIN and len(same) >= config.CUT_STYLE_SHARE * n_cuts:
            for i in same:
                i.detail["style"] = f"{kind} on {len(same)} of {n_cuts} cuts"
                i.severity = 0.0
        elif kind != "flash_frame":
            discount_repeats(same, f"{kind} on {len(same)} of {n_cuts} cuts")


def evidence_ceiling(n: int | None) -> float:
    """The highest score n observed opportunities can earn. A criterion the video gives
    no chance to observe (no cut, one shot) scores the scale's midpoint: no cut is no
    evidence of smooth cutting. Each opportunity that passes is evidence, so the ceiling
    rises toward 100 as they add up, EVIDENCE_PRIOR opportunities taking it halfway.
    Without this, one clean cut would be worth full marks and no cut half of them."""
    if n is None:
        return 100.0
    return config.NO_EVIDENCE_SCORE + (100.0 - config.NO_EVIDENCE_SCORE) * n / (n + config.EVIDENCE_PRIOR)


def with_evidence(score: float, n: int | None) -> float:
    """The measured score scaled to the ceiling of its evidence: a flawless video with
    little evidence reaches only the ceiling, and every measured problem still lowers
    the score below it (a cap would hide problems that cost less than the gap)."""
    return score * evidence_ceiling(n) / 100.0


def score_cuts(issues, ctx, use_verdict):
    per_minute = _sum(issues, {"flash_frame", "jump_cut", "motion_clash"}, use_verdict) / ctx["minutes"]
    score = 100.0 * max(0.0, 1.0 - per_minute / config.ERRORS_FULL_PER_MIN)
    return with_evidence(score, ctx["n_cuts"])  # few cuts: little shows how well it is cut


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


def designed_scene_changes(f: VisualFeatures, vt: VideoType) -> list[int]:
    """Frames where a designed picture changes scene without a cut: an animation pans to
    the next panel or morphs into the next scene, a screen recording opens a new window.
    The whole picture differs from a second before (SCENE_CHANGE_1S), as across a cut.
    Inside camera footage the camera's own movement does the same, so only designed
    shots are searched. Changes are at least a second apart and from the shot's ends."""
    if f.change_1s.size != f.diff.size:
        return []
    second = max(1, round(f.info.fps))
    found = []
    for s in f.shots:
        if not vt.shot_designed(s.index) or s.length < 3 * second:
            continue
        window = f.change_1s[s.start + second:s.end]   # windows that lie inside the shot
        peaks: list[int] = []
        for j in np.argsort(window)[::-1]:
            if window[j] < config.SCENE_CHANGE_1S:
                break
            frame = s.start + second + int(j) - second // 2   # the middle of the second that changed
            if s.start + second <= frame <= s.end - second and all(abs(frame - p) > second for p in peaks):
                peaks.append(frame)
        found += peaks
    return sorted(found)


def _split_at(spans: list[tuple[int, int]], frames: list[int]) -> list[tuple[int, int]]:
    out = []
    for a0, b in spans:
        inner = [c for c in frames if a0 < c < b]
        bounds = [a0, *inner, b]
        out += list(zip(bounds, bounds[1:]))
    return out


def _sound_level(a: AudioFeatures, t0: float, t1: float) -> float:
    """Median RMS level (dBFS) between t0 and t1; −inf when it was not measured."""
    inside = (a.rms_times >= t0) & (a.rms_times < t1) if a.rms_times.size else np.zeros(0, bool)
    return float(np.median(a.rms_db[inside])) if inside.any() else float("-inf")


def assess_pacing(f: VisualFeatures, a: AudioFeatures, vt: VideoType | None = None) -> Assessment:
    fps, issues = f.info.fps, []
    vt = vt or _camera_only(f)
    # An animation or screen recording changes scene without cutting: such a change paces
    # the video as a cut does
    scenes = designed_scene_changes(f, vt)
    spans = _split_at(_continuous_spans(f), scenes)
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
        if (n1 - n0) / fps < config.DEAD_AIR_MIN_S or n1 - n0 <= 1:
            continue
        # Median: a single bright frame inside a frozen, silent stretch must not hide it
        motion = float(np.median(f.diff[n0 + 1:n1]))
        if motion >= config.STATIC_DIFF:
            continue
        # Nothing for the viewer: the sound is gone while the picture stands still. A pause
        # with room tone is a pause in the programme — a speaker thinking, someone typing,
        # a still slide or screen there to be read — not dead air.
        level = _sound_level(a, n0 / fps, n1 / fps)
        if level > config.NO_SOUND_DBFS:
            continue
        # Longer dead air is worse: half severity at the minimum length, full at twice
        # it, and a longer stretch counts as that many full errors (9 s as three).
        seconds = (n1 - n0) / fps
        _add(issues, "pacing", "dead_air", n0 / fps, n1 / fps,
             {"seconds": round(seconds, 2), "level_dbfs": round(level, 1) if np.isfinite(level) else None,
              "picture": "frozen" if motion < config.FROZEN_DIFF else "still"},
             scale=seconds / (2 * config.DEAD_AIR_MIN_S), cap=config.DEAD_AIR_MAX_ERRORS)
    second = max(1, round(fps))
    for a0, b in spans:
        if (b - a0) / fps < config.LONG_STATIC_SHOT_S:
            continue
        if f.change_1s.size == f.diff.size:
            # Still as a viewer sees it: the picture a second later is (almost) the same. A
            # speaker talking, a hand drawing or a slow pan changes it; frame-to-frame
            # differences are small in all of them.
            change = float(np.median(f.change_1s[a0 + second:b]))
            static = change < config.STATIC_CHANGE_1S
        else:
            inside = f.diff[a0 + 1:b][~flash[a0 + 1:b]]
            change = float(inside.mean()) if inside.size else 0.0
            static = inside.size > 0 and change < config.STATIC_DIFF
        if static:
            _add(issues, "pacing", "long_static_shot", a0 / fps, b / fps,
                 {"seconds": round((b - a0) / fps, 1), "change": round(change, 2)})

    ctx = {
        "minutes": viewing_minutes(f.info.duration),
        "scene_changes_without_cut": len(scenes),
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


def _light_share(f: VisualFeatures, lo: int, hi: int) -> float:
    """Share of the frame changes in [lo, hi) that change the whole picture one way: the
    light, not something moving in it (see LIGHTING_ONE_WAY)."""
    if f.luma.size < hi or hi - lo < 2:
        return 1.0  # not measured: as before
    step = np.abs(np.diff(f.luma[lo - 1:hi]))
    return float(np.mean(step >= config.LIGHTING_ONE_WAY * np.maximum(f.diff[lo:hi], 1e-6)))


def assess_color(f: VisualFeatures, vt: VideoType | None = None) -> Assessment:
    fps, issues = f.info.fps, []
    vt = vt or _camera_only(f)
    # Flash frames are K1's business; compare the shots on either side of them instead.
    # Designed pictures (graphics, screens, cards) have their colours by design: only
    # camera shots are judged, and a video without any is not judged on K3.
    first_shot = {s.start: s.index for s in f.shots}
    spans = [Shot(i, a, b, fps) for i, (a, b) in enumerate(_continuous_spans(f))
             if not vt.shot_designed(first_shot.get(a, -1))]
    if not spans:
        return Assessment("color", [], {"n_shots": 0, "n_graded": 0, "camera_shots": 0}, available=False)
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
    # A montage cut to music jumps between setups and moments by design: its shots are not
    # expected to continue one grade, so shot-to-shot colour continuity is not judged there.
    continuity = not vt.music_montage
    if continuity and len(graded) >= 2:
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
    lit = [k for k in range(len(shots)) if shot_lab[k][0] >= config.TINT_MIN_L] if continuity else []
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
        if s.length >= fps and not vt.shot_designed(s.index):
            L = f.lab[s.start + 2:s.end - 2, 0]
            if L.size >= window:
                jitter = float(np.std(L - _moving_average(L, window)))
                if jitter > config.FLICKER_STD_L:
                    light = _light_share(f, s.start + 2, s.end - 2)
                    if light >= config.FLICKER_LIGHT_SHARE:  # the light flickers, not the picture moving
                        _add(issues, "color", "flicker", s.t0, s.t1, {"l_std": round(jitter, 2), "one_way_share": round(light, 2)})
    for k in f.keyframes:
        s = f.shots[k.shot]
        if s.length / fps < config.KEYFRAME_MIN_SHOT_S or k.clip_low > config.BLACK_FRAME_FRAC or vt.shot_designed(s.index):
            continue  # flash frames are K1's; an all-black shot is a dip to black; a designed picture is lit by design
        if k.clip_high > config.OVEREXPOSED_FRAC:
            _add(issues, "color", "overexposed", s.t0, s.t1, {"clipped_high": round(k.clip_high, 3)})
        if k.clip_low > config.UNDEREXPOSED_FRAC and not (k.face_luma or 0) >= config.EXPOSED_FACE_LUMA:
            _add(issues, "color", "underexposed", s.t0, s.t1, {"clipped_low": round(k.clip_low, 3)})

    return Assessment("color", issues, {"n_shots": len(spans), "n_graded": len(graded), "continuity_judged": continuity})


def score_color(issues, ctx, use_verdict):
    mismatch_rate = _sum(issues, {"color_jump"}, use_verdict) / ctx["n_shots"]
    shot_rate = _sum(issues, {"flicker", "overexposed", "underexposed"}, use_verdict) / ctx["n_shots"]
    score = 100.0 * max(0.0, 1.0 - config.COLOR_PENALTY_SCALE * (0.7 * mismatch_rate + 0.3 * shot_rate))
    # Shot-to-shot matching is observed at each transition between lit shots: one lit
    # shot shows none, a few show little
    n_graded = ctx.get("n_graded")
    return with_evidence(score, None if n_graded is None else max(n_graded - 1, 0))


# ── K4 Audio-visual balance ──────────────────────────────────────────────────

def assess_audio(a: AudioFeatures, duration: float) -> Assessment:
    if not a.has_audio or a.loudness is None:
        return Assessment("audio", [], {"has_audio": False}, available=False)
    L, issues = a.loudness, []

    # The mix as it is played: a streaming platform turns a louder mix down to its
    # reference level, so a loud master is not too loud for the viewer, but it does
    # not raise a quiet one. Only the quiet side of the delivery range is an error, and
    # the true peak is judged after the platform's gain.
    lo = config.LOUDNESS_TARGET_RANGE_LUFS[0]
    off = max(lo - L.integrated, 0.0)  # how far below the accepted delivery levels
    if np.isfinite(L.integrated) and off > config.LOUDNESS_TOLERANCE_LU:
        _add(issues, "audio", "loudness_level", 0.0, duration,
             {"integrated_lufs": L.integrated, "target_range_lufs": list(config.LOUDNESS_TARGET_RANGE_LUFS)},
             scale=(off - config.LOUDNESS_TOLERANCE_LU) / config.LOUDNESS_FULL_PENALTY_LU)
    turned_down = max(0.0, L.integrated - config.PLATFORM_LOUDNESS_LUFS) if np.isfinite(L.integrated) else 0.0
    if np.isfinite(L.true_peak) and L.true_peak - turned_down > config.TRUE_PEAK_MAX_DBTP:
        _add(issues, "audio", "true_peak", 0.0, duration,
             {"true_peak_dbtp": L.true_peak, "as_played_dbtp": round(L.true_peak - turned_down, 1)})
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
    # laughter in a vlog), as a recurring cut device is a technique: they count less the
    # more often they come.
    jumps = [i for i in issues if i.kind == "loudness_jump"]
    discount_repeats(jumps, f"loudness_jump {len(jumps)} times")

    ctx = {"has_audio": True, "minutes": viewing_minutes(duration),
           "integrated_lufs": L.integrated, "lra_lu": L.lra, "true_peak_dbtp": L.true_peak}
    return Assessment("audio", issues, ctx)


def score_audio(issues, ctx, use_verdict):
    global_penalty = _sum(issues, {"loudness_level", "true_peak", "loudness_range"}, use_verdict)
    jump_rate = _sum(issues, {"loudness_jump"}, use_verdict) / ctx["minutes"]
    jump_penalty = min(1.0, jump_rate / config.ERRORS_FULL_PER_MIN)
    return 100.0 * max(0.0, 1.0 - config.AUDIO_GLOBAL_WEIGHT * global_penalty - config.AUDIO_JUMP_WEIGHT * jump_penalty)


# ── K5 Framing & composition ─────────────────────────────────────────────────

@dataclass
class FramingUnit:
    """A stretch K5 judges as one framing decision: a shot, or a part of a long take."""
    start: int      # frames
    end: int        # exclusive
    fps: float
    key: Keyframe

    @property
    def length(self) -> int:
        return self.end - self.start

    @property
    def t0(self) -> float:
        return self.start / self.fps

    @property
    def t1(self) -> float:
        return self.end / self.fps


def framing_units(f: VisualFeatures) -> list[FramingUnit]:
    """Each shot is judged as one unit from its keyframes. A long take is judged in
    stretches of FRAMING_UNIT_S from the frames sampled through it: a handheld take
    reframes, drifts out of focus and shakes as it goes, which three frames of a
    minute-long take cannot show, and a stretch on screen as long as a typical shot
    weighs like one."""
    fps = f.info.fps
    per = max(1, round(config.FRAMING_UNIT_S / config.LONG_TAKE_SAMPLE_S))
    by_shot = {k.shot: k for k in f.keyframes}
    units = []
    for s in f.shots:
        samples = (f.take_samples or {}).get(s.index, [])
        if len(samples) >= 2 * per:
            groups = [samples[i:i + per] for i in range(0, len(samples), per)]
            if len(groups[-1]) < per:
                groups[-2:] = [groups[-2] + groups[-1]]  # a short remainder joins the stretch before it
            half = round(0.5 * config.LONG_TAKE_SAMPLE_S * fps)
            bounds = [s.start] + [g[0].frame - half for g in groups[1:]] + [s.end]
            for g, a, b in zip(groups, bounds, bounds[1:]):
                mid = len(g) // 2
                units.append(FramingUnit(a, b, fps, combine_keyframes([g[mid], *g[:mid], *g[mid + 1:]])))
        elif s.index in by_shot:
            units.append(FramingUnit(s.start, s.end, fps, by_shot[s.index]))
    return units


def assess_framing(f: VisualFeatures, vt: VideoType | None = None) -> Assessment:
    fps, issues = f.info.fps, []
    vt = vt or _camera_only(f)
    all_units = framing_units(f)
    # A designed picture is composed by design (a slide, a screen, a drawing): framing,
    # focus and steadiness are camera checks, judged on camera footage only.
    units = [u for u in all_units if not (vt.shot_designed(u.key.shot) and vt.is_designed(u.key))]
    visible = [u for u in units if u.length / fps >= config.KEYFRAME_MIN_SHOT_S and u.key.clip_low <= config.BLACK_FRAME_FRAC]
    if not visible:  # no camera picture to frame (graphics only, or black)
        return Assessment("framing", [], {"n_shots": 0, "designed_units": len(all_units) - len(units)}, available=False)
    # The video's typical sharpness, from lit shots (flash frames are K1's), with shot
    # weights (see shot_weights) so that one long soft shot cannot set the norm
    lit = [(u.key.sharpness, u.length) for u in units
           if u.key.clip_low <= config.DARK_FRAME_FRAC and u.length / fps >= config.KEYFRAME_MIN_SHOT_S]
    soft_threshold = 0.0
    if lit:
        sharpness, lengths = zip(*lit)
        soft_threshold = config.SHARPNESS_REL * weighted_quantile(sharpness, shot_weights(lengths))

    for s in units:
        k = s.key
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

    for s in units:
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

    # A flash does not add a shot; a long take adds one per stretch beyond its first;
    # designed pictures are not judged
    n_units = (len(_continuous_spans(f)) + len(all_units) - sum(1 for s in f.shots if any(u.start == s.start for u in all_units))
               - (len(all_units) - len(units)))
    return Assessment("framing", issues, {"n_shots": max(n_units, 1), "designed_units": len(all_units) - len(units)})


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


class Assessments(dict):
    """The five assessments by criterion, with the video type they were judged under."""
    video_type: VideoType | None = None


def assess_all(f: VisualFeatures, a: AudioFeatures) -> Assessments:
    vt = classify(f, a)
    out = Assessments({
        "cuts": assess_cuts(f, vt),
        "pacing": assess_pacing(f, a, vt),
        "color": assess_color(f, vt),
        "audio": assess_audio(a, f.info.duration),
        "framing": assess_framing(f, vt),
    })
    out.video_type = vt
    return out
