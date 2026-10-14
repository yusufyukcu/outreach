"""Fusion into the Edit Quality Index and the JSON report.

Two indices are always reported so the AI layer's contribution can be ablated:
  • EQI_signal — K1–K5 from measurements only (weights renormalized)
  • EQI_full   — K1–K5 after the AI review discounted intentional / false
                 issues, plus K6 narrative coherence (all six weights)
"""

import json
from dataclasses import asdict

from . import __version__, config
from .ai import AiReview
from .audio import AudioFeatures
from .criteria import Assessment, Issue
from .features import VisualFeatures


def weighted_index(scores: dict[str, float | None], criteria: list[str],
                   coverage: dict[str, float] | None = None) -> float | None:
    """Weighted mean of the available criteria. `coverage` (0–1 per criterion, default 1)
    is the share of the video a criterion can judge: K3 and K5 judge camera footage only,
    so in a video that is 30 % screen recording they count for 70 % of their weight. A
    criterion with no coverage drops out, as one that is not available."""
    coverage = coverage or {}
    weights = {k: config.WEIGHTS[k] * coverage.get(k, 1.0) for k in criteria if scores.get(k) is not None}
    weights = {k: w for k, w in weights.items() if w > 0}
    if not weights:
        return None
    total = sum(weights.values())
    return round(sum(w * scores[k] for k, w in weights.items()) / total, 1)


def coverage_of(vt) -> dict[str, float] | None:
    """Coverage of K3 and K5: the share of the runtime that is camera footage."""
    if vt is None:
        return None
    camera = round(1.0 - vt.designed_share, 3)
    return {"color": camera, "framing": camera}


def build_report(f: VisualFeatures, a: AudioFeatures, assessments: dict[str, Assessment],
                 ai: AiReview | None, ai_error: str | None, timing: dict) -> dict:
    signal = {k: assessments[k].score(use_verdict=False) for k in config.SIGNAL_CRITERIA}
    # What K1–K5 would be if the AI's verdicts discounted issues (kept for the ablation)
    with_verdicts = {k: assessments[k].score(use_verdict=True) for k in config.SIGNAL_CRITERIA} if ai else None
    used = with_verdicts if ai and config.AI_VERDICTS_IN_SCORE else signal
    narrative = ai.narrative_score if ai else None

    criteria = {}
    for k in config.SIGNAL_CRITERIA:
        criteria[k] = {
            "label": config.LABELS[k],
            "weight": config.WEIGHTS[k],
            "available": assessments[k].available,
            "score_signal": signal[k],
            "score": used[k],
            "score_with_ai_verdicts": with_verdicts[k] if with_verdicts else None,
            "ai_comment": ai.comments.get(k) if ai else None,
            "context": assessments[k].context,
            "issues": [asdict(i) for i in assessments[k].issues],
        }
    criteria["narrative"] = {
        "label": config.LABELS["narrative"],
        "weight": config.WEIGHTS["narrative"],
        "available": ai is not None,
        "score_signal": None,
        "score": narrative,
        "score_with_ai_verdicts": narrative,
        "level": ai.narrative_level if ai else None,       # median over the runs
        "levels": ai.narrative_levels if ai else None,     # every run's level (the model's overall level)
        "level_source": ai.level_source if ai else None,   # "overall", or "parts" when no overall level was given
        "parts_levels": ai.parts_levels if ai else None,   # level computed from each run's parts (reported only)
        "parts": ai.narrative_parts if ai else None,       # first run: what each part shows and how it fits
        "evidence": ai.narrative_evidence if ai else None,
        "ai_comment": ai.comments.get("narrative") if ai else None,
    }

    info = f.info
    vt = getattr(assessments, "video_type", None)
    coverage = coverage_of(vt)
    return {
        "tool": {"name": "EQI — Edit Quality Index", "version": __version__,
                 "weights": config.WEIGHTS, "verdict_factor": config.VERDICT_FACTOR},
        "video": {"path": str(info.path), "duration_s": round(info.duration, 2), "fps": info.fps,
                  "frames": info.n_frames, "width": info.width, "height": info.height, "has_audio": a.has_audio,
                  "shot_check": getattr(info, "shot_check", None)},
        "video_type": vt.to_dict() if vt is not None else None,
        "eqi": {
            "signal_only": weighted_index(signal, config.SIGNAL_CRITERIA, coverage),
            "full": weighted_index({**used, "narrative": narrative}, list(config.WEIGHTS), coverage) if ai else None,
            "full_with_ai_verdicts": (weighted_index({**with_verdicts, "narrative": narrative}, list(config.WEIGHTS), coverage)
                                      if ai else None),
            "coverage": coverage,
        },
        "criteria": criteria,
        "ai": None if ai is None else {
            "model": ai.model, "run_models": ai.run_models, "usage": ai.usage,
            "overview_fps": round(ai.overview_fps, 3), "zoom_clips": ai.zoom_clips,
            "summary": ai.summary, "improvements": ai.improvements,
            "verdict_counts": {v: sum(1 for x, _ in ai.verdicts.values() if x == v) for v in config.VERDICT_FACTOR},
        },
        "ai_error": ai_error,
        "shots": [{"index": s.index, "start_s": round(s.t0, 3), "end_s": round(s.t1, 3), "frames": s.length} for s in f.shots],
        "timing_s": timing,
    }


def rescore(report: dict, ai_from: dict | None = None) -> dict:
    """Score a saved report again with the current scoring rules: its issues and their
    context are kept, so no analysis is repeated. ai_from: a report of the same video
    whose AI review (K6, comments) replaces this one's; its verdicts are not carried
    over, since they refer to that report's issues."""
    report = json.loads(json.dumps(report))
    if ai_from is not None:
        report["criteria"]["narrative"] = ai_from["criteria"]["narrative"]
        report["ai"], report["ai_error"] = ai_from.get("ai"), ai_from.get("ai_error")
        for k in config.SIGNAL_CRITERIA:
            report["criteria"][k]["ai_comment"] = ai_from["criteria"][k].get("ai_comment")
        report["ai_from"] = ai_from["video"]["path"]
    has_ai = report.get("ai") is not None
    signal, with_verdicts = {}, {}
    for k in config.SIGNAL_CRITERIA:
        c = report["criteria"][k]
        a = Assessment(k, [Issue(**i) for i in c["issues"]], c["context"], c["available"])
        signal[k], with_verdicts[k] = a.score(use_verdict=False), a.score(use_verdict=True)
    used = with_verdicts if has_ai and config.AI_VERDICTS_IN_SCORE else signal
    narrative = report["criteria"]["narrative"]["score"] if has_ai else None
    for k in config.SIGNAL_CRITERIA:
        report["criteria"][k].update(score_signal=signal[k], score=used[k],
                                     score_with_ai_verdicts=with_verdicts[k] if has_ai else None)
    report["tool"].update(version=__version__, weights=config.WEIGHTS)
    coverage = (report.get("eqi") or {}).get("coverage")
    report["eqi"] = {
        "signal_only": weighted_index(signal, config.SIGNAL_CRITERIA, coverage),
        "full": weighted_index({**used, "narrative": narrative}, list(config.WEIGHTS), coverage) if has_ai else None,
        "full_with_ai_verdicts": (weighted_index({**with_verdicts, "narrative": narrative}, list(config.WEIGHTS), coverage)
                                  if has_ai else None),
        "coverage": coverage,
    }
    return report

