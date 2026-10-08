"""Visual proof for the article: issue timeline heatmap, per-issue evidence
cards (frames around cuts, colour swatches, framing overlays), loudness curve,
beat/cut alignment and the score chart."""

from pathlib import Path

import cv2
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from skimage.color import lab2rgb  # noqa: E402

from . import config  # noqa: E402
from .audio import AudioFeatures  # noqa: E402
from .features import VisualFeatures  # noqa: E402
from .media import grab_frame  # noqa: E402

ROW_ORDER = config.SIGNAL_CRITERIA
GLOBAL_KINDS = {"loudness_level", "true_peak", "loudness_range"}
CUT_KINDS = {"flash_frame", "jump_cut", "motion_clash"}
FRAMING_BOX_KINDS = {"subject_cut_off", "headroom", "placement", "soft_focus"}


def _ts(t: float) -> str:
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def _rgb(frame: np.ndarray | None) -> np.ndarray:
    if frame is None:
        return np.zeros((90, 160, 3), dtype=np.uint8)
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def _effective(issue: dict, use_verdict: bool) -> float:
    if use_verdict and issue.get("verdict"):
        return issue["severity"] * config.VERDICT_FACTOR.get(issue["verdict"], 1.0)
    return issue["severity"]


def _score_text(c: dict) -> str:
    s = c["score"]
    return "n/a" if s is None else f"{s:.0f}"


