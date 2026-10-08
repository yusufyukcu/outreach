"""End-to-end analysis of one video file."""

import json
import os
import tempfile
import time
from pathlib import Path

from . import ai as ai_layer
from . import audio as audio_layer
from . import html_report
from .criteria import assess_all
from .features import detect_shots, extract
from .media import probe
from .report import build_report


def _summary_metrics(f, a, assessments) -> dict:
    """Descriptive measurements for the AI prompt. Scores are left out on
    purpose so they cannot anchor the model's own judgement."""
    pacing = assessments["pacing"].context
    metrics = {
        "duration_s": round(f.info.duration, 1),
        "shots": len(f.shots),
        "cuts": max(0, len(f.shots) - 1),
        "average_shot_length_s": pacing["asl_s"],
        "music_driven": pacing["music_driven"],
    }
    if pacing.get("tempo_bpm"):
        metrics["tempo_bpm"] = pacing["tempo_bpm"]
    if a.has_audio and a.loudness is not None:
        metrics["integrated_loudness_lufs"] = a.loudness.integrated
        metrics["loudness_range_lu"] = a.loudness.lra
    faces = sum(1 for k in f.keyframes if k.subject_source == "face")
    metrics["shots_with_detected_face"] = f"{faces}/{len(f.keyframes)}"
    return metrics


def analyze(video: Path, out_dir: Path | None = None, use_ai: bool = True,
            make_figures: bool = True, model: str | None = None, ai_repeats: int | None = None) -> dict:
    video = Path(video)
    timing = {}
    t0 = time.perf_counter()

    info = probe(video)
    shots = detect_shots(info)
    timing["shots"] = round(time.perf_counter() - t0, 2)

    t = time.perf_counter()
    visual = extract(info, shots)
    timing["visual"] = round(time.perf_counter() - t, 2)

    t = time.perf_counter()
    with tempfile.TemporaryDirectory() as tmp:
        audio = audio_layer.analyze(video, Path(tmp))
    timing["audio"] = round(time.perf_counter() - t, 2)

    assessments = assess_all(visual, audio)

    review, ai_error, unparsed = None, None, None
    if use_ai:
        if not os.environ.get("GEMINI_API_KEY"):
            ai_error = "GEMINI_API_KEY not set — AI layer (K6 and issue review) skipped"
        else:
            t = time.perf_counter()
            issues = [i for a in assessments.values() for i in a.issues]
            try:
                review = ai_layer.review(video, info.duration, issues, _summary_metrics(visual, audio, assessments),
                                         model, repeats=ai_repeats)
                if review is None:
                    ai_error = "AI layer returned no review"
                else:
                    ai_layer.apply_verdicts(issues, review)
            except ai_layer.UnparseableResponse as err:
                ai_error, unparsed = str(err), [text[:4000] for text in err.raw]
            except Exception as err:  # the signal report is still valid without the AI layer
                ai_error = f"{type(err).__name__}: {err}"
            timing["ai"] = round(time.perf_counter() - t, 2)

    timing["total"] = round(time.perf_counter() - t0, 2)
    report = build_report(visual, audio, assessments, review, ai_error, timing)
    if unparsed is not None:
        report["ai_unparsed_responses"] = unparsed  # what the model said, to find out why

    if out_dir is not None:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "report.json").write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
        if make_figures:
            from . import figures
            figures.render(report, visual, audio, video, out_dir / "figures")
        html_report.write(report, out_dir)
    return report
