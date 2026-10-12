"""AI layer (Gemini). Two jobs, both grounded in the measurements:

1. Judge K6 narrative–visual coherence, which the signal layer cannot measure.
2. Review each perceptual issue the signal layer flagged: a real error, a
   deliberate style choice, or a false detection.

The model never scores K1–K5 and cannot add issues; it can only discount what
was measured. Large multimodal models' quality perception is still "basic and
imprecise" (VideoAesBench, Q-Bench-Video), which is why the signal comes first.

Discounting is asymmetric: the model must describe what it sees before its
verdict, an issue may be excused only under explicit per-type rules, and only
an excuse given with high confidence lowers the penalty. Language-model judges
tend to be lenient, and a missed real error costs more than a kept style choice.
"""

import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from . import config
from .criteria import Issue

# Global loudness figures follow a standard (BS.1770) and are not up for debate.
NOT_REVIEWED = {"loudness_level", "true_peak", "loudness_range"}
# Events a 1 fps overview cannot show get a close-up clip at full frame rate, in this
# order of need: single-frame events, then high-frequency motion, then loudness jumps
# (audible in the overview; the clip shows what is on screen at that moment).
CLIP_PRIORITY = {"flash_frame": 0, "jump_cut": 0, "motion_clash": 0, "shaky": 1, "flicker": 1, "loudness_jump": 2}
# Jitter is a few pixels, so those clips keep full detail; the others need timing, not detail.
DETAIL_CLIP_KINDS = {"shaky"}

GLOSSARY = {
    "flash_frame": "a shot of only 1–2 frames (a flash) between two shots",
    "jump_cut": "a cut that keeps the same background/framing, so the subject visibly jumps",
    "motion_clash": "camera motion on the two sides of a cut goes in opposite directions",
    "dead_air": "silence while the picture is static",
    "long_static_shot": "a very long shot with almost no visual change",
    "color_jump": "a shot whose colour/white balance differs from the rest of the video or from both neighbouring shots",
    "flicker": "brightness oscillating frame to frame inside a shot",
    "overexposed": "large clipped white areas",
    "underexposed": "large crushed black areas",
    "loudness_jump": "a sudden jump in loudness",
    "subject_cut_off": "the main subject touches or is cut by the frame edge",
    "headroom": "too much empty space above the subject's face",
    "placement": "the subject is neither centred nor on a rule-of-thirds line",
    "soft_focus": "the shot looks out of focus compared with the rest of the video",
    "shaky": "unstable, jittery camera",
}

# The only grounds on which an issue may be called intentional. Listed in the prompt
# for the issue types under review, so every video is judged by the same rules.
EXCUSE_RULES = {
    "flash_frame": "the video uses flash transitions repeatedly as a style, not once in isolation",
    "jump_cut": "the video uses jump cuts consistently as its style (e.g. a talking-head vlog), not a single jump inside an otherwise continuous scene",
    "motion_clash": "the opposing movement is a deliberate, stylised transition",
    "dead_air": "the silent, still moment serves the story (a dramatic pause, a reaction), not a frozen or idle stretch",
    "long_static_shot": "the long take is deliberate (a performance, an interview, a contemplative shot)",
    "color_jump": "the shot is in a different place, time of day or a stylised sequence (flashback, dream, title card), not another angle of the same scene",
    "flicker": "the light itself changes in the scene (fire, strobe, lightning, explosions)",
    "overexposed": "it is a deliberate bright look and the subject itself is well exposed",
    "underexposed": "it is a deliberate dark look or a dip to black, and the subject stays readable",
    "loudness_jump": "the rise coincides with an on-screen event or a musical hit (an impact, a title card, a drop)",
    "subject_cut_off": "the composition is clearly deliberate (a stylised extreme close-up, room for text)",
    "headroom": "the space above the subject is used (text, scenery, a deliberate wide framing)",
    "placement": "the composition is clearly deliberate (room for text, or for the subject's gaze or movement)",
    "soft_focus": "a shallow depth of field keeps the intended subject sharp, or the softness is a deliberate effect",
    "shaky": "handheld energy is consistent across the scene or motivated by the action, not sudden jitter in an otherwise steady shot",
}


