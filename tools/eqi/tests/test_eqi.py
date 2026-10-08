import json
import os
from pathlib import Path

import numpy as np
import pytest

from eqi import ai, config
from eqi.audio import parse_ebur128
from eqi.criteria import Assessment, Issue
from eqi.evaluate import correlation_stats, icc2, split_half
from eqi.report import weighted_index


def issue(criterion, kind, t=1.0, t_end=1.0, severity=None, iid=None, **detail):
    return Issue(iid or f"{criterion}-x", criterion, kind, t, t_end,
                 severity if severity is not None else config.SEVERITY[kind], detail)


# ── Signal scoring ───────────────────────────────────────────────────────────

def test_cut_errors_count_per_minute_of_viewing():
    flash = [issue("cuts", "flash_frame")]
    # One glaring cut error per minute empties K1, however many good cuts surround it
    assert Assessment("cuts", flash, {"n_cuts": 4, "minutes": 1.0}).score() == 0.0
    assert Assessment("cuts", flash, {"n_cuts": 40, "minutes": 2.0}).score() == 50.0
    assert Assessment("cuts", flash, {"n_cuts": 40, "minutes": 4.0}).score() == 75.0
    # No cut at all is no evidence of smooth cutting: the midpoint, not full marks
    assert Assessment("cuts", [], {"n_cuts": 0}).score() == config.NO_EVIDENCE_SCORE


def test_one_lit_shot_cannot_score_above_the_midpoint_for_colour():
    assert Assessment("color", [], {"n_shots": 1, "n_graded": 1}).score() == config.NO_EVIDENCE_SCORE
    assert Assessment("color", [], {"n_shots": 5, "n_graded": 5}).score() == 100.0


def test_repeated_jump_cuts_are_style_and_an_isolated_one_is_an_error():
    from eqi.criteria import assess_cuts
    diff = np.full(400, 0.8)
    f = _features([50] * 8, diff=diff)
    f.stable[:] = 0.3  # ordinary cuts change most pixels
    for c in (50, 100, 150):
        f.stable[c] = 0.9  # three cuts keep the background: jump cuts on 3 of 7 cuts
    style = assess_cuts(f)
    assert [i.severity for i in style.issues if i.kind == "jump_cut"] == [0.0, 0.0, 0.0]
    assert all("style" in i.detail for i in style.issues) and style.score() == 100.0
    f.stable[100] = f.stable[150] = 0.3  # only one left: a slip
    slip = assess_cuts(f)
    assert [i.severity for i in slip.issues if i.kind == "jump_cut"] == [config.SEVERITY["jump_cut"]]
    assert slip.score() < 100.0


def test_cut_style_needs_repetition_and_a_lone_flash_stays_an_error():
    from eqi.criteria import mark_cut_style
    def fresh(kind, n):
        return [issue("cuts", kind, t=float(k), iid=f"cuts-{k}") for k in range(n)]
    burst = fresh("jump_cut", 3)  # a burst of jump cuts in a 20-cut trailer: a technique
    mark_cut_style(burst, 20)
    assert all(i.severity == 0.0 and "style" in i.detail for i in burst)
    flashes = fresh("flash_frame", 3)  # three leftover frames in 20 cuts: still errors
    mark_cut_style(flashes, 20)
    assert all(i.severity == config.SEVERITY["flash_frame"] for i in flashes)
    strobe = fresh("flash_frame", 6)  # flashes on six of twenty cuts: a strobe style
    mark_cut_style(strobe, 20)
    assert all(i.severity == 0.0 for i in strobe)
    two = fresh("jump_cut", 2)  # two in twenty: slips
    mark_cut_style(two, 20)
    assert all(i.severity == config.SEVERITY["jump_cut"] for i in two)


def test_loudness_at_broadcast_or_streaming_level_is_not_penalized():
    from eqi.audio import AudioFeatures, Loudness
    from eqi.criteria import assess_audio
    def level_issues(lufs):
        L = Loudness(lufs, 8.0, -3.0, np.array([0.1, 0.2]), np.array([lufs, lufs]))
        return [i for i in assess_audio(AudioFeatures(True, L), 60.0).issues if i.kind == "loudness_level"]
    assert not level_issues(-23.0) and not level_issues(-14.0) and not level_issues(-25.5)
    assert level_issues(-35.0) and level_issues(-9.0)


def test_a_word_after_a_pause_is_not_a_loudness_jump_but_a_burst_is():
    from eqi.audio import AudioFeatures, Loudness
    from eqi.criteria import assess_audio
    t = np.arange(0.1, 30.0, 0.1)
    m = np.full(t.size, -20.0)
    m[(t > 10.0) & (t < 10.6)] = -32.0      # a short pause in the narration
    short = np.full(t.size, -20.0)          # the level of the last 3 s barely moves
    m[(t > 20.0) & (t < 21.5)] = -5.0       # a loud burst…
    short[(t > 20.3) & (t < 24.5)] = -9.0   # …which the 3 s level then follows
    L = Loudness(-20.0, 6.0, -1.5, t, m, short)
    jumps = [i for i in assess_audio(AudioFeatures(True, L), 30.0).issues if i.kind == "loudness_jump"]
    assert len(jumps) == 1 and 19.9 <= jumps[0].t_end <= 20.3  # reported where the burst arrives


def test_ai_verdict_discounts_only_in_verified_score():
    i = issue("cuts", "jump_cut")
    a = Assessment("cuts", [i], {"n_cuts": 2, "minutes": 2.0})
    assert a.score(use_verdict=True) == a.score(use_verdict=False) == 70.0
    i.verdict = "intentional"
    assert a.score(use_verdict=False) == 70.0
    assert a.score(use_verdict=True) == 100.0


def test_pacing_renormalizes_without_beat_score():
    ctx = {"minutes": 1.0, "asl_score": 100.0, "beat_score": None}
    assert Assessment("pacing", [], ctx).score() == 100.0
    one = Assessment("pacing", [issue("pacing", "dead_air", severity=1.0)], {**ctx, "minutes": 2.0})
    # one dead air in two minutes: dead-air sub-score 100·(1 − 0.5/1) = 50, weighted 0.5 against ASL 100 at 0.25
    assert one.score() == pytest.approx((50.0 * 0.5 + 100 * 0.25) / 0.75, abs=0.1)


