"""Command line: python -m eqi <command> …"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

from . import config

VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"   # tools/eqi/.env (git-ignored)


def _load_env_file() -> None:
    """Read KEY=VALUE lines (e.g. GEMINI_API_KEY) from tools/eqi/.env; real environment variables win."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _print_report(report: dict) -> None:
    eqi = report["eqi"]
    print(f"EQI (signal only): {eqi['signal_only']}")
    print(f"EQI (full: measured K1–K5 + AI-rated K6): {eqi['full'] if eqi['full'] is not None else 'n/a'}")
    for k in config.WEIGHTS:
        c = report["criteria"][k]
        score = c["score"]
        issues = len(c.get("issues", []))
        print(f"  {config.SHORT_LABELS[k]:<13} {'n/a' if score is None else f'{score:5.1f}'}  ({issues} issues)")
    levels = report["criteria"]["narrative"].get("levels") or []
    if len(levels) > 1:
        print(f"  K6 level {report['criteria']['narrative']['level']} = median of runs {levels}")
    if report.get("video_type"):
        print(f"  video type: {report['video_type']['label']}")
    if report["ai_error"]:
        print(f"note: {report['ai_error']}")


def _add_dover(videos: list[Path], rows: list[dict], out: Path, resume: bool) -> None:
    """DOVER baseline columns for scores.csv. Scores are kept in <out>/<video>/dover.json
    and reused with --resume; a failed video gets empty cells and is retried next time."""
    from .baseline import dover_scores
    scores = {}
    for video in videos:
        cached = out / video.stem / "dover.json"
        if resume and cached.exists():
            scores[video.stem] = json.loads(cached.read_text(encoding="utf-8"))
    missing = {str(v.resolve()): v.stem for v in videos if v.stem not in scores}
    if missing:
        print(f"DOVER baseline: {len(missing)} videos", flush=True)
        for path, row in dover_scores([Path(p) for p in missing]).items():
            stem = missing[path]
            scores[stem] = row
            if "error" in row:
                print(f"  DOVER failed on {stem}: {row['error']}", flush=True)
            else:
                (out / stem).mkdir(parents=True, exist_ok=True)
                (out / stem / "dover.json").write_text(json.dumps(row), encoding="utf-8")
    for row in rows:
        d = scores.get(row["video"], {})
        row.update({f"dover_{k}": d.get(k, "") for k in ("overall", "aesthetic", "technical")})


def _score_row(stem: str, report: dict) -> dict:
    crit = report["criteria"]
    return {
        "video": stem,
        "eqi_signal": report["eqi"]["signal_only"],
        "eqi_full": report["eqi"]["full"],
        **{k: crit[k]["score"] for k in config.WEIGHTS},
        "video_type": (report.get("video_type") or {}).get("label", ""),
        "ai_error": report["ai_error"] or "",
    }


