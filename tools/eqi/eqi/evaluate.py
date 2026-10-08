"""Proof statistics.

Tier 1 — controlled defects: detection recall per defect kind and severity,
         false alarms, and whether the EQI drops as severity rises.
Tier 2 — real videos vs expert ratings: SRCC, KRCC, PLCC (after a 4-parameter
         logistic mapping, as is standard in video quality research), RMSE,
         bootstrap confidence intervals, rater reliability ICC(2,1)/ICC(2,k)
         (Shrout & Fleiss, 1979) and the split-half human ceiling.
"""

import csv
import json
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy import stats  # noqa: E402
from scipy.optimize import curve_fit  # noqa: E402

from . import config  # noqa: E402
from .inject import CRITERION, LEVELS, inject, reencode  # noqa: E402
from .pipeline import analyze  # noqa: E402
from .report import rescore as rescore_report  # noqa: E402

# Which reported issue kinds count as detecting an injected defect
MATCH_KINDS = {
    "jump_cut": {"jump_cut"},
    "flash_frame": {"flash_frame"},
    "color_jump": {"color_jump"},
    "loudness_jump": {"loudness_jump"},
    "dead_air": {"dead_air"},
    "bad_framing": {"subject_cut_off", "placement", "headroom"},
    "shake": {"shaky"},
}


def _issues(report: dict, criterion: str, kinds: set[str]) -> list[dict]:
    return [i for i in report["criteria"][criterion]["issues"] if i["kind"] in kinds]


def _overlaps(issue: dict, t0: float, t1: float, tol: float) -> bool:
    return issue["t"] <= t1 + tol and issue["t_end"] >= t0 - tol


def _on_variant_timeline(issues: list[dict], truth: dict) -> list[dict]:
    """Clean-reference issues on the defect variant's timeline (a removed stretch moves
    everything after it earlier)."""
    shift = truth.get("time_shift")
    if not shift:
        return issues
    return [{**b, "t": b["t"] + shift["by"], "t_end": b["t_end"] + shift["by"]} if b["t"] > shift["after"] else b
            for b in issues]


def _aligned_baseline(clean: dict | None, truth: dict, kinds: set[str]) -> list[dict]:
    return _on_variant_timeline(_issues(clean, truth["criterion"], kinds) if clean else [], truth)


def same_issue(a: dict, b: dict) -> bool:
    """The same finding in two analyses: same kind and place. Shot-long issues must
    share most of their span (neighbouring shots only touch at the cut); point
    events (cuts) may move by a few frames."""
    if a["kind"] != b["kind"]:
        return False
    shared = min(a["t_end"], b["t_end"]) - max(a["t"], b["t"])
    shortest = min(a["t_end"] - a["t"], b["t_end"] - b["t"])
    if shortest > 0.5:
        return shared >= 0.5 * shortest
    return abs(a["t"] - b["t"]) <= 0.25 or shared > 0


def new_issues(report: dict, clean: dict | None, truth: dict) -> list[dict]:
    """Issues of the defect's kinds that the clean reference does not have."""
    kinds = MATCH_KINDS[truth["kind"]]
    baseline = _aligned_baseline(clean, truth, kinds)
    return [i for i in _issues(report, truth["criterion"], kinds) if not any(same_issue(i, b) for b in baseline)]


def side_effects(truth: dict, report: dict, clean: dict | None, tol: float = 0.5) -> dict:
    """What the defect changed away from where it was put, in both directions:
    new issues of other kinds (any criterion) that the clean reference does not have
    (a finding flipped on elsewhere: a false alarm that the same-kind count in match()
    does not see; at the defect they mean it also shows in another criterion, e.g. a
    crop changes the shot's colour), and issues of the clean reference, of any kind,
    that vanished away from the defect (a finding flipped off elsewhere, so the defect
    makes the rest of the video look better)."""
    own = MATCH_KINDS[truth["kind"]]

    def near(i):
        return any(_overlaps(i, e["t"], e["t_end"], tol) for e in truth["events"])

    at, away, lost = [], [], []
    for crit, c in report["criteria"].items():
        baseline = _on_variant_timeline(clean["criteria"][crit].get("issues", []) if clean else [], truth)
        issues = c.get("issues", [])
        for i in issues:
            if (crit == truth["criterion"] and i["kind"] in own) or any(same_issue(i, b) for b in baseline):
                continue
            (at if near(i) else away).append(i)
        lost += [b for b in baseline if not near(b) and not any(same_issue(i, b) for i in issues)]

    def brief(items):
        return [{"kind": i["kind"], "t": i["t"], "t_end": i["t_end"], "severity": i["severity"]} for i in items]

    return {
        "other_new_at": len(at),
        "other_new_away": len(away),
        "other_new_away_severity": round(sum(i["severity"] for i in away), 3),
        "other_new_away_issues": brief(away),
        "clean_lost_away": len(lost),
        "clean_lost_away_severity": round(sum(i["severity"] for i in lost), 3),
        "clean_lost_away_issues": brief(lost),
    }