@dataclass
class AiReview:
    model: str
    narrative_level: float                   # median over the runs (one run: its level)
    narrative_evidence: str
    verdicts: dict[str, tuple[str, str]]     # issue id → (verdict used for scoring, note)
    comments: dict[str, str]
    summary: str
    improvements: list[str]
    overview_fps: float
    zoom_clips: list[str]                    # issue ids that got a dense clip
    reviews: dict[str, dict] = field(default_factory=dict)  # issue id → model's own verdict, confidence, observation
    narrative_levels: list[float] = field(default_factory=list)  # K6 level of every run
    run_models: list[str] = field(default_factory=list)        # model that answered each run
    usage: list[dict] = field(default_factory=list)            # tokens of every call (cost)
    narrative_parts: list[dict] = field(default_factory=list)  # the parts the model split the video into (first run)
    parts_levels: list[float] = field(default_factory=list)    # level computed from each run's parts (reported only)
    level_source: str = "overall"                              # "overall", or "parts" when no overall level was given

    @property
    def narrative_score(self) -> float:
        return round((self.narrative_level - 1) / 4 * 100, 1)


class UnparseableResponse(Exception):
    """The model answered, but never with the JSON asked for. Keeps the raw answers."""

    def __init__(self, raw: list[str]):
        super().__init__(f"AI response could not be parsed ({len(raw)} attempts)")
        self.raw = raw


def combine_runs(runs: list[AiReview]) -> AiReview:
    """K6 is the median of the runs' levels: one run that reads the video very
    differently (levels 1 and 4 on the same unboxing) cannot move it; with two runs it
    is their mean. Issue opinions, comments and the summary come from the first run
    (they are reported, not scored)."""
    levels = [r.narrative_level for r in runs]
    first = runs[0]
    first.narrative_level = round(float(statistics.median(levels)), 2)
    first.narrative_levels = [round(float(level), 2) for level in levels]
    first.parts_levels = [p for r in runs for p in r.parts_levels]
    first.level_source = "overall" if all(r.level_source == "overall" for r in runs) else "parts"
    first.run_models = [r.model for r in runs]
    return first


def _seconds(text) -> float | None:
    """'mm:ss', 'mm:ss.s' or 'h:mm:ss' → seconds."""
    try:
        parts = [float(p) for p in str(text).strip().split(":")]
    except ValueError:
        return None
    if not 1 <= len(parts) <= 3 or any(p < 0 for p in parts):
        return None
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + p
    return seconds


def level_from_parts(parts: list, duration: float, n_cuts: int | None) -> tuple[float | None, list[dict]]:
    """A level from the model's parts: 1 + 4 × the share of the runtime whose visuals
    the edit chose to show what is said ("shown"), a scene cut together from shots
    chosen to follow it counting half ("covered"), one recording of it or unrelated
    visuals nothing (see K6_FIT_WEIGHT). One unedited take has no shots chosen by an
    edit, so it earns nothing for coverage. Reported next to the model's overall level
    (used for K6 only when the model gives none); None when the parts cover less than
    half of the video."""
    weights = dict(config.K6_FIT_WEIGHT)
    if n_cuts == 0:
        weights["covered"] = 0.0
    clean, total, credit, end = [], 0.0, 0.0, 0.0
    usable = [p for p in parts if isinstance(p, dict) and p.get("fit") in weights]
    timed = sorted(((_seconds(p.get("start")), _seconds(p.get("end")), p) for p in usable),
                   key=lambda x: (x[0] is None, x[0] or 0.0))
    for a, b, p in timed:
        if a is None or b is None:
            continue
        a, b = max(a, end, 0.0), min(b, duration)
        if b <= a:
            continue
        end = b
        total += b - a
        credit += (b - a) * weights[p["fit"]]
        clean.append({"start": _ts(a), "end": _ts(b), "fit": p["fit"],
                      "about": str(p.get("about", ""))[:120], "visuals": str(p.get("visuals", ""))[:160]})
    if total < 0.5 * duration:
        return None, clean
    return 1.0 + 4.0 * credit / total, clean


def _ts(t: float) -> str:
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def _level(value) -> int | None:
    try:
        level = round(float(value))
    except (TypeError, ValueError):
        return None
    return level if 1 <= level <= 5 else None


def reviewable(issues: list[Issue]) -> list[Issue]:
    candidates = [i for i in issues if i.kind not in NOT_REVIEWED]
    return sorted(candidates, key=lambda i: -i.severity)[:config.AI_MAX_REVIEW_ISSUES]


def zoom_window(issue: Issue, duration: float) -> tuple[float, float]:
    """Clip around an issue; long issues (a shaky shot) get a window around their middle."""
    start, end = issue.t - config.AI_ZOOM_HALF_S, issue.t_end + config.AI_ZOOM_HALF_S
    if end - start > config.AI_ZOOM_MAX_S:
        mid = (issue.t + issue.t_end) / 2
        start, end = mid - config.AI_ZOOM_MAX_S / 2, mid + config.AI_ZOOM_MAX_S / 2
    return max(0.0, start), min(duration, end)