def _write_scores(out: Path, rows: list[dict]) -> None:
    fields = list(dict.fromkeys(k for row in rows for k in row)) or ["video"]
    with open(out / "scores.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, restval="")
        writer.writeheader()
        writer.writerows(rows)
    print(f"scores: {out / 'scores.csv'}")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    _load_env_file()
    parser = argparse.ArgumentParser(prog="eqi", description="EQI — automatic assessment of post-production editing quality")
    sub = parser.add_subparsers(dest="cmd", required=True)

    def ai_options(p):
        p.add_argument("--model", help=f"Gemini model (default {config.GEMINI_MODEL_DEFAULT})")
        p.add_argument("--k6-repeats", type=int, help=f"independent AI runs averaged for K6 (default {config.AI_K6_REPEATS})")
        p.add_argument("--strict-model", action="store_true",
                       help="never fall back to another model (experiments: every video judged by the same model)")

    p = sub.add_parser("analyze", help="analyze one video file")
    p.add_argument("video", type=Path)
    p.add_argument("--out", type=Path, help="folder for report.json and figures (default: out/<video name>)")
    p.add_argument("--no-ai", action="store_true", help="signal layer only (no Gemini call)")
    p.add_argument("--no-figures", action="store_true")
    ai_options(p)

    p = sub.add_parser("batch", help="analyze every video in a folder; writes scores.csv for Tier 2")
    p.add_argument("folder", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--no-ai", action="store_true")
    p.add_argument("--no-figures", action="store_true")
    p.add_argument("--resume", action="store_true", help="reuse finished reports (with an AI review, unless --no-ai); rerun the rest")
    p.add_argument("--dover", action="store_true",
                   help="also score every video with the DOVER baseline (Tier 2 comparison; needs the DOVER environment)")
    ai_options(p)

    p = sub.add_parser("rescore-reports", help="score saved reports again with the current scoring rules (no new analysis)")
    p.add_argument("folder", type=Path, help="folder of <video>/report.json, e.g. a batch --out folder")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--ai-from", type=Path,
                   help="batch folder with reports of the same videos whose AI review (K6) is used instead")

    p = sub.add_parser("synth", help="make the synthetic clean test video")
    p.add_argument("--out", type=Path, default=Path("out/synthetic_clean.mp4"))

    p = sub.add_parser("tier1", help="inject controlled defects into a source video and measure detection")
    p.add_argument("source", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--kinds", nargs="*", help="subset of defect kinds")
    p.add_argument("--figures", action="store_true", help="also render figures for every variant")

    p = sub.add_parser("rescore", help="score an existing tier1 folder again with the current analysis (no new injection)")
    p.add_argument("tier1_dir", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--kinds", nargs="*", help="subset of defect kinds")
    p.add_argument("--figures", action="store_true")
    p.add_argument("--reuse-reports", action="store_true", help="reuse the reports in --out: score them with the current rules, recompute matching and totals")

    p = sub.add_parser("ai-check", help="accuracy of the AI review on tier1 folders (real defects vs style); calls Gemini")
    p.add_argument("tier1_dirs", type=Path, nargs="+")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--model", help=f"Gemini model, used for every video (default {config.GEMINI_MODEL_DEFAULT})")
    p.add_argument("--k6-repeats", type=int)
    p.add_argument("--extra", type=Path, help="folder of further videos whose K6 level is listed")

    p = sub.add_parser("serve", help="analysis page in the browser: choose videos, analyse them, open their reports")
    p.add_argument("--out", type=Path, default=Path("out/app"), help="folder for the analyses (default out/app)")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--no-browser", action="store_true", help="do not open the page in the browser")
    ai_options(p)

    p = sub.add_parser("tier2", help="correlate tool scores with expert ratings")
    p.add_argument("scores", type=Path, help="scores.csv written by `batch`")
    p.add_argument("ratings", type=Path, help="long-format ratings: video, rater, overall[, per-criterion columns]")
    p.add_argument("--out", type=Path, required=True)

    args = parser.parse_args(argv)
    if getattr(args, "strict_model", False):
        os.environ["GEMINI_FALLBACK_MODEL"] = args.model or os.environ.get("GEMINI_VIDEO_MODEL") or config.GEMINI_MODEL_DEFAULT

    if args.cmd == "analyze":
        from .pipeline import analyze
        out = args.out or Path("out") / args.video.stem
        report = analyze(args.video, out, use_ai=not args.no_ai, make_figures=not args.no_figures, model=args.model,
                         ai_repeats=args.k6_repeats)
        _print_report(report)
        print(f"report: {out / 'report.json'} · {out / 'report.html'}")

    elif args.cmd == "batch":
        from .pipeline import analyze
        videos = sorted(p for p in args.folder.iterdir() if p.suffix.lower() in VIDEO_SUFFIXES)
        args.out.mkdir(parents=True, exist_ok=True)
        rows, failed = [], []
        for i, video in enumerate(videos, 1):
            print(f"[{i}/{len(videos)}] {video.name}", flush=True)
            done = args.out / video.stem / "report.json"
            report = json.loads(done.read_text(encoding="utf-8")) if args.resume and done.exists() else None
            if report is None or (not args.no_ai and not report.get("ai")):
                try:
                    report = analyze(video, args.out / video.stem, use_ai=not args.no_ai, make_figures=not args.no_figures,
                                     model=args.model, ai_repeats=args.k6_repeats)
                except Exception as err:  # one unreadable file must not stop the batch
                    print(f"  failed: {type(err).__name__}: {err}", file=sys.stderr, flush=True)
                    failed.append(video.name)
                    rows.append({"video": video.stem, "error": f"{type(err).__name__}: {err}"})
                    continue
            rows.append(_score_row(video.stem, report))
        if failed:
            print(f"{len(failed)} of {len(videos)} videos could not be analyzed: {', '.join(failed)}", file=sys.stderr)
        if args.dover:
            _add_dover(videos, rows, args.out, args.resume)
        _write_scores(args.out, rows)

    elif args.cmd == "rescore-reports":
        from .report import rescore as rescore_report
        rows = []
        for done in sorted(args.folder.glob("*/report.json")):
            stem = done.parent.name
            ai_report = args.ai_from / stem / "report.json" if args.ai_from else None
            ai_from = json.loads(ai_report.read_text(encoding="utf-8")) if ai_report and ai_report.exists() else None
            if args.ai_from and ai_from is None:
                print(f"{stem}: no report in {args.ai_from}, AI review left as it was", flush=True)
            report = rescore_report(json.loads(done.read_text(encoding="utf-8")), ai_from)
            (args.out / stem).mkdir(parents=True, exist_ok=True)
            (args.out / stem / "report.json").write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
            rows.append(_score_row(stem, report))
        _write_scores(args.out, rows)

    elif args.cmd == "synth":
        from .inject import make_synthetic_source
        args.out.parent.mkdir(parents=True, exist_ok=True)
        print(make_synthetic_source(args.out))

    elif args.cmd in ("tier1", "rescore"):
        from .evaluate import rescore, tier1
        if args.cmd == "tier1":
            result = tier1(args.source, args.out, args.kinds, figures=args.figures)
        else:
            result = rescore(args.tier1_dir, args.out, args.kinds, figures=args.figures, reuse_reports=args.reuse_reports)
        print((args.out / "tier1_table.md").read_text(encoding="utf-8"))
        print(f"overall recall {result['overall_recall']} · results: {args.out / 'tier1_results.json'}")

    elif args.cmd == "ai-check":
        from .evaluate import ai_check
        ai_check(args.tier1_dirs, args.out, model=args.model, extra=args.extra, repeats=args.k6_repeats)
        print((args.out / "ai_check.md").read_text(encoding="utf-8"))

    elif args.cmd == "serve":
        from .webapp import serve
        serve(args.out, args.port, model=args.model, repeats=args.k6_repeats, open_browser=not args.no_browser)

    elif args.cmd == "tier2":
        from .evaluate import tier2
        print(json.dumps(tier2(args.scores, args.ratings, args.out), indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
