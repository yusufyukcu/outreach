"""Tier-1 proof: controlled edit defects with known time and severity.

Each output video is the source plus exactly one defect, written together with
a ground-truth JSON, so detection recall and the EQI drop per severity level can
be measured objectively."""

import json
import math
import random
import tempfile
from pathlib import Path

import numpy as np

from .audio import analyze as analyze_audio
from .features import analyze_keyframe, detect_shots
from .media import grab_frame, probe, run_ffmpeg

# Constant quantizer: with rate control (CRF) a defect changes how its neighbours are
# quantized. Together with an IDR frame every second (see _cfr) a defect's encoding
# ends within a second, so frames away from it stay identical to the clean reference.
ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-qp", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"]

# Severity levels per defect kind (level 1 = mild … 3 = strong)
LEVELS = {
    "jump_cut": {1: 0.4, 2: 0.8, 3: 1.5},             # seconds removed inside a moving shot
    "flash_frame": {1: 1, 2: 2},                      # white frames inserted
    "color_jump": {1: 0.10, 2: 0.20, 3: 0.30},       # warm white-balance shift on one shot (camera mismatch)
    "loudness_jump": {1: 6.0, 2: 9.0, 3: 12.0},       # dB boost for 1.5 s
    "dead_air": {1: 1.6, 2: 2.5, 3: 4.0},             # seconds of frozen picture and silence
    "bad_framing": {1: 0.20, 2: 0.30, 3: 0.40},       # crop-in that pushes the subject against the frame edge
    "shake": {1: 4, 2: 8, 3: 12},                     # jitter amplitude, px at 640 px width
}
CRITERION = {
    "jump_cut": "cuts", "flash_frame": "cuts", "color_jump": "color", "loudness_jump": "audio",
    "dead_air": "pacing", "bad_framing": "framing", "shake": "framing",
}

def make_synthetic_source(out: Path, n_shots: int = 8, shot_s: float = 5.0, size=(640, 360), fps: int = 30) -> Path:
    """Clean, consistently "graded" reference: every shot has the same base colour
    with a static, per-shot noise texture (so cuts are detectable while
    shot-to-shot colour stays stable, as in graded footage) and a textured
    subject drifting on a rule-of-thirds line. Cuts land on the beat of a
    120 BPM click track; audio is normalized to −14 LUFS."""
    w, h = size
    duration = n_shots * shot_s
    sw, sh = w // 6, int(h * 0.45)
    args = ["-y"]
    for i in range(n_shots):
        # Coarse noise frame (large-scale structure, like a real set), looped so the
        # background is truly static within the shot
        args += ["-f", "lavfi", "-t", f"{shot_s}", "-i",
                 f"color=c=0x3a5f86:size={w // 8}x{h // 8}:rate={fps},noise=alls=60:allf=u:all_seed={i + 1},"
                 f"scale={w}:{h}:flags=bicubic,trim=end_frame=1,loop=loop=-1:size=1,setpts=N/{fps}/TB"]
        args += ["-f", "lavfi", "-t", f"{shot_s}", "-i", f"testsrc2=size={sw}x{sh}:rate={fps}"]
    click = r"0.15*sin(2*PI*220*t)+0.5*lt(mod(t\,0.5)\,0.03)*sin(2*PI*1000*t)"
    args += ["-f", "lavfi", "-t", f"{duration}", "-i", f"aevalsrc={click}:s=48000"]

    parts = []
    for i in range(n_shots):
        third = w / 3 if i % 2 == 0 else 2 * w / 3
        parts.append(f"[{2 * i}:v][{2 * i + 1}:v]overlay=x='{third:.0f}-w/2+40*sin(2*PI*t/4)':y='{h * 0.45:.0f}-h/2':eval=frame[s{i}]")
    shots = "".join(f"[s{i}]" for i in range(n_shots))
    graph = ";".join(parts) + (f";{shots}concat=n={n_shots}:v=1:a=0,format=yuv420p[v];"
                               f"[{2 * n_shots}:a]loudnorm=I=-14:TP=-2:LRA=7,aresample=48000[a]")
    run_ffmpeg([*args, "-filter_complex", graph, "-map", "[v]", "-map", "[a]", *ENCODE, str(out)])
    return out