def match(truth: dict, report: dict, clean: dict | None, tol: float = 0.5) -> dict:
    """An event counts as detected only by an issue the clean reference does not have
    at that time, so a pre-existing issue next to the defect cannot pass for it.
    false_alarms counts new issues of the defect's own kinds away from it; issues of
    other kinds are counted by side_effects()."""
    new = new_issues(report, clean, truth)
    detected = sum(any(_overlaps(i, e["t"], e["t_end"], tol) for i in new) for e in truth["events"])
    false_alarms = [i for i in new if not any(_overlaps(i, e["t"], e["t_end"], tol) for e in truth["events"])]
    return {"events": len(truth["events"]), "detected": detected, "false_alarms": len(false_alarms),
            **side_effects(truth, report, clean, tol)}


def tier1(source: Path, out_dir: Path, kinds: list[str] | None = None, figures: bool = False) -> dict:
    videos = out_dir / "videos"
    videos.mkdir(parents=True, exist_ok=True)
    reference = reencode(source, videos / f"{source.stem}__clean.mp4")
    clean = analyze(reference, out_dir / "clean", use_ai=False, make_figures=figures)
    for kind in kinds or list(LEVELS):
        # Keep defects away from spots where the clean video already has the same kind of issue
        avoid = [(i["t"], i["t_end"]) for i in _issues(clean, CRITERION[kind], MATCH_KINDS[kind])]
        for level in LEVELS[kind]:
            inject(source, kind, level, videos / f"{source.stem}__{kind}_L{level}.mp4", avoid=avoid)
    return score_tier1(source, videos, out_dir, kinds, figures, clean=clean)


def _tier1_videos(tier1_dir: Path) -> Path:
    """The videos of a Tier-1 folder: its own videos/, or for a rescored folder the
    videos it was scored from."""
    if (tier1_dir / "videos").is_dir():
        return tier1_dir / "videos"
    results = tier1_dir / "tier1_results.json"
    recorded = json.loads(results.read_text(encoding="utf-8")).get("videos") if results.exists() else None
    if recorded and Path(recorded).is_dir():
        return Path(recorded)
    raise FileNotFoundError(f"{tier1_dir} has no videos/ folder: use a folder written by `tier1`")


def _tier1_source(tier1_dir: Path) -> Path:
    results = tier1_dir / "tier1_results.json"
    if results.exists():
        return Path(json.loads(results.read_text(encoding="utf-8"))["source"])
    clean = next(_tier1_videos(tier1_dir).glob("*__clean.mp4"), None)
    if clean is None:
        raise FileNotFoundError(f"{tier1_dir} has no videos/*__clean.mp4")
    return clean.with_name(clean.name.replace("__clean", ""))  # only the stem is needed


def rescore(tier1_dir: Path, out_dir: Path, kinds: list[str] | None = None, figures: bool = False,
            reuse_reports: bool = False) -> dict:
    """Score an existing Tier-1 folder again with the current analysis: same videos and
    ground truth, no new injection. reuse_reports: take the reports already in out_dir,
    score them with the current scoring rules and recompute the matching and the totals
    (when only the scoring or the metrics changed)."""
    return score_tier1(_tier1_source(tier1_dir), _tier1_videos(tier1_dir), out_dir, kinds, figures, reuse=reuse_reports)