def build_prompt(overview_fps: float, issues: list[Issue], zoom: list[Issue], metrics: dict) -> str:
    parts_text = f"Video part 1 is the whole video sampled at {overview_fps:.2f} frames per second, with audio."
    if zoom:
        clips = "; ".join(f"part {n + 2} → {i.id} ({_ts(i.t)})" for n, i in enumerate(zoom))
        span = "Part 2 is a short clip" if len(zoom) == 1 else f"Parts 2–{len(zoom) + 1} are short clips"
        parts_text += (f" {span} at {config.AI_ZOOM_FPS:g} frames per second around {'this issue' if len(zoom) == 1 else 'these issues'}: {clips}."
                       " A flash frame or a jump can occupy a single frame there, so inspect them frame by frame.")
    issue_lines = "\n".join(
        f"- {i.id} | {config.LABELS[i.criterion]} | {i.kind} ({GLOSSARY.get(i.kind, i.kind)}) | "
        f"{_ts(i.t)}–{_ts(i.t_end)} | {json.dumps(i.detail, default=float)}"
        for i in issues
    ) or "- (none)"
    rules = "\n".join(f"   - {kind}: {EXCUSE_RULES[kind]}" for kind in sorted({i.kind for i in issues}) if kind in EXCUSE_RULES)
    n_cuts = metrics.get("cuts")
    cuts = "an unknown number of cuts" if n_cuts is None else ("no cut" if n_cuts == 0 else f"{n_cuts} cut{'s' if n_cuts != 1 else ''}")
    kind = f' and the video type "{metrics["video_type"]}"' if metrics.get("video_type") else ""
    return f"""You are a senior video editor auditing the EDITING of this video: cuts, pacing, colour, sound, framing, and how the visuals serve the narration. An automatic signal analyzer has already measured it. Your job is limited to the three tasks below.

{parts_text}

1. Judge K6 narrative–visual coherence, which the analyzer cannot measure: how well the visuals the editor put on screen show what is being said, or what each part of the video is about. Go through the whole video and split it into consecutive parts by topic, step or scene ({config.K6_PARTS[0]} to {config.K6_PARTS[1]} parts, from 00:00 to the end). For each part write what it is about, what is on screen, and choose its "fit":
   - "shown": the edit puts on screen what is said or what the part is about, with material chosen for it: b-roll or a cutaway of it, an insert or close-up of the thing named, a graphic, an animation, on-screen text, a screen recording of the step; without speech, shots chosen and ordered so that they carry the topic, the story or the music
   - "covered": the scene itself, cut together from shots chosen to follow it: a change of angle or size on the speaker, a reaction, the detail of the action as it happens
   - "recorded": one recording of the speaker or the scene as it happened (a presenter talking to the camera, an event filmed as it unfolded), at most trimmed by jump cuts, with nothing chosen to show the topic
   - "unrelated": the visuals do not fit what is said, distract from it, or show nothing (black, a frozen frame)
   Judge each part on its own: a part is "shown" or "covered" only when its own visuals were chosen that way, not because the rest of the video is well made. The analyzer measured {cuts}{kind}.
   Then give your overall level for the whole video (reported next to the parts): 1 = visuals unrelated, or one recording while many topics are discussed; 2 = mostly recorded or generic, occasional match; 3 = matches part of the time; 4 = usually shown; 5 = consistently and specifically shown.

2. Review every flagged issue below. First write what you actually see and hear at that time ("observation"), then choose one verdict:
   - "error": a real editing mistake a viewer would notice
   - "intentional": a deliberate creative choice whose reason is visible in the video itself
   - "false_positive": what the analyzer describes does not happen there. A short event (a flash frame, a jump cut, a jolt) can only be checked in its close-up clip; without one, do not choose false_positive.
   An issue is "intentional" only when, for its type:
{rules or "   - (no issues)"}
   Do not excuse an issue by guessing the creator's intent or the video's purpose, or because the rest of the video looks polished: well-edited videos contain mistakes too.
   Give a confidence from 1 (a guess) to 5 (certain). When unsure, choose "error".

3. Comment in one sentence on each criterion (cuts, pacing, color, audio, framing, narrative), summarise the editing in 2–3 sentences, and list up to 3 concrete improvements.

Measured summary:
{json.dumps(metrics, indent=1, default=float)}

Flagged issues (id | criterion | type | time | measurement):
{issue_lines}

Return ONLY valid JSON in exactly this shape:
{{
  "narrative_visual_coherence": {{"parts": [{{"start": "00:00", "end": "00:14", "about": "max 60 chars", "visuals": "max 80 chars", "fit": "shown"}}], "overall_level": 3, "evidence": "max 200 chars, cite mm:ss"}},
  "issue_reviews": [{{"id": "cuts-1", "observation": "max 150 chars", "verdict": "error", "confidence": 4, "note": "max 120 chars"}}],
  "criterion_comments": {{"cuts": "", "pacing": "", "color": "", "audio": "", "framing": "", "narrative": ""}},
  "summary": "",
  "improvements": [""]
}}"""