def _cfr(fps: float) -> list[str]:
    """Constant frame rate at the source's rate: trimming and concatenating otherwise
    leaves timestamps that put frame numbers one frame off."""
    if abs(fps - round(fps)) < 0.01:
        rate = str(round(fps))
    elif abs(fps * 1.001 - round(fps * 1.001)) < 0.01:
        rate = f"{round(fps * 1.001) * 1000}/1001"  # NTSC rates such as 29.97
    else:
        rate = f"{fps:.3f}"
    return ["-fps_mode", "cfr", "-r", rate]


def _keyframes(fps: float, duration: float, removed: tuple[int, int] | None = None) -> list[str]:
    """An IDR frame every second, on the same pictures as in the clean reference, and
    no other keyframes (scene-cut keyframes off). Inside a long GOP every frame up to
    the next keyframe is predicted from a defect's frames and changes with them (a
    dissolve gets no scene-cut keyframe), so this ends a defect's encoding within a
    second. `removed` = (first frame, count) of a stretch cut out of the video: the
    keyframes after it move with the pictures."""
    step = max(1, round(fps))
    frames = list(range(0, int(duration * fps) + step, step))
    if removed:
        first, count = removed
        frames = [f for f in frames if f < first] + [f - count for f in frames if f >= first + count]
    # A quarter frame early, so that the keyframe lands on this frame and not the next
    times = ",".join(f"{max(0.0, (f - 0.25) / fps):.4f}" for f in frames)
    return ["-force_key_frames", times, "-forced-idr", "1", "-sc_threshold", "0", "-g", str(10 * step)]


def _frame_at(t: float, fps: float) -> int:
    """Index of the first frame at or after time t (frame i is shown at i / fps)."""
    return math.ceil(t * fps - 1e-6)


def reencode(source: Path, out: Path) -> Path:
    """The clean reference goes through the same encoder as every defect variant, so
    that encoding differences are not mistaken for the defect's effect."""
    info = probe(source)
    run_ffmpeg(["-y", "-i", str(source), *ENCODE, *_cfr(info.fps), *_keyframes(info.fps, info.duration), str(out)])
    return out


def _pick_shot(shots, fps: float, min_s: float, prefer_motion: np.ndarray | None, rng: random.Random,
               interior: bool = False, avoid=()):
    # "Interior" is relative to the shots offered (e.g. only lit ones): a neighbour on each side
    position = {s.index: n for n, s in enumerate(shots)}

    def fits(s, keep_clear: bool) -> bool:
        return (s.length / fps >= min_s and (not interior or 0 < position[s.index] < len(shots) - 1)
                and not (keep_clear and any(a <= s.t1 and b >= s.t0 for a, b in avoid)))

    # Prefer shots where the clean video has no issue of the same kind, so a detection
    # can only come from the injected defect.
    candidates = [s for s in shots if fits(s, True)] or [s for s in shots if fits(s, False)]
    if not candidates:
        raise ValueError(f"No shot of at least {min_s}s to place the defect in")
    if prefer_motion is not None:
        return max(candidates, key=lambda s: float(prefer_motion[s.start:s.end].mean()))
    return rng.choice(candidates)


def _shot_motion(path: Path, n_frames: int) -> np.ndarray:
    """Mean frame difference per frame, used to put jump cuts where they are visible."""
    import cv2
    cap = cv2.VideoCapture(str(path))
    prev, out = None, []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        out.append(0.0 if prev is None else float(np.mean(np.abs(g - prev))))
        prev = g
    cap.release()
    return np.array(out or [0.0] * n_frames)