def timeline(report: dict, out: Path) -> Path:
    duration = report["video"]["duration_s"]
    use_verdict = report["ai"] is not None and config.AI_VERDICTS_IN_SCORE
    bin_s = max(0.5, duration / 300)
    n_bins = int(np.ceil(duration / bin_s)) or 1
    grid = np.zeros((len(ROW_ORDER), n_bins))
    for r, k in enumerate(ROW_ORDER):
        for issue in report["criteria"][k]["issues"]:
            if issue["kind"] in GLOBAL_KINDS:
                continue
            b0 = int(issue["t"] // bin_s)
            b1 = max(b0 + 1, int(np.ceil(issue["t_end"] / bin_s)))
            grid[r, b0:min(b1, n_bins)] += _effective(issue, use_verdict)

    fig, ax = plt.subplots(figsize=(12, 3.2), dpi=150)
    im = ax.imshow(np.clip(grid, 0, 1), aspect="auto", cmap="Reds", vmin=0, vmax=1,
                   extent=(0, n_bins * bin_s, len(ROW_ORDER) - 0.5, -0.5), interpolation="nearest")
    for s in report["shots"][1:]:
        ax.axvline(s["start_s"], color="#4c6ef5", lw=0.6, alpha=0.5)
    labels = []
    for k in ROW_ORDER:
        c = report["criteria"][k]
        globals_ = [i["kind"] for i in c["issues"] if i["kind"] in GLOBAL_KINDS]
        labels.append(f"{config.SHORT_LABELS[k]} ({_score_text(c)})" + (f"\n*{', '.join(globals_)}" if globals_ else ""))
    ax.set_yticks(range(len(ROW_ORDER)), labels, fontsize=7)
    ax.set_xlabel("time (s) — blue lines: detected cuts", fontsize=8)
    eqi = report["eqi"]
    title = f"EQI (signal) {eqi['signal_only']}" + (f"  |  EQI (full, AI-verified + K6) {eqi['full']}" if eqi["full"] is not None else "")
    ax.set_title(title, fontsize=9)
    fig.colorbar(im, ax=ax, fraction=0.02, pad=0.01, label="issue severity")
    fig.tight_layout()
    path = out / "timeline.png"
    fig.savefig(path)
    plt.close(fig)
    return path


def scores_chart(report: dict, out: Path) -> Path:
    keys = list(config.WEIGHTS)
    crit = report["criteria"]
    used = [crit[k]["score"] if crit[k]["score"] is not None else np.nan for k in keys]
    ablation = [crit[k]["score_with_ai_verdicts"] if crit[k]["score_with_ai_verdicts"] is not None else np.nan for k in keys]
    y = np.arange(len(keys))
    with_ai = report["ai"] is not None and not config.AI_VERDICTS_IN_SCORE
    fig, ax = plt.subplots(figsize=(7, 3.4), dpi=150)
    ax.barh(y - (0.18 if with_ai else 0), used, height=0.36, color="#4c6ef5", label="score (K1–K5 measured, K6 rated by AI)")
    if with_ai:
        ax.barh(y + 0.18, ablation, height=0.36, color="#ced4da", label="if AI verdicts discounted issues (not used)")
    ax.set_yticks(y, [f"{crit[k]['label']} (w={config.WEIGHTS[k]:.2f})" for k in keys], fontsize=7)
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel("score (0–100)", fontsize=8)
    ax.legend(fontsize=7, loc="upper center", bbox_to_anchor=(0.5, -0.2), ncol=2, frameon=False)
    full = report["eqi"]["full"]
    ax.set_title(f"EQI {'n/a (no AI layer)' if full is None else full}  |  measured only (K1–K5) {report['eqi']['signal_only']}", fontsize=9)
    fig.tight_layout()
    path = out / "scores.png"
    fig.savefig(path)
    plt.close(fig)
    return path


def loudness_chart(a: AudioFeatures, report: dict, out: Path) -> Path | None:
    if not a.has_audio or a.loudness is None or a.loudness.momentary.size == 0:
        return None
    L = a.loudness
    m = np.where(L.momentary < -70, np.nan, L.momentary)
    fig, ax = plt.subplots(figsize=(12, 2.8), dpi=150)
    ax.plot(L.times, m, color="#495057", lw=0.8, label="momentary loudness (400 ms)")
    lo, hi = config.LOUDNESS_TARGET_RANGE_LUFS
    ax.axhspan(lo, hi, color="#2f9e44", alpha=0.10, lw=0, label=f"accepted levels {lo:g} to {hi:g} LUFS")
    if np.isfinite(L.integrated):
        ax.axhline(L.integrated, color="#4c6ef5", ls=":", lw=0.8, label=f"integrated {L.integrated:.1f} LUFS")
    for t0, t1 in a.silence_runs:
        ax.axvspan(t0, t1, color="#ffd43b", alpha=0.3, lw=0)
    for issue in report["criteria"]["audio"]["issues"]:
        if issue["kind"] == "loudness_jump":
            ax.axvline(issue["t_end"], color="#e03131", lw=1.0)
            ax.annotate(f"+{issue['detail']['rise_lu']} LU", (issue["t_end"], np.nanmax(m)), fontsize=7, color="#e03131")
    ax.set_xlabel("time (s) — yellow: silence runs, red: loudness jumps", fontsize=8)
    ax.set_ylabel("LUFS", fontsize=8)
    ax.legend(fontsize=7, loc="lower left")
    ax.set_title(f"Loudness (ITU-R BS.1770 / EBU R128): LRA {L.lra:.1f} LU, true peak {L.true_peak:.1f} dBTP", fontsize=9)
    fig.tight_layout()
    path = out / "loudness.png"
    fig.savefig(path)
    plt.close(fig)
    return path


def beats_chart(f: VisualFeatures, a: AudioFeatures, report: dict, out: Path, window_s: float = 40.0) -> Path | None:
    ctx = report["criteria"]["pacing"]["context"]
    if not a.music_driven or ctx.get("beat_score") is None:
        return None
    fig, ax = plt.subplots(figsize=(12, 1.8), dpi=150)
    beats = a.beats[a.beats <= window_s]
    cuts = np.array([s.t0 for s in f.shots[1:] if s.t0 <= window_s])
    ax.vlines(beats, 0, 1, color="#adb5bd", lw=0.8, label=f"beats ({a.tempo:.0f} BPM)")
    ax.vlines(cuts, 0, 1, color="#e03131", lw=1.5, label="cuts")
    ax.set_yticks([])
    ax.set_xlim(0, min(window_s, f.info.duration))
    ax.set_xlabel("time (s)", fontsize=8)
    ax.legend(fontsize=7, loc="upper right")
    ax.set_title(f"Cut–beat alignment: {ctx['on_beat_ratio']:.0%} of cuts within ±{config.BEAT_TOLERANCE_S * 1000:.0f} ms "
                 f"(chance {ctx['on_beat_chance']:.0%}) → sub-score {ctx['beat_score']:.0f}", fontsize=9)
    fig.tight_layout()
    path = out / "beats_cuts.png"
    fig.savefig(path)
    plt.close(fig)
    return path


def _thirds(ax, w: int, h: int):
    for x in (w / 3, 2 * w / 3):
        ax.axvline(x, color="white", lw=0.6, alpha=0.7)
    for y in (h / 3, 2 * h / 3):
        ax.axhline(y, color="white", lw=0.6, alpha=0.7)


def colour_reference(detail: dict) -> tuple[list[float], str]:
    """What a mismatched shot is compared with: the video's grade (grade test) or the
    mean of its two neighbouring shots (tint test)."""
    if "lab_grade" in detail:
        return detail["lab_grade"], "grade"
    return np.mean(detail["lab_neighbours"], axis=0).tolist(), "neighbours"


def issue_card(issue: dict, f: VisualFeatures, video: Path, out: Path) -> Path | None:
    kind, t, fps = issue["kind"], issue["t"], f.info.fps
    title = f"{issue['id']} · {kind} · {_ts(t)}" + (f" · AI: {issue['verdict']}" if issue.get("verdict") else "")
    detail = ", ".join(f"{k}={v}" for k, v in issue["detail"].items() if not isinstance(v, list))

    if kind in CUT_KINDS:
        c = round(t * fps)
        frames = ([(c - 1, "before"), (c, "flash"), (round(issue["t_end"] * fps), "after")] if kind == "flash_frame"
                  else [(c - 1, "last frame before"), (c, "first frame after")])
        fig, axes = plt.subplots(1, len(frames), figsize=(4 * len(frames), 2.8), dpi=150)
        for ax, (idx, name) in zip(np.atleast_1d(axes), frames):
            ax.imshow(_rgb(grab_frame(video, idx)))
            ax.set_title(f"{name} (frame {idx}, {_ts(idx / fps)})", fontsize=8)
            ax.axis("off")
    elif kind == "color_jump":
        shot = next((s for s in f.shots if abs(s.t0 - t) < 1 / fps), None)
        prev = f.shots[shot.index - 1] if shot and shot.index > 0 else None
        prev_idx = (prev.start + prev.end) // 2 if prev else max(0, round((t - 1) * fps))
        mid_idx = round((t + issue["t_end"]) / 2 * fps)
        fig, axes = plt.subplots(1, 3, figsize=(11, 2.8), dpi=150, gridspec_kw={"width_ratios": [4, 4, 1.4]})
        axes[0].imshow(_rgb(grab_frame(video, prev_idx)))
        axes[0].set_title(f"neighbouring shot (frame {prev_idx})", fontsize=8)
        axes[1].imshow(_rgb(grab_frame(video, mid_idx)))
        axes[1].set_title(f"mismatched shot ({_ts(t)}–{_ts(issue['t_end'])}, frame {mid_idx})", fontsize=8)
        reference, name = colour_reference(issue["detail"])
        swatches = np.array([[reference], [issue["detail"]["lab_shot"]]], dtype=float)
        axes[2].imshow(lab2rgb(swatches), aspect="auto")
        axes[2].set_title(f"{name} / shot", fontsize=8)
        for ax in axes:
            ax.axis("off")
    elif kind in FRAMING_BOX_KINDS:
        key = next((k for k in f.keyframes if abs(f.shots[k.shot].t0 - t) < 1 / fps), None)
        frame = grab_frame(video, key.frame if key else round(t * fps), width=640)
        fig, ax = plt.subplots(figsize=(5.5, 3.4), dpi=150)
        img = _rgb(frame)
        h, w = img.shape[:2]
        ax.imshow(img)
        _thirds(ax, w, h)
        if key and key.subject_box:
            x, y, bw, bh = key.subject_box
            ax.add_patch(plt.Rectangle((x * w, y * h), bw * w, bh * h, fill=False, ec="#ff6b6b", lw=1.6))
            ax.text(x * w, y * h - 4, key.subject_source or "", color="#ff6b6b", fontsize=7)
        ax.axis("off")
    elif kind == "shaky":
        shot = next((s for s in f.shots if abs(s.t0 - t) < 1 / fps), None)
        if shot is None:
            return None
        motion = f.motion[shot.start + 2:shot.end - 2]
        tt = np.arange(motion.shape[0]) / fps + shot.t0
        fig, ax = plt.subplots(figsize=(8, 2.4), dpi=150)
        ax.plot(tt, motion[:, 0], lw=0.7, label="dx")
        ax.plot(tt, motion[:, 1], lw=0.7, label="dy")
        ax.set_xlabel("time (s)", fontsize=8)
        ax.set_ylabel("px / frame", fontsize=8)
        ax.legend(fontsize=7)
    elif kind in {"dead_air", "long_static_shot"}:
        fig, ax = plt.subplots(figsize=(5.5, 3.2), dpi=150)
        ax.imshow(_rgb(grab_frame(video, round((t + issue["t_end"]) / 2 * fps))))
        ax.set_title(f"static, silent {_ts(t)}–{_ts(issue['t_end'])}", fontsize=8)
        ax.axis("off")
    else:
        return None

    fig.suptitle(f"{title}\n{detail}", fontsize=8)
    fig.tight_layout()
    path = out / f"issue_{issue['id']}.png"
    fig.savefig(path)
    plt.close(fig)
    return path


def render(report: dict, f: VisualFeatures, a: AudioFeatures, video: Path, out: Path, top_issues: int = 8) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    paths = [timeline(report, out), scores_chart(report, out), loudness_chart(a, report, out), beats_chart(f, a, report, out)]
    use_verdict = report["ai"] is not None and config.AI_VERDICTS_IN_SCORE
    issues = [i for k in config.SIGNAL_CRITERIA for i in report["criteria"][k]["issues"] if i["kind"] not in GLOBAL_KINDS]
    for issue in sorted(issues, key=lambda i: -_effective(i, use_verdict))[:top_issues]:
        paths.append(issue_card(issue, f, video, out))
    return [p for p in paths if p]