def score_tier1(source: Path, videos: Path, out_dir: Path, kinds: list[str] | None = None,
                figures: bool = False, clean: dict | None = None, reuse: bool = False) -> dict:
    def report_of(video: Path, dest: Path) -> dict:
        if reuse and (dest / "report.json").exists():
            return rescore_report(json.loads((dest / "report.json").read_text(encoding="utf-8")))
        return analyze(video, dest, use_ai=False, make_figures=figures)

    if clean is None:
        clean = report_of(videos / f"{source.stem}__clean.mp4", out_dir / "clean")
    rows = []
    for kind in kinds or list(LEVELS):
        for level in LEVELS[kind]:
            stem = f"{source.stem}__{kind}_L{level}"
            if not (videos / f"{stem}.mp4").exists():
                continue
            truth = json.loads((videos / f"{stem}.truth.json").read_text(encoding="utf-8"))
            report = report_of(videos / f"{stem}.mp4", out_dir / "reports" / stem)
            m = match(truth, report, clean)
            crit = truth["criterion"]
            rows.append({
                "kind": kind, "level": level, "strength": truth["strength"], "criterion": crit, **m,
                "recall": m["detected"] / m["events"],
                "criterion_score_clean": clean["criteria"][crit]["score_signal"],
                "criterion_score_defect": report["criteria"][crit]["score_signal"],
                "criterion_drop": round(clean["criteria"][crit]["score_signal"] - report["criteria"][crit]["score_signal"], 2),
                "eqi_clean": clean["eqi"]["signal_only"],
                "eqi_defect": report["eqi"]["signal_only"],
                "eqi_drop": round(clean["eqi"]["signal_only"] - report["eqi"]["signal_only"], 2),
            })
    result = {**summarize_tier1(source, clean, rows), "videos": str(videos.resolve())}
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tier1_results.json").write_text(json.dumps(result, indent=2, default=float), encoding="utf-8")
    (out_dir / "tier1_table.md").write_text(tier1_markdown(result), encoding="utf-8")
    _tier1_chart(result, out_dir / "tier1_criterion_response.png")
    return result


def summarize_tier1(source: Path, clean: dict, rows: list[dict]) -> dict:
    summary = {}
    for kind in {r["kind"] for r in rows}:
        rs = sorted((r for r in rows if r["kind"] == kind), key=lambda r: r["level"])
        drops = [r["criterion_drop"] for r in rs]
        summary[kind] = {
            "recall_by_level": {r["level"]: r["recall"] for r in rs},
            "criterion_drop_by_level": {r["level"]: r["criterion_drop"] for r in rs},
            "eqi_drop_by_level": {r["level"]: r["eqi_drop"] for r in rs},
            # The targeted criterion must not improve as the defect gets stronger
            "monotonic": all(b >= a for a, b in zip(drops, drops[1:])),
            "false_alarms": sum(r["false_alarms"] for r in rs),
            "other_new_away": sum(r["other_new_away"] for r in rs),
            "clean_lost_away": sum(r["clean_lost_away"] for r in rs),
        }
    strongest = [r for r in rows if r["level"] == max(LEVELS[r["kind"]])]
    events = sum(r["events"] for r in rows)
    return {
        "source": str(source),
        "clean_eqi": clean["eqi"]["signal_only"],
        "clean_issue_count": sum(len(c.get("issues", [])) for c in clean["criteria"].values()),
        "overall_recall": round(sum(r["detected"] for r in rows) / events, 3) if events else None,
        "totals": {
            "detected": sum(r["detected"] for r in rows), "events": events,
            "detected_strongest": sum(r["detected"] for r in strongest), "events_strongest": sum(r["events"] for r in strongest),
            "false_alarms": sum(r["false_alarms"] for r in rows),
            "other_new_away": sum(r["other_new_away"] for r in rows),
            "other_new_away_severity": round(sum(r["other_new_away_severity"] for r in rows), 3),
            "variants_with_other_new_away": sum(r["other_new_away"] > 0 for r in rows),
            "clean_lost_away": sum(r["clean_lost_away"] for r in rows),
            "clean_lost_away_severity": round(sum(r["clean_lost_away_severity"] for r in rows), 3),
            "variants_with_clean_lost_away": sum(r["clean_lost_away"] > 0 for r in rows),
            "variants": len(rows),
            "monotonic_kinds": sum(s["monotonic"] for s in summary.values()), "kinds": len(summary),
        },
        "rows": rows,
        "summary": summary,
    }