def _lit(source: Path, shots, width: int) -> set[int]:
    """Shots whose middle frame is not near black: a colour shift, a crop or a jolt on a
    dip to black changes nothing a viewer (or a detector) could see."""
    # The brightest tenth of the frame, not the mean: a speaker on a black backdrop is lit content
    return {s.index for s in shots if float(np.percentile(grab_frame(source, (s.start + s.end) // 2, width=width), 90)) >= 40.0}


def _free_start(shots, fps: float, length: float, avoid, rng: random.Random) -> float:
    """Start of a window of this length inside one shot that keeps 0.5 s clear of every
    issue of the same kind in the clean video (shots of a talking head are long, and
    natural pauses already sit at their edges)."""
    starts = [round(float(t), 3) for s in shots for t in np.arange(s.t0 + 0.5, s.t1 - length, 0.5)
              if not any(a - 0.5 <= t + length and b + 0.5 >= t for a, b in avoid)]
    if not starts:
        return round(_pick_shot(shots, fps, length + 1.0, None, rng).t0 + 0.5, 3)
    return rng.choice(starts)


def _quiet_window(source: Path, shots, fps: float, length: float, avoid=()) -> float:
    """Start of the quietest non-silent window inside a long shot. A boost placed in a
    loud passage is lost to clipping at full scale and would not be a real jump."""
    with tempfile.TemporaryDirectory() as tmp:
        L = analyze_audio(source, Path(tmp)).loudness
    if L is None or L.momentary.size == 0:
        raise ValueError("The source has no measurable audio")
    best = None
    for s in shots:
        for t0 in np.arange(s.t0 + 1.0, s.t1 - length - 0.5, 0.5):
            if any(a - 1.0 <= t0 + length and b + 1.0 >= t0 for a, b in avoid):
                continue
            m = L.momentary[(L.times >= t0) & (L.times <= t0 + length + 0.4)]
            # Mostly active (speech has short pauses), and the quietest such window
            if m.size and np.percentile(m, 25) > -35.0 and (best is None or m.max() < best[0]):
                best = (float(m.max()), round(float(t0), 3))
    if best is None:
        raise ValueError("No non-silent window to boost")
    return best[1]


def inject(source: Path, kind: str, level: int, out: Path, seed: int = 0, avoid=()) -> dict:
    info = probe(source)
    shots = detect_shots(info)
    fps, W, H = info.fps, info.width, info.height
    # Seeded by kind only: every severity level of a defect hits the same shot and
    # time, so severity is the only thing that changes between levels.
    rng = random.Random(f"{seed}-{kind}")
    strength = LEVELS[kind][level]
    vf, af, complex_graph, events, time_shift, removed = None, None, None, [], None, None

    if kind == "jump_cut":
        shot = _pick_shot(shots, fps, 3.0, _shot_motion(source, info.n_frames), rng, avoid=avoid)
        t = round(shot.t0 + (shot.t1 - shot.t0) * 0.4, 3)
        d = strength
        removed = (_frame_at(t, fps), _frame_at(t + d, fps) - _frame_at(t, fps))  # trim keeps pts < t and pts ≥ t + d
        complex_graph = (
            f"[0:v]trim=end={t},setpts=PTS-STARTPTS[v0];[0:v]trim=start={t + d},setpts=PTS-STARTPTS[v1];"
            f"[v0][v1]concat=n=2:v=1:a=0[v];"
            f"[0:a]atrim=end={t},asetpts=PTS-STARTPTS[a0];[0:a]atrim=start={t + d},asetpts=PTS-STARTPTS[a1];"
            f"[a0][a1]concat=n=2:v=0:a=1[a]"
        )
        events.append({"t": t, "t_end": t})
        time_shift = {"after": t, "by": -d}
    elif kind == "flash_frame":
        shot = _pick_shot(shots, fps, 2.0, None, rng, avoid=avoid)
        n0 = shot.start + shot.length // 2
        n1 = n0 + strength - 1
        vf = f"drawbox=x=0:y=0:w=iw:h=ih:color=white@1:t=fill:enable='between(n,{n0},{n1})'"
        events.append({"t": n0 / fps, "t_end": (n1 + 1) / fps})
    elif kind == "color_jump":
        lit = _lit(source, shots, W)
        shot = _pick_shot([s for s in shots if s.index in lit] or shots, fps, 1.0, None, rng, interior=True, avoid=avoid)
        s, m = strength, round(strength * 0.8, 3)
        # colorbalance works in RGB: as a plain filter it would send every frame through
        # a YUV→RGB→YUV round trip (≈2 levels of change across the whole video), and the
        # untouched shots would no longer match the clean reference. Shift a copy and
        # overlay it on the one shot instead; every other frame passes through as is.
        complex_graph = (
            f"[0:v]split[a][b];[b]colorbalance=rs={s}:bs={-s}:rm={m}:bm={-m},format=yuv420p[cb];"
            f"[a][cb]overlay=enable='between(t,{shot.t0:.3f},{shot.t1 - 0.001:.3f})'[v]"
        )
        events += [{"t": shot.t0, "t_end": shot.t0}, {"t": shot.t1, "t_end": shot.t1}]
    elif kind == "loudness_jump":
        t0 = _quiet_window(source, shots, fps, 1.5, avoid)
        af = f"volume={strength}dB:enable='between(t,{t0},{t0 + 1.5})'"
        events.append({"t": t0, "t_end": t0 + 1.5})
    elif kind == "dead_air":
        t0 = _free_start(shots, fps, max(LEVELS["dead_air"].values()), avoid, rng)
        n0, n1 = int(t0 * fps), int((t0 + strength) * fps)
        # freezeframes takes the replacement frame from its second input
        complex_graph = (
            f"[0:v]split[a][b];[a][b]freezeframes=first={n0}:last={n1}:replace={n0}[v];"
            f"[0:a]volume=0:enable='between(t,{t0},{t0 + strength})'[a]"
        )
        events.append({"t": t0, "t_end": t0 + strength})
    elif kind == "bad_framing":
        # Zoom in and slide the crop so the shot's subject lands on the frame edge.
        import cv2
        lit = _lit(source, shots, W)
        shot = _pick_shot([s for s in shots if s.index in lit] or shots, fps, 1.0, None, rng, avoid=avoid)
        frame = grab_frame(source, (shot.start + shot.end) // 2, width=W)
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        key = analyze_keyframe(frame, shot, shot.start, cascade)
        cx = key.subject[0] if key.subject else 0.5
        cw, ch = int(W * (1 - strength)) // 2 * 2, int(H * (1 - strength)) // 2 * 2
        target = 0.04 if cx <= 0.5 else 0.96
        x0 = int(min(max(cx * W - target * cw, 0), W - cw))
        y0 = (H - ch) // 2
        complex_graph = (
            f"[0:v]split[a][b];[b]crop={cw}:{ch}:{x0}:{y0},scale={W}:{H}[sh];"
            f"[a][sh]overlay=enable='between(t,{shot.t0:.3f},{shot.t1 - 0.001:.3f})'[v]"
        )
        events.append({"t": shot.t0, "t_end": shot.t1})
    elif kind == "shake":
        lit = _lit(source, shots, W)
        shot = _pick_shot([s for s in shots if s.index in lit] or shots, fps, 1.5, None, rng, avoid=avoid)
        a = max(2, int(strength * W / 640))
        complex_graph = (
            f"[0:v]split[a][b];"
            f"[b]crop={W - 2 * a}:{H - 2 * a}:'{a}+{a}*sin(n*1.7)*cos(n*0.9)':'{a}+{a}*cos(n*2.3)*sin(n*1.3)',"
            f"scale={W}:{H}[sh];"
            f"[a][sh]overlay=enable='between(t,{shot.t0:.3f},{shot.t1 - 0.001:.3f})'[v]"
        )
        events.append({"t": shot.t0, "t_end": shot.t1})
    else:
        raise ValueError(f"Unknown defect kind: {kind}")

    args = ["-y", "-i", str(source)]
    if complex_graph:
        if "[0:a]" in complex_graph:
            args += ["-filter_complex", complex_graph, "-map", "[v]", "-map", "[a]"]
        else:
            args += ["-filter_complex", complex_graph, "-map", "[v]", "-map", "0:a?"]
    else:
        if vf:
            args += ["-vf", vf]
        if af:
            args += ["-af", af]
    run_ffmpeg([*args, *ENCODE, *_cfr(fps), *_keyframes(fps, info.duration, removed), str(out)])

    truth = {"source": str(source), "video": str(out), "kind": kind, "criterion": CRITERION[kind],
             "level": level, "strength": strength, "events": events}
    if time_shift:  # later material moved earlier; the matcher aligns the clean reference
        truth["time_shift"] = time_shift
    out.with_suffix(".truth.json").write_text(json.dumps(truth, indent=2), encoding="utf-8")
    return truth


def inject_all(source: Path, out_dir: Path, kinds: list[str] | None = None, seed: int = 0) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    truths = []
    for kind in kinds or list(LEVELS):
        for level in LEVELS[kind]:
            truths.append(inject(source, kind, level, out_dir / f"{source.stem}__{kind}_L{level}.mp4", seed))
    return truths