def test_audio_unavailable_without_track():
    assert Assessment("audio", [], {"has_audio": False}, available=False).score() is None


def test_framing_caps_penalty_per_shot():
    issues = [issue("framing", "subject_cut_off", t=0.0, severity=0.9), issue("framing", "shaky", t=0.0, severity=0.9)]
    a = Assessment("framing", issues, {"n_shots": 3})
    assert a.score() == pytest.approx(100 * (1 - config.FRAMING_PENALTY_SCALE * 1.0 / 3), abs=0.1)


def test_weighted_index_renormalizes_missing_criteria():
    scores = {"cuts": 80.0, "pacing": 60.0, "color": None, "audio": None, "framing": None}
    assert weighted_index(scores, config.SIGNAL_CRITERIA) == 70.0  # equal weights 0.20 / 0.20
    assert weighted_index({k: None for k in config.WEIGHTS}, list(config.WEIGHTS)) is None


def test_rescore_uses_the_saved_issues_and_can_take_k6_from_another_report():
    from dataclasses import asdict
    from eqi.report import rescore
    ctx = {"cuts": {"n_cuts": 6, "minutes": 1.0}, "pacing": {"minutes": 1.0, "asl_score": 100.0, "beat_score": None},
           "color": {"n_shots": 7, "n_graded": 7}, "audio": {"has_audio": False}, "framing": {"n_shots": 7}}
    flash = issue("cuts", "flash_frame")
    report = {"tool": {}, "video": {"path": "v.mp4"}, "ai": None, "ai_error": None, "criteria": {
        k: {"available": k != "audio", "context": ctx[k], "issues": [asdict(flash)] if k == "cuts" else [],
            "score_signal": 0.0, "score": 0.0} for k in config.SIGNAL_CRITERIA}}
    report["criteria"]["narrative"] = {"score": None}
    k1 = Assessment("cuts", [flash], ctx["cuts"]).score()
    again = rescore(report)
    assert again["criteria"]["cuts"]["score_signal"] == k1 and again["criteria"]["audio"]["score"] is None
    assert again["eqi"]["signal_only"] == weighted_index({"cuts": k1, "pacing": 100.0, "color": 100.0, "framing": 100.0},
                                                         config.SIGNAL_CRITERIA)
    assert again["eqi"]["full"] is None
    reviewed = {"video": {"path": "v.mp4"}, "ai": {"model": "m"}, "ai_error": None,
                "criteria": {**{k: {"ai_comment": "ok"} for k in config.SIGNAL_CRITERIA}, "narrative": {"score": 75.0, "level": 4}}}
    merged = rescore(report, ai_from=reviewed)
    assert merged["criteria"]["narrative"]["score"] == 75.0 and merged["ai"] == {"model": "m"}
    assert merged["eqi"]["full"] == weighted_index({"cuts": k1, "pacing": 100.0, "color": 100.0, "framing": 100.0,
                                                    "narrative": 75.0}, list(config.WEIGHTS))
    assert report["criteria"]["narrative"] == {"score": None}  # the saved report itself is not changed


def test_weights_sum_to_one():
    assert sum(config.WEIGHTS.values()) == pytest.approx(1.0)


# ── Loudness parsing ─────────────────────────────────────────────────────────

EBUR128_SAMPLE = """
[Parsed_ebur128_0 @ 0000] t: 0.399979   TARGET:-23 LUFS    M: -21.5 S:-120.7     I: -21.5 LUFS       LRA:   0.0 LU  FTPK: -9.0 dBFS  TPK: -9.0 dBFS
[Parsed_ebur128_0 @ 0000] t: 0.499979   TARGET:-23 LUFS    M: -9.2 S:-120.7     I: -15.0 LUFS       LRA:   0.0 LU  FTPK: -1.0 dBFS  TPK: -0.5 dBFS
[Parsed_ebur128_0 @ 0000] Summary:

  Integrated loudness:
    I:         -15.0 LUFS
    Threshold: -25.3 LUFS

  Loudness range:
    LRA:         6.9 LU
    Threshold:  -35.0 LUFS

  True peak:
    Peak:        0.2 dBFS
"""


def test_parse_ebur128_summary_and_momentary():
    L = parse_ebur128(EBUR128_SAMPLE)
    assert (L.integrated, L.lra, L.true_peak) == (-15.0, 6.9, 0.2)
    assert L.times.tolist() == [0.399979, 0.499979]
    assert L.momentary.tolist() == [-21.5, -9.2]
    assert L.short_term.tolist() == [-120.7, -120.7]


# ── AI layer ─────────────────────────────────────────────────────────────────

def review_json(**overrides):
    data = {
        "narrative_visual_coherence": {"level": 4, "evidence": "00:12 b-roll matches"},
        "issue_reviews": [{"id": "cuts-1", "observation": "same framing", "verdict": "intentional", "confidence": 5, "note": "vlog style"},
                          {"id": "nope-9", "verdict": "error", "note": "unknown id"},
                          {"id": "color-1", "verdict": "maybe", "note": "bad verdict"}],
        "criterion_comments": {"cuts": "fine", "bogus": "dropped"},
        "summary": "Solid.",
        "improvements": ["a", "b", "c", "d"],
    }
    data.update(overrides)
    return json.dumps(data)


def test_parse_review_keeps_only_known_ids_and_verdicts():
    r = ai.parse_review(review_json(), {"cuts-1", "color-1"}, "m", 1.0, [])
    assert r.narrative_level == 4 and r.narrative_score == 75.0
    assert r.verdicts == {"cuts-1": ("intentional", "vlog style")}
    assert r.reviews["cuts-1"] == {"verdict": "intentional", "confidence": 5, "observation": "same framing"}
    assert r.comments == {"cuts": "fine"}
    assert r.improvements == ["a", "b", "c"]


@pytest.mark.parametrize("confidence", [3, None, "high"])
def test_unsure_excuse_keeps_the_issue_as_error(confidence):
    raw = review_json(issue_reviews=[{"id": "cuts-1", "verdict": "false_positive", "confidence": confidence, "note": "n"}])
    r = ai.parse_review(raw, {"cuts-1"}, "m", 1.0, [])
    assert r.verdicts["cuts-1"] == ("error", "n")
    assert r.reviews["cuts-1"]["verdict"] == "false_positive"