def tier1_markdown(result: dict) -> str:
    t = result["totals"]
    lines = [
        f"Source: `{result['source']}` · clean EQI {result['clean_eqi']} · issues on clean video: {result['clean_issue_count']} · overall recall {result['overall_recall']}",
        "",
        "| Defect | Level | Strength | Criterion | Detected / events | Same-kind false alarms | Other new issues away (severity) | Clean issues lost away (severity) | Criterion score (clean → defect) | EQI drop |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in sorted(result["rows"], key=lambda r: (r["kind"], r["level"])):
        lines.append(f"| {r['kind']} | {r['level']} | {r['strength']} | {r['criterion']} | {r['detected']}/{r['events']} | "
                     f"{r['false_alarms']} | {r['other_new_away']} ({r['other_new_away_severity']}) | "
                     f"{r['clean_lost_away']} ({r['clean_lost_away_severity']}) | "
                     f"{r['criterion_score_clean']} → {r['criterion_score_defect']} | {r['eqi_drop']} |")
    lines += ["",
              f"Detected at the strongest level {t['detected_strongest']}/{t['events_strongest']}, at all levels {t['detected']}/{t['events']} · "
              f"same-kind false alarms {t['false_alarms']} · other new issues away from the defect {t['other_new_away']} "
              f"(severity {t['other_new_away_severity']}) in {t['variants_with_other_new_away']}/{t['variants']} variants · "
              f"clean issues lost away from the defect {t['clean_lost_away']} (severity {t['clean_lost_away_severity']}) "
              f"in {t['variants_with_clean_lost_away']}/{t['variants']} variants",
              "",
              f"Monotonic (targeted criterion never improves as severity rises), {t['monotonic_kinds']}/{t['kinds']}: "
              + ", ".join(f"{k}: {'yes' if s['monotonic'] else 'NO'}" for k, s in sorted(result["summary"].items()))]
    return "\n".join(lines) + "\n"


def _tier1_chart(result: dict, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6.5, 3.4), dpi=150)
    for kind, s in sorted(result["summary"].items()):
        # Level keys become strings after a JSON round trip; plot them as numbers
        drops = {int(lv): v for lv, v in s["criterion_drop_by_level"].items()}
        levels = sorted(drops)
        ax.plot(levels, [drops[lv] for lv in levels], marker="o", lw=1, label=kind)
    ax.set_xlabel("defect severity level", fontsize=8)
    ax.set_ylabel("score drop of the targeted criterion", fontsize=8)
    ax.set_xticks([1, 2, 3])
    ax.legend(fontsize=7, ncol=2)
    ax.set_title("Tier 1: criterion response to injected defects", fontsize=9)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


# ── AI review check ──────────────────────────────────────────────────────────

def _opinion(issue: dict) -> dict:
    r = issue.get("ai_review") or {}
    return {"t": issue["t"], "model_verdict": r.get("verdict"), "confidence": r.get("confidence"), "observation": r.get("observation")}