def parse_review(raw: str, issue_ids: set[str], model: str, overview_fps: float, zoom_ids: list[str],
                 duration: float | None = None, n_cuts: int | None = None) -> AiReview | None:
    try:
        data = json.loads(raw[raw.find("{"):raw.rfind("}") + 1])
    except ValueError:
        return None
    narrative = data.get("narrative_visual_coherence") or {}
    if not isinstance(narrative, dict):
        return None
    overall = _level(narrative.get("overall_level", narrative.get("level")))
    parts_level, parts = (None, [])
    if duration and isinstance(narrative.get("parts"), list):
        parts_level, parts = level_from_parts(narrative["parts"], duration, n_cuts)
    level, source = overall, "overall"
    if level is None:
        level, source = parts_level, "parts"  # no overall level given: the one computed from the parts
    if level is None:
        return None

    verdicts, reviews = {}, {}
    for r in data.get("issue_reviews") or []:
        if not (isinstance(r, dict) and r.get("id") in issue_ids and r.get("verdict") in config.VERDICT_FACTOR):
            continue
        verdict, confidence = r["verdict"], _level(r.get("confidence"))
        # An excuse counts only when the model is sure; otherwise the measured issue stands.
        used = verdict if verdict == "error" or (confidence or 0) >= config.AI_MIN_EXCUSE_CONFIDENCE else "error"
        verdicts[r["id"]] = (used, str(r.get("note", ""))[:300])
        reviews[r["id"]] = {"verdict": verdict, "confidence": confidence, "observation": str(r.get("observation", ""))[:300]}
    comments = {k: str(v)[:400] for k, v in (data.get("criterion_comments") or {}).items() if k in config.WEIGHTS}
    improvements = data.get("improvements") or []
    return AiReview(
        model=model,
        narrative_level=level,
        narrative_evidence=str(narrative.get("evidence", ""))[:400],
        verdicts=verdicts,
        comments=comments,
        summary=str(data.get("summary", ""))[:800],
        improvements=[str(s)[:200] for s in improvements if s][:3] if isinstance(improvements, list) else [],
        overview_fps=overview_fps,
        zoom_clips=zoom_ids,
        reviews=reviews,
        narrative_parts=parts,
        parts_levels=[round(parts_level, 2)] if parts_level is not None else [],
        level_source=source,
    )