def test_long_issue_gets_a_capped_window_around_its_middle():
    shaky = issue("framing", "shaky", t=10.0, t_end=30.0)
    assert ai.zoom_window(shaky, 60.0) == (20.0 - config.AI_ZOOM_MAX_S / 2, 20.0 + config.AI_ZOOM_MAX_S / 2)
    assert ai.zoom_window(issue("cuts", "flash_frame", t=0.5, t_end=0.6), 60.0) == (0.0, 0.6 + config.AI_ZOOM_HALF_S)


@pytest.mark.parametrize("level", [0, 6, "x", None])
def test_parse_review_rejects_invalid_level(level):
    raw = review_json(narrative_visual_coherence={"level": level, "evidence": ""})
    assert ai.parse_review(raw, set(), "m", 1.0, []) is None


def test_global_loudness_is_not_sent_for_review():
    issues = [issue("audio", "loudness_level", iid="audio-1"), issue("cuts", "jump_cut", iid="cuts-1")]
    assert [i.id for i in ai.reviewable(issues)] == ["cuts-1"]


class FakeFiles:
    def __init__(self):
        self.deleted = []

    def upload(self, file):
        from google.genai import types
        return types.File(name="files/abc", uri="https://example/files/abc", mime_type="video/mp4",
                          state=types.FileState.ACTIVE)

    def get(self, name):
        raise AssertionError("not called for ACTIVE uploads")

    def delete(self, name):
        self.deleted.append(name)