def ai_check(tier1_dirs: list[Path], out_dir: Path, model: str | None = None, extra: Path | None = None,
             repeats: int | None = None) -> dict:
    """How well the AI review tells real defects from style, on real footage with known
    defects. The clean reference and the strongest level of every defect kind of each
    Tier-1 folder are analyzed with the AI layer. A correct review keeps an injected
    defect as an "error" (sensitivity) and excuses the issues flagged on the clean,
    professionally edited original (specificity; this assumes those are style or false
    detections). One fixed model, no fallback, so every video is judged by the same
    model. Resumable: reports that already hold an AI review are reused. `extra`:
    further videos whose K6 level is listed, e.g. the same pictures with another
    video's narration."""
    model = model or os.environ.get("GEMINI_VIDEO_MODEL") or config.GEMINI_MODEL_DEFAULT
    os.environ["GEMINI_FALLBACK_MODEL"] = model

    def run(video: Path, dest: Path) -> dict:
        path = dest / "report.json"
        if path.exists():
            report = json.loads(path.read_text(encoding="utf-8"))
            if report.get("ai"):
                return report
        return analyze(video, dest, use_ai=True, make_figures=False, model=model, ai_repeats=repeats)

    def k6(name: str, report: dict) -> dict:
        n = report["criteria"]["narrative"]
        return {"video": name, "level": n.get("level"), "levels": n.get("levels")}

    kept, excused, k6_rows, failed = [], [], [], []
    for t1 in tier1_dirs:
        source, videos = _tier1_source(t1), _tier1_videos(t1)
        clean = run(videos / f"{source.stem}__clean.mp4", out_dir / t1.name / "clean")
        if not clean.get("ai"):
            failed.append(f"{t1.name}/clean: {clean.get('ai_error')}")
            continue
        k6_rows.append(k6(f"{t1.name}/clean", clean))
        excused += [{"source": t1.name, "kind": i["kind"], "verdict": i["verdict"], "excused": i["verdict"] != "error", **_opinion(i)}
                    for c in clean["criteria"].values() for i in c.get("issues", []) if i.get("verdict")]
        for kind, levels in LEVELS.items():
            stem = f"{source.stem}__{kind}_L{max(levels)}"
            if not (videos / f"{stem}.mp4").exists():
                continue
            truth = json.loads((videos / f"{stem}.truth.json").read_text(encoding="utf-8"))
            report = run(videos / f"{stem}.mp4", out_dir / t1.name / stem)
            if not report.get("ai"):
                failed.append(f"{t1.name}/{stem}: {report.get('ai_error')}")
                continue
            hits = [i for i in new_issues(report, clean, truth) if any(_overlaps(i, e["t"], e["t_end"], 0.5) for e in truth["events"])]
            kept += [{"source": t1.name, "kind": kind, "verdict": i["verdict"], "kept": i["verdict"] == "error", **_opinion(i)}
                     for i in hits if i.get("verdict")]
    for video in sorted(extra.glob("*.mp4")) if extra else []:
        report = run(video, out_dir / "extra" / video.stem)
        if report.get("ai"):
            k6_rows.append(k6(f"extra/{video.stem}", report))
        else:
            failed.append(f"extra/{video.stem}: {report.get('ai_error')}")

    sensitivity = sum(r["kept"] for r in kept) / len(kept) if kept else None
    specificity = sum(r["excused"] for r in excused) / len(excused) if excused else None
    result = {
        "model": model,
        "k6_repeats": repeats or config.AI_K6_REPEATS,
        "true_defects_kept_as_error": [sum(r["kept"] for r in kept), len(kept)],
        "clean_issues_excused": [sum(r["excused"] for r in excused), len(excused)],
        "balanced_accuracy": round((sensitivity + specificity) / 2, 3) if kept and excused else None,
        "k6": k6_rows,
        "failed": failed,
        "true_defects": kept,
        "clean_issues": excused,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "ai_check.json").write_text(json.dumps(result, indent=2, ensure_ascii=False, default=float), encoding="utf-8")
    (out_dir / "ai_check.md").write_text(ai_check_markdown(result), encoding="utf-8")
    return result


def ai_check_markdown(result: dict) -> str:
    def rate(pair):
        return f"{pair[0]}/{pair[1]} ({pair[0] / pair[1]:.0%})" if pair[1] else "—"

    balanced = "—" if result["balanced_accuracy"] is None else f"{result['balanced_accuracy']:.0%}"
    lines = [f"Model `{result['model']}` · K6 repeats {result['k6_repeats']}", "",
             "| Injected defects kept as error | Clean-video issues excused | Balanced accuracy |", "|---|---|---|",
             f"| {rate(result['true_defects_kept_as_error'])} | {rate(result['clean_issues_excused'])} | {balanced} |", "",
             "| Source | Defect | Verdict used | Model verdict / confidence | Observation |", "|---|---|---|---|---|"]
    lines += [f"| {r['source']} | {r['kind']} | {r['verdict']} | {r['model_verdict']} / {r['confidence']} | {(r['observation'] or '').replace('|', '/')} |"
              for r in sorted(result["true_defects"], key=lambda r: (r["kind"], r["source"]))]
    lines += ["", "| Video | K6 level | Runs |", "|---|---|---|"]
    lines += [f"| {r['video']} | {r['level']} | {r['levels']} |" for r in result["k6"]]
    if result["failed"]:
        lines += ["", "Failed: " + "; ".join(result["failed"])]
    return "\n".join(lines) + "\n"


# ── Tier 2 ───────────────────────────────────────────────────────────────────

def logistic4(x, b1, b2, b3, b4):
    return (b1 - b2) / (1 + np.exp(-(x - b3) / abs(b4))) + b2


def _fit_logistic(pred: np.ndarray, mos: np.ndarray) -> np.ndarray:
    p0 = [mos.max(), mos.min(), float(np.median(pred)), float(np.std(pred)) or 1.0]
    try:
        params, _ = curve_fit(logistic4, pred, mos, p0=p0, maxfev=20000)
        return logistic4(pred, *params)
    except RuntimeError:
        slope, intercept = np.polyfit(pred, mos, 1)
        return slope * pred + intercept