def review(video: Path, duration: float, issues: list[Issue], metrics: dict, model: str | None = None,
           repeats: int | None = None) -> AiReview | None:
    """None when GEMINI_API_KEY is not set. Network or API errors propagate to the caller;
    answers that never parse raise UnparseableResponse. K6 is averaged over `repeats`
    independent runs on the same upload (default AI_K6_REPEATS)."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    from google import genai
    from google.genai import errors, types

    model = model or os.environ.get("GEMINI_VIDEO_MODEL") or config.GEMINI_MODEL_DEFAULT
    client = genai.Client(api_key=api_key)
    uploaded = client.files.upload(file=str(video))
    try:
        while uploaded.state is not None and uploaded.state.name == "PROCESSING":
            time.sleep(3)
            uploaded = client.files.get(name=uploaded.name)
        if uploaded.state is not None and uploaded.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini could not process the upload (state {uploaded.state.name})")

        overview_fps = min(1.0, config.AI_OVERVIEW_MAX_FRAMES / max(duration, 1.0))
        to_review = reviewable(issues)
        candidates = [i for i in to_review if i.kind in CLIP_PRIORITY]
        zoom = sorted(candidates, key=lambda i: (CLIP_PRIORITY[i.kind], -i.severity))[:config.AI_ZOOM_CLIPS]

        def video_part(fps: float, start: float | None = None, end: float | None = None, detail: bool = True):
            meta = types.VideoMetadata(
                fps=fps,
                start_offset=None if start is None else f"{start:.2f}s",
                end_offset=None if end is None else f"{end:.2f}s",
            )
            level = config.AI_MEDIA_RESOLUTION if detail else config.AI_CLIP_RESOLUTION
            return types.Part(file_data=types.FileData(file_uri=uploaded.uri, mime_type=uploaded.mime_type), video_metadata=meta,
                              media_resolution=types.PartMediaResolution(level=types.PartMediaResolutionLevel[level]))

        # Gemini 3 models are meant to run at their default temperature (1.0); lower
        # values can degrade their reasoning, so it is not set here.
        generation_config = types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel[config.AI_THINKING_LEVEL]),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        ids = {i.id for i in to_review}
        # If the API rejects several views of one file, retry with the overview alone.
        for zoom_set in ([zoom, []] if zoom else [[]]):
            parts = [video_part(overview_fps)] + [
                video_part(config.AI_ZOOM_FPS, *zoom_window(i, duration), detail=i.kind in DETAIL_CLIP_KINDS) for i in zoom_set
            ]
            prompt = build_prompt(overview_fps, to_review, zoom_set, metrics)
            zoom_ids = [i.id for i in zoom_set]
            try:
                runs, raw = _ask(client, errors, model, [*parts, prompt], generation_config, max(1, repeats or config.AI_K6_REPEATS),
                                 lambda text, used: parse_review(text, ids, used, overview_fps, zoom_ids,
                                                                 duration, metrics.get("cuts")))
            except errors.ClientError as err:
                if zoom_set and err.code == 400:
                    continue
                raise
            if not runs:
                raise UnparseableResponse(raw)
            return combine_runs(runs)
        return None
    finally:
        try:
            client.files.delete(name=uploaded.name)
        except Exception:
            pass  # uploads expire on their own after 48 h


def _ask(client, errors, model: str, contents: list, generation_config, repeats: int, parse):
    """`repeats` independent answers. An answer that does not parse is asked for again,
    up to AI_PARSE_ATTEMPTS times per run, and kept in `raw` for the report. An API
    error after a successful run ends the repeats early instead of losing that run."""
    runs, raw, usage = [], [], []

    def done():
        if runs:
            runs[0].usage = usage  # the combined review is built on the first run
        return runs, raw

    for _ in range(repeats):
        for _ in range(config.AI_PARSE_ATTEMPTS):
            try:
                response, used_model = _generate(client, errors, model, contents, generation_config)
            except errors.APIError:
                if not runs:
                    raise
                return done()
            usage.append(_usage(response, used_model))
            text = response.text or ""
            parsed = parse(text, used_model)
            if parsed is not None:
                runs.append(parsed)
                break
            raw.append(text)
    return done()


def _usage(response, model: str) -> dict:
    meta = getattr(response, "usage_metadata", None)
    fields = ("prompt_token_count", "candidates_token_count", "thoughts_token_count", "total_token_count")
    return {"model": model, **{f: getattr(meta, f, None) for f in fields}}


def _generate(client, errors, model: str, contents: list, generation_config):
    """Retry transient overload (503) and rate limits (429) with back-off, then try
    the fallback model the same way; an unknown or retired model name (404) goes
    straight to the fallback. Returns (response, model actually used)."""
    fallback = os.environ.get("GEMINI_FALLBACK_MODEL", config.GEMINI_FALLBACK_MODEL)
    last_error = None
    for candidate in dict.fromkeys(m for m in (model, fallback) if m):
        for delay in (0, *config.AI_RETRY_DELAYS_S):
            if last_error is not None:
                step = f"retrying in {delay} s" if delay else f"trying {candidate}"
                print(f"Gemini unavailable ({last_error.code}); {step}", file=sys.stderr, flush=True)
            if delay:
                time.sleep(delay)
            try:
                return client.models.generate_content(model=candidate, contents=contents, config=generation_config), candidate
            except errors.ServerError as err:
                last_error = err
            except errors.ClientError as err:
                if err.code not in (404, 429):
                    raise
                last_error = err
                if err.code == 404:
                    break
    raise last_error


def apply_verdicts(issues: list[Issue], ai: AiReview) -> None:
    for issue in issues:
        if issue.id in ai.verdicts:
            issue.verdict, issue.note = ai.verdicts[issue.id]
            issue.ai_review = ai.reviews.get(issue.id)