class FakeModels:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    def generate_content(self, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return type("Resp", (), {"text": r})()


def _fake_client(monkeypatch, responses, repeats=1):
    from google import genai
    files, models = FakeFiles(), FakeModels(responses)
    monkeypatch.setattr(genai, "Client", lambda api_key: type("C", (), {"files": files, "models": models})())
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(config, "AI_K6_REPEATS", repeats)
    return files, models


def test_review_sends_overview_and_zoom_clips(monkeypatch, tmp_path):
    files, models = _fake_client(monkeypatch, [review_json()])
    issues = [issue("cuts", "flash_frame", t=10.0, t_end=10.07, iid="cuts-1"),
              issue("color", "color_jump", t=20.0, t_end=25.0, iid="color-1")]
    r = ai.review(tmp_path / "v.mp4", 60.0, issues, {"shots": 5})
    parts = models.calls[0]["contents"]
    overview, zoom, prompt = parts[0], parts[1], parts[-1]
    assert overview.video_metadata.fps == 1.0 and overview.video_metadata.start_offset is None
    assert (zoom.video_metadata.start_offset, zoom.video_metadata.end_offset, zoom.video_metadata.fps) == ("9.00s", "11.07s", config.AI_ZOOM_FPS)
    assert len(parts) == 3 and isinstance(prompt, str) and "cuts-1" in prompt
    assert overview.media_resolution.level.name == config.AI_MEDIA_RESOLUTION
    assert zoom.media_resolution.level.name == config.AI_CLIP_RESOLUTION
    cfg = models.calls[0]["config"]
    assert cfg.response_mime_type == "application/json" and cfg.temperature is None
    assert cfg.thinking_config.thinking_level.name == config.AI_THINKING_LEVEL
    assert "flash_frame: the video uses flash transitions repeatedly" in prompt  # rules only for kinds under review
    assert "jump_cut:" not in prompt
    assert "The analyzer measured an unknown number of cuts" in prompt  # metrics here carry no cut count
    assert r.zoom_clips == ["cuts-1"] and files.deleted == ["files/abc"]


def test_k6_prompt_states_the_measured_cuts_and_the_unedited_take_rule():
    one_take = ai.build_prompt(1.0, [], [], {"cuts": 0})
    assert "The analyzer measured no cut." in one_take and "no editing contribution: level 1" in one_take
    assert "The analyzer measured 12 cuts." in ai.build_prompt(1.0, [], [], {"cuts": 12})


def test_clips_go_first_to_events_the_overview_cannot_show(monkeypatch, tmp_path):
    _, models = _fake_client(monkeypatch, [review_json()])
    loud = [issue("audio", "loudness_jump", t=5.0 + i, t_end=5.5 + i, severity=1.0, iid=f"audio-{i}") for i in range(10)]
    flash = issue("cuts", "flash_frame", t=30.0, t_end=30.08, severity=0.5, iid="cuts-1")
    shake = issue("framing", "shaky", t=40.0, t_end=50.0, severity=0.5, iid="framing-1")
    r = ai.review(tmp_path / "v.mp4", 60.0, loud + [flash, shake], {})
    assert r.zoom_clips[:2] == ["cuts-1", "framing-1"] and len(r.zoom_clips) == config.AI_ZOOM_CLIPS
    parts = models.calls[0]["contents"]
    assert parts[2].media_resolution.level.name == config.AI_MEDIA_RESOLUTION  # the jitter clip keeps full detail


def test_review_retries_without_zoom_clips_on_400(monkeypatch, tmp_path):
    from google.genai import errors
    _, models = _fake_client(monkeypatch, [errors.ClientError(400, {"error": {"message": "bad"}}), review_json()])
    r = ai.review(tmp_path / "v.mp4", 60.0, [issue("cuts", "jump_cut", t=5.0, iid="cuts-1")], {})
    assert len(models.calls) == 2 and len(models.calls[1]["contents"]) == 2  # overview + prompt
    assert r is not None and r.zoom_clips == []


def test_review_retries_overload_then_falls_back(monkeypatch, tmp_path):
    from google.genai import errors
    monkeypatch.setattr(ai.time, "sleep", lambda s: None)
    busy = errors.ServerError(503, {"error": {"message": "high demand"}})
    retries = len(config.AI_RETRY_DELAYS_S) + 1
    _, models = _fake_client(monkeypatch, [busy] * retries + [review_json()])
    r = ai.review(tmp_path / "v.mp4", 60.0, [], {})
    assert [c["model"] for c in models.calls] == [config.GEMINI_MODEL_DEFAULT] * retries + [config.GEMINI_FALLBACK_MODEL]
    assert r.model == config.GEMINI_FALLBACK_MODEL


def test_review_recovers_from_one_overload_on_same_model(monkeypatch, tmp_path):
    from google.genai import errors
    monkeypatch.setattr(ai.time, "sleep", lambda s: None)
    _, models = _fake_client(monkeypatch, [errors.ServerError(503, {"error": {"message": "busy"}}), review_json()])
    r = ai.review(tmp_path / "v.mp4", 60.0, [], {})
    assert len(models.calls) == 2 and r.model == config.GEMINI_MODEL_DEFAULT


def test_review_unknown_model_goes_straight_to_fallback(monkeypatch, tmp_path):
    from google.genai import errors
    monkeypatch.setattr(ai.time, "sleep", lambda s: None)
    _, models = _fake_client(monkeypatch, [errors.ClientError(404, {"error": {"message": "gone"}}), review_json()])
    r = ai.review(tmp_path / "v.mp4", 60.0, [], {})
    assert [c["model"] for c in models.calls] == [config.GEMINI_MODEL_DEFAULT, config.GEMINI_FALLBACK_MODEL]
    assert r.model == config.GEMINI_FALLBACK_MODEL


def test_review_long_video_lowers_overview_fps(monkeypatch, tmp_path):
    _, models = _fake_client(monkeypatch, [review_json()])
    ai.review(tmp_path / "v.mp4", 1800.0, [], {})
    assert models.calls[0]["contents"][0].video_metadata.fps == pytest.approx(config.AI_OVERVIEW_MAX_FRAMES / 1800)


def test_k6_is_the_mean_of_independent_runs_on_one_upload(monkeypatch, tmp_path):
    files, models = _fake_client(monkeypatch, [review_json(narrative_visual_coherence={"level": 3, "evidence": "a"}),
                                               review_json(narrative_visual_coherence={"level": 4, "evidence": "b"})], repeats=2)
    r = ai.review(tmp_path / "v.mp4", 60.0, [issue("cuts", "jump_cut", t=5.0, iid="cuts-1")], {})
    assert len(models.calls) == 2 and files.deleted == ["files/abc"]  # one upload, two answers
    assert r.narrative_levels == [3, 4] and r.narrative_level == 3.5 and r.narrative_score == 62.5
    assert r.narrative_evidence == "a" and r.run_models == [config.GEMINI_MODEL_DEFAULT] * 2
    assert len(r.usage) == 2 and set(r.usage[0]) >= {"model", "prompt_token_count", "thoughts_token_count"}


def test_unparseable_answer_is_asked_for_again(monkeypatch, tmp_path):
    _, models = _fake_client(monkeypatch, ["Sorry, here is my review: {", review_json()])
    r = ai.review(tmp_path / "v.mp4", 60.0, [], {})
    assert len(models.calls) == 2 and r.narrative_level == 4


def test_answers_that_never_parse_are_kept_for_the_report(monkeypatch, tmp_path):
    _fake_client(monkeypatch, ["not json", ""])
    with pytest.raises(ai.UnparseableResponse) as err:
        ai.review(tmp_path / "v.mp4", 60.0, [], {})
    assert err.value.raw == ["not json", ""] and len(err.value.raw) == config.AI_PARSE_ATTEMPTS


def test_an_api_error_after_a_good_run_keeps_that_run(monkeypatch, tmp_path):
    from google.genai import errors
    _, models = _fake_client(monkeypatch, [review_json(), errors.ClientError(403, {"error": {"message": "quota"}})], repeats=2)
    r = ai.review(tmp_path / "v.mp4", 60.0, [], {})
    assert len(models.calls) == 2 and r.narrative_levels == [4]


# ── Video-relative thresholds ────────────────────────────────────────────────

def test_weighted_quantile_follows_screen_time():
    from eqi.criteria import weighted_quantile
    # Splitting a shot into two parts with the same value changes nothing
    assert weighted_quantile([1, 5, 9], [2, 1, 1]) == weighted_quantile([1, 1, 5, 9], [1, 1, 1, 1])
    # A value holding most of the screen time is the answer itself
    assert weighted_quantile([3, 10, 20], [8, 1, 1]) == 3
    # A short shot added elsewhere moves it a little, not to the neighbouring value
    base = weighted_quantile([10, 20, 30, 40], [1, 1, 1, 1])
    assert abs(weighted_quantile([10, 20, 30, 40, 100], [1, 1, 1, 1, 0.05]) - base) < 1.0


def _features(shot_lengths, lab=None, diff=None, keyframes=(), fps=30.0):
    from eqi.features import Shot, VisualFeatures
    from eqi.media import VideoInfo
    bounds = np.concatenate([[0], np.cumsum(shot_lengths)]).astype(int)
    n = int(bounds[-1])
    shots = [Shot(i, int(a), int(b), fps) for i, (a, b) in enumerate(zip(bounds, bounds[1:]))]
    info = VideoInfo(Path("v.mp4"), fps, n, 640, 360, n / fps, True)
    return VisualFeatures(info, shots,
                          lab=np.zeros((n, 3)) if lab is None else lab,
                          diff=np.full(n, 0.8) if diff is None else diff,
                          ncc=np.ones(n), stable=np.full(n, 0.9),
                          motion=np.zeros((n, 2)), motion_conf=np.ones(n), keyframes=list(keyframes))


def _lab_per_shot(shot_lengths, values):
    return np.concatenate([np.tile(v, (n, 1)) for n, v in zip(shot_lengths, values)]).astype(float)


def test_colour_mismatch_severity_ramps_from_the_threshold():
    from eqi.criteria import assess_color
    lengths = [60] * 6
    grade = [50.0, 0.0, 0.0]
    # ΔE00 ≈ 6 (half way to full severity at twice the 4.0 threshold) and ≈ 4.2 (within the margin)
    values = [grade, grade, [50.0, 4.63, 0.0], grade, [50.0, 3.09, 0.0], grade]
    issues = [i for i in assess_color(_features(lengths, _lab_per_shot(lengths, values))).issues if i.kind == "color_jump"]
    assert len(issues) == 1 and issues[0].t == 4.0
    d = issues[0].detail
    assert d["threshold"] == 4.0
    assert issues[0].severity == pytest.approx((d["delta_e2000_vs_grade"] - 4.0) / 4.0, abs=0.01)


def test_a_short_fragment_moves_the_colour_threshold_far_less_than_one_vote_per_shot():
    from eqi.criteria import grade_statistics
    from skimage.color import deltaE_ciede2000

    def one_vote(x):  # the previous rule: plain median and MAD over shots
        d = deltaE_ciede2000(x, np.broadcast_to(np.median(x, axis=0), x.shape))
        return max(4.0, np.median(d) + 3 * 1.4826 * np.median(np.abs(d - np.median(d))))

    lab = np.array([[50.0, a, 0.0] for a in (0, 2, 4, 6, 8, 10, 12)])
    # A 1/3 s fragment of another look (e.g. the rest of a cut-up shot) appears elsewhere
    with_fragment = np.vstack([lab, [[50.0, 30.0, 0.0]]])
    weighted = grade_statistics(with_fragment, [60] * 7 + [10])[2] / grade_statistics(lab, [60] * 7)[2] - 1
    plain = one_vote(with_fragment) / one_vote(lab) - 1
    assert abs(weighted) < 0.05 and abs(weighted) < abs(plain) / 3


def test_a_long_mismatched_shot_is_not_hidden_by_its_length():
    from eqi.criteria import grade_statistics, weighted_quantile
    from skimage.color import deltaE_ciede2000
    # An interview: ten 2 s soundbites in one grade, and one 20 s shot graded ≈ 6 ΔE00 off
    lab = np.array([[50.0, 0.1 * (i % 3), 0.0] for i in range(10)] + [[50.0, 4.63, 0.0]])
    lengths = [60] * 10 + [600]
    _, deviation, threshold = grade_statistics(lab, lengths)
    assert deviation[-1] > 1.1 * threshold
    # Weighting by screen time alone would make the long shot half the reference
    w = np.array(lengths, float)
    ref = np.array([weighted_quantile(lab[:, c], w) for c in range(3)])
    d = deltaE_ciede2000(lab, np.broadcast_to(ref, lab.shape))
    med = weighted_quantile(d, w)
    assert d[-1] < max(4.0, med + 3 * 1.4826 * weighted_quantile(np.abs(d - med), w))


def test_dips_to_black_are_not_colour_mismatches():
    from eqi.criteria import assess_color
    lengths = [60, 30, 60, 30, 60, 60]
    grade, black = [50.0, 2.0, 2.0], [0.0, 0.0, 0.0]
    values = [grade, black, grade, black, grade, grade]
    issues = assess_color(_features(lengths, _lab_per_shot(lengths, values))).issues
    assert not [i for i in issues if i.kind == "color_jump"]


def test_soft_focus_severity_ramps_and_skips_the_margin():
    from eqi.criteria import assess_framing
    from eqi.features import Keyframe
    sharp = [100.0] * 6 + [34.0, 20.0, 17.5]  # threshold 0.35 × 100 = 35; 34 is within the margin
    keys = [Keyframe(i, i * 10 + 5, (i * 10 + 5) / 30, [], None, None, None, s, 0.0, 0.0) for i, s in enumerate(sharp)]
    issues = [i for i in assess_framing(_features([10] * len(sharp), keyframes=keys)).issues if i.kind == "soft_focus"]
    assert [i.t for i in issues] == [round(70 / 30, 3), round(80 / 30, 3)]
    assert issues[0].severity == pytest.approx(config.SEVERITY["soft_focus"] * (35 - 20) / 17.5, abs=0.01)
    assert issues[1].severity == config.SEVERITY["soft_focus"]  # at half the threshold: full severity


def test_frozen_stretch_does_not_turn_movement_into_jump_cuts():
    from eqi.criteria import assess_cuts
    rng = np.random.default_rng(0)
    diff = np.abs(rng.normal(0.8, 0.6, 300))
    diff[40:220] = 0.002                      # six seconds of frozen picture: most of the shot
    for frame in (250, 280):                  # ordinary movement afterwards
        diff[frame - 1], diff[frame], diff[frame + 1] = 0.5, 2.4, 0.5
    cuts = assess_cuts(_features([300], diff=diff))
    assert not [i for i in cuts.issues if i.kind == "jump_cut"]


def test_the_jump_when_a_freeze_frame_ends_is_not_a_jump_cut():
    from eqi.criteria import assess_cuts
    diff = np.abs(np.random.default_rng(5).normal(0.8, 0.2, 300))
    diff[150] = 6.0
    f = _features([300], diff=diff)
    assert [i.kind for i in assess_cuts(f).issues] == ["jump_cut"]
    f.diff[100:150] = 0.0  # the picture was frozen for the 1.7 s before: the action resumes, it was not cut
    assert assess_cuts(f).issues == []


def test_a_take_without_cuts_is_split_only_where_the_scene_changes_completely():
    from eqi.features import slow_dissolves
    rng = np.random.default_rng(4)
    scenes = [rng.random(128).astype(np.float32) for _ in range(3)]

    def hists(order, seconds=10, fps=10):
        out = []
        for k in order:  # each scene moves a little from frame to frame
            out += [scenes[k] + 0.05 * rng.random(128).astype(np.float32) for _ in range(seconds * fps)]
        return out

    cuts = slow_dissolves(hists([0, 1, 2]), 10.0)
    assert len(cuts) == 2 and abs(cuts[0] - 100) <= 5 and abs(cuts[1] - 200) <= 5
    assert slow_dissolves(hists([0, 0, 0]), 10.0) == []   # one moving take
    assert slow_dissolves(hists([0, 1]), 10.0) == []      # a single change is not yet an edit


def test_a_lamp_switching_on_is_not_a_flash_frame_but_a_white_frame_is():
    from eqi.criteria import assess_cuts
    dark = np.random.default_rng(1).integers(20, 120, (90, 160))

    def kinds(before, step, after):
        f = _features([60, 1, 59])  # a one-frame shot between two cuts
        f.stable[:] = 0.3
        for n in range(57, 60):
            f.boundary[n] = before.astype(np.uint8)
        f.boundary[60] = step.astype(np.uint8)
        for n in range(61, 64):
            f.boundary[n] = after.astype(np.uint8)
        return [i.kind for i in assess_cuts(f).issues]

    # The frame between the dark and the lit picture is a step of the change of light
    assert kinds(dark, dark + 40, dark + 80) == []
    # A white frame leaves the range of both neighbours: a flash frame
    assert kinds(dark, np.full_like(dark, 255), dark) == ["flash_frame"]


def test_a_cut_that_only_changes_the_light_is_not_a_jump_cut():
    from eqi.criteria import assess_cuts
    before = np.random.default_rng(2).integers(40, 160, (90, 160))
    f = _features([100, 100])
    f.stable[:] = 0.3
    f.stable[100] = 0.9  # most of the picture unchanged across the cut
    f.boundary[99] = before.astype(np.uint8)
    f.boundary[100] = np.roll(before, 12, axis=1).astype(np.uint8)  # the picture jumped
    assert [i.kind for i in assess_cuts(f).issues] == ["jump_cut"]
    lit = before.copy()
    lit[:, :60] += 50  # part of the scene lit up (a muzzle flash): every change is brighter
    f.boundary[100] = lit.astype(np.uint8)
    assert assess_cuts(f).issues == []


def test_a_change_of_light_inside_a_shot_is_not_a_hidden_jump_cut():
    from eqi.criteria import assess_cuts
    diff = np.abs(np.random.default_rng(3).normal(0.8, 0.2, 300))
    diff[150] = 6.0
    f = _features([300], diff=diff)
    f.luma = np.full(300, 100.0)  # the mean brightness stays: pixels moved both ways
    assert [i.kind for i in assess_cuts(f).issues] == ["jump_cut"]
    f.luma[150:] = 106.0  # the whole change is a brightening: a light came on
    assert assess_cuts(f).issues == []


def test_a_silent_end_or_title_card_is_not_dead_air_but_a_freeze_before_it_is():
    from eqi.audio import AudioFeatures
    from eqi.criteria import assess_pacing
    diff = np.full(810, 3.0)
    diff[600:] = 0.0  # a 4 s freeze at the end of the last scene, then a 3 s end card
    f = _features([720, 90], diff=diff)

    def dead_air(*runs):
        a = AudioFeatures(True, silence_runs=list(runs))
        return [(i.t, i.t_end) for i in assess_pacing(f, a).issues if i.kind == "dead_air"]

    assert dead_air((20.0, 27.0)) == [(20.0, 24.0)]  # the freeze counts, the card after its cut does not
    assert dead_air((24.1, 27.0)) == []               # only the end card is silent
    g = _features([90, 720], diff=np.where(np.arange(810) < 90, 0.0, 3.0))
    a = AudioFeatures(True, silence_runs=[(0.0, 2.9)])
    assert not [i for i in assess_pacing(g, a).issues if i.kind == "dead_air"]  # a silent title card
    # The last shot freezes and runs silent to the end: no cut marks a card, so it is dead air
    h = _features([600, 210], diff=np.where(np.arange(810) < 650, 3.0, 0.0))
    a = AudioFeatures(True, silence_runs=[(21.7, 27.0)])
    assert [(i.t, i.t_end) for i in assess_pacing(h, a).issues if i.kind == "dead_air"] == [(21.7, 27.0)]


def test_recurring_loudness_jumps_are_sound_design_and_a_lone_burst_is_an_error():
    from eqi.audio import AudioFeatures, Loudness
    from eqi.criteria import assess_audio
    t = np.arange(0.1, 60.0, 0.1)

    def jumps(starts):
        m = np.full(t.size, -24.0)
        for start in starts:
            m[(t > start) & (t < start + 1.0)] = -8.0
        L = Loudness(-22.0, 8.0, -2.0, t, m, np.full(t.size, -24.0))
        return [i for i in assess_audio(AudioFeatures(True, L), 60.0).issues if i.kind == "loudness_jump"]

    hits = jumps([10, 25, 40])  # a trailer's recurring hits
    assert len(hits) == 3 and all(i.severity == 0.0 and "style" in i.detail for i in hits)
    burst = jumps([25])
    assert len(burst) == 1 and burst[0].severity > 0


def test_majority_of_frames_decides_whether_a_shot_has_a_face():
    from eqi.features import Keyframe, combine_keyframes
    face = Keyframe(0, 50, 1.6, [(0.4, 0.2, 0.2, 0.3)], (0.5, 0.35), (0.4, 0.2, 0.2, 0.3), "face", 100.0, 0.0, 0.0, 120.0)
    def salient(frame, x, sharpness):
        return Keyframe(0, frame, frame / 30, [], (x, 0.5), (x - 0.05, 0.4, 0.1, 0.2), "saliency", sharpness, 0.0, 0.0)
    lone_face = combine_keyframes([face, salient(25, 0.9, 80.0), salient(75, 0.7, 60.0)])
    assert lone_face.subject_source == "saliency" and lone_face.sharpness == 80.0
    assert lone_face.subject[0] == 0.9 or lone_face.subject[0] == 0.7
    two_faces = combine_keyframes([face, face, salient(75, 0.7, 60.0)])
    assert two_faces.subject_source == "face" and two_faces.frame == 50


def test_colour_card_reference_for_both_tests():
    from eqi.figures import colour_reference
    assert colour_reference({"lab_grade": [40.0, 1.0, 2.0], "lab_shot": [0, 0, 0]}) == ([40.0, 1.0, 2.0], "grade")
    assert colour_reference({"lab_neighbours": [[50, 0, 0], [52, 2, 2]], "lab_shot": [0, 0, 0]}) == ([51.0, 1.0, 1.0], "neighbours")


# ── Tier-1 matching ──────────────────────────────────────────────────────────

def test_side_effects_count_other_kinds_away_from_the_defect():
    from eqi.evaluate import match
    truth = {"kind": "shake", "criterion": "framing", "events": [{"t": 0.0, "t_end": 8.0}]}
    def rep(color, framing):
        return {"criteria": {"color": {"issues": color}, "framing": {"issues": framing}}}
    clean = rep([{"kind": "color_jump", "t": 30.0, "t_end": 40.0, "severity": 1.0},
                 {"kind": "color_jump", "t": 45.0, "t_end": 50.0, "severity": 0.6}],
                [{"kind": "placement", "t": 3.0, "t_end": 8.0, "severity": 0.2}])
    variant = rep([{"kind": "color_jump", "t": 30.0, "t_end": 40.0, "severity": 1.0},
                   {"kind": "color_jump", "t": 60.0, "t_end": 90.0, "severity": 0.4},   # flipped on far away
                   {"kind": "flicker", "t": 2.0, "t_end": 8.0, "severity": 0.5}],      # at the defect
                  [{"kind": "shaky", "t": 0.0, "t_end": 8.0, "severity": 0.5}])        # 45 s colour issue flipped off;
    m = match(truth, variant, clean)                                                  # placement gone at the defect
    assert (m["detected"], m["false_alarms"]) == (1, 0)
    assert (m["other_new_at"], m["other_new_away"], m["other_new_away_severity"]) == (1, 1, 0.4)
    assert (m["clean_lost_away"], m["clean_lost_away_severity"]) == (1, 0.6)


def test_ai_check_scores_kept_defects_and_excused_clean_issues(tmp_path, monkeypatch):
    from eqi import evaluate
    t1 = tmp_path / "tier1_x"
    (t1 / "videos").mkdir(parents=True)
    (t1 / "tier1_results.json").write_text(json.dumps({"source": "src/x.mp4"}), encoding="utf-8")
    for name in ("x__clean", "x__flash_frame_L2"):
        (t1 / "videos" / f"{name}.mp4").write_bytes(b"")
    (t1 / "videos" / "x__flash_frame_L2.truth.json").write_text(json.dumps(
        {"kind": "flash_frame", "criterion": "cuts", "events": [{"t": 5.0, "t_end": 5.07}]}), encoding="utf-8")

    def fake_analyze(video, dest, **kwargs):
        def i(kind, t, verdict, conf):
            return {"id": f"{kind}-1", "kind": kind, "t": t, "t_end": t + 0.07, "severity": 1.0, "verdict": verdict,
                    "ai_review": {"verdict": verdict, "confidence": conf, "observation": "seen"}}
        clean = "clean" in video.name
        crit = {k: {"issues": []} for k in config.SIGNAL_CRITERIA}
        if clean:
            crit["color"]["issues"] = [i("underexposed", 2.0, "intentional", 5)]
        else:
            crit["cuts"]["issues"] = [i("flash_frame", 5.0, "error", 4)]
        crit["narrative"] = {"level": 3.5, "levels": [3, 4]}
        return {"criteria": crit, "ai": {"model": "m"}, "ai_error": None}

    monkeypatch.setattr(evaluate, "analyze", fake_analyze)
    monkeypatch.delenv("GEMINI_FALLBACK_MODEL", raising=False)  # ai_check pins it; restored after the test
    r = evaluate.ai_check([t1], tmp_path / "out", model="m")
    assert os.environ["GEMINI_FALLBACK_MODEL"] == "m"  # one model for every video
    assert r["true_defects_kept_as_error"] == [1, 1] and r["clean_issues_excused"] == [1, 1]
    assert r["balanced_accuracy"] == 1.0 and r["k6"] == [{"video": "tier1_x/clean", "level": 3.5, "levels": [3, 4]}]
    assert (tmp_path / "out" / "ai_check.md").exists() and not r["failed"]


def test_neighbouring_shot_issues_are_not_the_same_finding():
    from eqi.evaluate import same_issue
    shot_a = {"kind": "subject_cut_off", "t": 46.67, "t_end": 54.46}
    shot_b = {"kind": "subject_cut_off", "t": 54.46, "t_end": 59.92}
    assert not same_issue(shot_a, shot_b)
    assert same_issue(shot_b, {**shot_b, "t": 54.5})
    assert same_issue({"kind": "jump_cut", "t": 25.875, "t_end": 25.875}, {"kind": "jump_cut", "t": 25.917, "t_end": 25.917})
    assert not same_issue({"kind": "jump_cut", "t": 25.9, "t_end": 25.9}, {"kind": "flash_frame", "t": 25.9, "t_end": 25.9})


# ── Statistics ───────────────────────────────────────────────────────────────

def test_correlation_stats_perfect_rank_agreement():
    x = np.linspace(0, 100, 30)
    s = correlation_stats(x, 1 + 4 / (1 + np.exp(-(x - 50) / 10)), n_boot=50)
    assert s["srcc"]["value"] == pytest.approx(1.0)
    assert s["plcc"]["value"] > 0.99 and s["n"] == 30


def test_paired_srcc_difference_favours_the_predictor_that_follows_the_ratings():
    from eqi.evaluate import paired_srcc_difference
    rng = np.random.default_rng(1)
    mos = np.linspace(1, 5, 40)
    close, loose = mos + rng.normal(0, 0.2, 40), mos + rng.normal(0, 2.0, 40)
    d = paired_srcc_difference(close, loose, mos, n_boot=300)
    assert d["delta_srcc"] > 0 and d["ci95"][0] > 0 and d["n"] == 40


def test_tier2_compares_eqi_with_the_dover_baseline(tmp_path):
    import csv
    from eqi.evaluate import tier2
    rng = np.random.default_rng(2)
    quality = np.linspace(20, 90, 12)
    with open(tmp_path / "scores.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["video", "eqi_signal", "eqi_full", "dover_overall", "dover_aesthetic", "dover_technical"])
        for i, q in enumerate(quality):
            w.writerow([f"v{i}", q + rng.normal(0, 3), q + rng.normal(0, 3), 0.5 + rng.normal(0, 0.1), 0.5, 0.5 + q / 1000])
    with open(tmp_path / "ratings.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["video", "rater", "overall"])
        for i, q in enumerate(quality):
            for r in range(4):
                w.writerow([f"v{i}", f"r{r}", round(1 + 4 * (q - 20) / 70 + rng.normal(0, 0.3), 2)])
    result = tier2(tmp_path / "scores.csv", tmp_path / "ratings.csv", tmp_path / "out")
    assert {"eqi_full", "eqi_signal", "dover_overall"} <= set(result["correlations"])
    assert "dover_aesthetic" not in result["correlations"]  # constant column: skipped, not NaN
    assert result["vs_dover"]["eqi_full"]["delta_srcc"] > 0


def test_dover_scores_come_from_one_runner_process(monkeypatch):
    from eqi import baseline
    calls = []

    def fake_run(cmd, input, **kwargs):
        calls.append((cmd, input))
        out = "\n".join([json.dumps({"video": "a.mp4", "technical": 0.1, "aesthetic": 0.0, "overall": 0.7}),
                         "loading weights...", json.dumps({"video": "b.mp4", "error": "IOError: cannot open"})])
        return type("Done", (), {"stdout": out, "stderr": "", "returncode": 0})()

    monkeypatch.setattr(baseline, "available", lambda: True)
    monkeypatch.setattr(baseline.subprocess, "run", fake_run)
    scores = baseline.dover_scores([Path("a.mp4"), Path("b.mp4")])
    assert len(calls) == 1 and calls[0][1] == "a.mp4\nb.mp4"
    assert scores == {"a.mp4": {"technical": 0.1, "aesthetic": 0.0, "overall": 0.7}, "b.mp4": {"error": "IOError: cannot open"}}


def test_dover_not_set_up_says_how_to_set_it_up(monkeypatch, tmp_path):
    from eqi import baseline
    monkeypatch.setenv("DOVER_PYTHON", str(tmp_path / "missing" / "python.exe"))
    with pytest.raises(RuntimeError, match="not set up"):
        baseline.dover_scores([Path("a.mp4")])


def test_icc_identical_raters_is_one_and_noise_lowers_it():
    truth = np.linspace(1, 5, 20)
    assert icc2(np.column_stack([truth] * 4))["icc2_1"] == pytest.approx(1.0)
    noisy = np.column_stack([truth + np.random.default_rng(i).normal(0, 1, 20) for i in range(4)])
    assert icc2(noisy)["icc2_1"] < 1.0
    assert 0 < split_half(noisy) <= 1.0


# ── End to end on synthetic video (≈20 s) ────────────────────────────────────

@pytest.fixture(scope="module")
def synthetic(tmp_path_factory):
    from eqi.inject import make_synthetic_source
    d = tmp_path_factory.mktemp("synth")
    return make_synthetic_source(d / "clean.mp4", n_shots=4, shot_s=4.0), d


def test_clean_synthetic_has_no_issues(synthetic):
    from eqi.pipeline import analyze
    src, _ = synthetic
    report = analyze(src, None, use_ai=False)
    assert report["eqi"]["signal_only"] == 100.0
    assert all(not c.get("issues") for c in report["criteria"].values())
    assert len(report["shots"]) == 4


def test_html_report_escapes_model_text(synthetic):
    from eqi import html_report
    from eqi.pipeline import analyze
    src, _ = synthetic
    report = analyze(src, None, use_ai=False)
    report["criteria"]["cuts"]["issues"] = [{"id": "cuts-1", "criterion": "cuts", "kind": "jump_cut", "t": 1.0, "t_end": 1.0,
                                             "severity": 0.6, "detail": {"stable": 0.9}, "verdict": "error", "note": "<script>x</script>"}]
    report["ai"] = {"model": "m", "summary": "a & b", "improvements": ["<b>bold</b>"], "verdict_counts": {"error": 1}}
    page = html_report.render(report, None)
    assert "<script>" not in page and "&lt;script&gt;x" in page and "a &amp; b" in page
    assert "Measured only" in page and "cuts-1" in page


def test_ai_verdicts_do_not_change_the_score(synthetic, monkeypatch):
    from eqi import pipeline
    from eqi.inject import inject
    from eqi.report import weighted_index
    src, d = synthetic
    truth = inject(src, "flash_frame", 2, d / "flash_for_ai.mp4")

    def excuse_everything(video, duration, issues, metrics, model=None, **kwargs):
        return ai.AiReview("fake", 5, "", {i.id: ("intentional", "style") for i in issues}, {}, "", [], 1.0, [])

    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(pipeline.ai_layer, "review", excuse_everything)
    r = pipeline.analyze(Path(truth["video"]), None, use_ai=True, make_figures=False)
    measured = {k: r["criteria"][k]["score_signal"] for k in config.SIGNAL_CRITERIA}
    assert r["criteria"]["cuts"]["issues"][0]["verdict"] == "intentional"  # still reported
    assert r["eqi"]["full"] == weighted_index({**measured, "narrative": 100.0}, list(config.WEIGHTS))
    assert r["eqi"]["full_with_ai_verdicts"] > r["eqi"]["full"]  # the ablation shows what the excuses would hide


def test_unparsed_answers_land_in_the_report(synthetic, monkeypatch):
    from eqi import pipeline
    src, _ = synthetic

    def never_json(*args, **kwargs):
        raise ai.UnparseableResponse(["I think the edit is fine."])

    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(pipeline.ai_layer, "review", never_json)
    r = pipeline.analyze(src, None, use_ai=True, make_figures=False)
    assert "could not be parsed" in r["ai_error"] and r["ai_unparsed_responses"] == ["I think the edit is fine."]
    assert r["eqi"]["full"] is None and r["eqi"]["signal_only"] == 100.0


def test_colour_shift_leaves_the_other_shots_untouched(synthetic):
    from eqi.inject import inject, reencode
    from eqi.media import grab_frame
    src, d = synthetic
    clean = reencode(src, d / "clean_ref.mp4")
    truth = inject(src, "color_jump", 3, d / "colour_only.mp4")
    t0, t1 = truth["events"][0]["t"], truth["events"][1]["t"]
    fps = 30
    away = [round(t * fps) for t in (t0 - 1.5, t1 + 1.5) if 0 <= t < 16.0]
    assert away
    for frame in away:  # more than a second from the shifted shot: identical pixels
        assert np.array_equal(grab_frame(clean, frame), grab_frame(Path(truth["video"]), frame))
    inside = round((t0 + t1) / 2 * fps)
    assert not np.array_equal(grab_frame(clean, inside), grab_frame(Path(truth["video"]), inside))


@pytest.mark.parametrize("kind,level", [("flash_frame", 2), ("jump_cut", 3), ("loudness_jump", 3), ("color_jump", 3)])
def test_injected_defect_is_detected(synthetic, kind, level):
    from eqi.evaluate import match
    from eqi.inject import inject
    from eqi.pipeline import analyze
    src, d = synthetic
    truth = inject(src, kind, level, d / f"{kind}.mp4")
    report = analyze(Path(truth["video"]), None, use_ai=False)
    m = match(truth, report, None)
    assert m["detected"] == m["events"] and m["false_alarms"] == 0