def correlation_stats(pred, mos, n_boot: int = 1000, seed: int = 0) -> dict:
    pred, mos = np.asarray(pred, float), np.asarray(mos, float)

    def point(p, m):
        fitted = _fit_logistic(p, m)
        return {
            "srcc": stats.spearmanr(p, m).statistic,
            "krcc": stats.kendalltau(p, m).statistic,
            "plcc": stats.pearsonr(fitted, m).statistic,
            "rmse": float(np.sqrt(np.mean((fitted - m) ** 2))),
        }

    estimate = point(pred, mos)
    rng = np.random.default_rng(seed)
    boots = {k: [] for k in estimate}
    for _ in range(n_boot):
        idx = rng.integers(0, pred.size, pred.size)
        if np.ptp(pred[idx]) == 0 or np.ptp(mos[idx]) == 0:
            continue
        for k, v in point(pred[idx], mos[idx]).items():
            boots[k].append(v)
    return {k: {"value": round(float(v), 4),
                "ci95": [round(float(np.percentile(boots[k], 2.5)), 4), round(float(np.percentile(boots[k], 97.5)), 4)] if boots[k] else None}
            for k, v in estimate.items()} | {"n": int(pred.size)}


def paired_srcc_difference(a, b, mos, n_boot: int = 1000, seed: int = 0) -> dict:
    """SRCC(a, MOS) − SRCC(b, MOS) on the same videos with a paired bootstrap 95 % CI:
    the videos are resampled together, so the two correlations stay as dependent as
    they are. A CI above 0 means predictor a follows the ratings better than b."""
    a, b, mos = (np.asarray(x, float) for x in (a, b, mos))
    delta = stats.spearmanr(a, mos).statistic - stats.spearmanr(b, mos).statistic
    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(n_boot):
        idx = rng.integers(0, a.size, a.size)
        if np.ptp(mos[idx]) == 0 or np.ptp(a[idx]) == 0 or np.ptp(b[idx]) == 0:
            continue
        boots.append(stats.spearmanr(a[idx], mos[idx]).statistic - stats.spearmanr(b[idx], mos[idx]).statistic)
    return {"delta_srcc": round(float(delta), 4),
            "ci95": [round(float(np.percentile(boots, 2.5)), 4), round(float(np.percentile(boots, 97.5)), 4)] if boots else None,
            "n": int(a.size)}


def icc2(ratings: np.ndarray) -> dict:
    """Two-way random effects, absolute agreement (Shrout & Fleiss 1979): ICC(2,1) and ICC(2,k)."""
    n, k = ratings.shape
    grand = ratings.mean()
    ms_rows = k * np.sum((ratings.mean(axis=1) - grand) ** 2) / (n - 1)
    ms_cols = n * np.sum((ratings.mean(axis=0) - grand) ** 2) / (k - 1)
    resid = ratings - ratings.mean(axis=1, keepdims=True) - ratings.mean(axis=0, keepdims=True) + grand
    ms_err = np.sum(resid ** 2) / ((n - 1) * (k - 1))
    icc_1 = (ms_rows - ms_err) / (ms_rows + (k - 1) * ms_err + k * (ms_cols - ms_err) / n)
    icc_k = (ms_rows - ms_err) / (ms_rows + (ms_cols - ms_err) / n)
    return {"icc2_1": round(float(icc_1), 4), "icc2_k": round(float(icc_k), 4), "items": n, "raters": k}


def split_half(ratings: np.ndarray, repeats: int = 200, seed: int = 0) -> float:
    """Human ceiling: Spearman between the MOS of two random rater halves, Spearman–Brown corrected."""
    rng = np.random.default_rng(seed)
    k = ratings.shape[1]
    values = []
    for _ in range(repeats):
        order = rng.permutation(k)
        a, b = ratings[:, order[:k // 2]].mean(axis=1), ratings[:, order[k // 2:]].mean(axis=1)
        r = stats.spearmanr(a, b).statistic
        values.append(2 * r / (1 + r))
    return round(float(np.nanmean(values)), 4)


def _read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


PREDICTORS = ["eqi_full", "eqi_signal", "dover_overall", "dover_aesthetic", "dover_technical"]


def tier2(scores_csv: Path, ratings_csv: Path, out_dir: Path) -> dict:
    """scores_csv: video, eqi_signal, eqi_full, cuts, pacing, color, audio, framing, narrative
    [, dover_overall, dover_aesthetic, dover_technical] (batch --dover)
    ratings_csv (long format): video, rater, overall[, cuts, pacing, color, audio, framing, narrative]"""
    out_dir.mkdir(parents=True, exist_ok=True)
    scores = {r["video"]: r for r in _read_csv(scores_csv)}
    ratings = _read_csv(ratings_csv)
    videos = sorted({r["video"] for r in ratings} & set(scores))
    raters = sorted({r["rater"] for r in ratings})
    columns = [c for c in ["overall", "cuts", "pacing", "color", "audio", "framing", "narrative"] if c in ratings[0]]

    def mos(col: str) -> dict[str, float]:
        out = {}
        for v in videos:
            vals = [float(r[col]) for r in ratings if r["video"] == v and r.get(col) not in (None, "")]
            if vals:
                out[v] = float(np.mean(vals))
        return out

    result = {"videos": len(videos), "raters": len(raters), "correlations": {}, "per_criterion": {}, "vs_dover": {}}
    overall = mos("overall")

    def has(v, col):
        return scores[v].get(col) not in (None, "") and v in overall

    for predictor in PREDICTORS:
        pairs = [(float(scores[v][predictor]), overall[v]) for v in videos if has(v, predictor)]
        if len(pairs) >= 5:
            p, m = map(np.array, zip(*pairs))
            if np.ptp(p) > 0 and np.ptp(m) > 0:  # a constant column has no rank correlation
                result["correlations"][predictor] = correlation_stats(p, m)
    # Baseline comparison on the videos both were scored on
    for predictor in ("eqi_full", "eqi_signal"):
        triples = [(float(scores[v][predictor]), float(scores[v]["dover_overall"]), overall[v])
                   for v in videos if has(v, predictor) and has(v, "dover_overall")]
        if len(triples) >= 5:
            a, b, m = map(np.array, zip(*triples))
            result["vs_dover"][predictor] = paired_srcc_difference(a, b, m)
    for col in columns[1:]:
        m = mos(col)
        pairs = [(float(scores[v][col]), m[v]) for v in videos if scores[v].get(col) not in (None, "") and v in m]
        if len(pairs) >= 5:
            p, mm = map(np.array, zip(*pairs))
            result["per_criterion"][col] = {"srcc": round(float(stats.spearmanr(p, mm).statistic), 4), "n": len(pairs)}

    matrix = np.array([[next((float(r["overall"]) for r in ratings if r["video"] == v and r["rater"] == j), np.nan)
                        for j in raters] for v in videos])
    complete = matrix[~np.isnan(matrix).any(axis=1)]
    if complete.shape[0] >= 3 and complete.shape[1] >= 2:
        result["rater_reliability"] = icc2(complete)
        if complete.shape[1] >= 4:
            result["human_ceiling_srcc"] = split_half(complete)

    best = "eqi_full" if "eqi_full" in result["correlations"] else "eqi_signal"
    pairs = [(float(scores[v][best]), overall[v]) for v in videos if scores[v].get(best) not in (None, "") and v in overall]
    if len(pairs) >= 5:
        p, m = map(np.array, zip(*pairs))
        order = np.argsort(p)
        fig, ax = plt.subplots(figsize=(4.5, 4), dpi=150)
        ax.scatter(p, m, s=14, color="#4c6ef5")
        ax.plot(p[order], _fit_logistic(p, m)[order], color="#e03131", lw=1)
        c = result["correlations"][best]
        ax.set_xlabel(best.replace("_", " ").upper(), fontsize=8)
        ax.set_ylabel("MOS (expert ratings)", fontsize=8)
        ax.set_title(f"SRCC {c['srcc']['value']:.2f} [{c['srcc']['ci95'][0]:.2f}, {c['srcc']['ci95'][1]:.2f}]  ·  PLCC {c['plcc']['value']:.2f}", fontsize=8)
        fig.tight_layout()
        fig.savefig(out_dir / "tier2_scatter.png")
        plt.close(fig)

    (out_dir / "tier2_results.json").write_text(json.dumps(result, indent=2, default=float), encoding="utf-8")
    return result
