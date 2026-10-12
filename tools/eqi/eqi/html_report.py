"""report.html next to report.json: scores, the AI review, the figures and every
issue with its measurement, verdict and evidence frames. Self-contained (no
external resources); figures are linked from the figures/ folder."""

from html import escape
from pathlib import Path

from . import config
from .ai import _ts

CSS = """
body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; background: #f6f7f9; color: #1d2330; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 32px 0 10px; }
.meta, .muted { color: #6b7280; } .small { font-size: 12px; }
.cards { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.card { background: #fff; border: 1px solid #e3e6eb; border-radius: 8px; padding: 12px 16px; min-width: 150px; }
.card b { display: block; font-size: 28px; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e3e6eb; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #edf0f3; vertical-align: top; }
th { background: #f0f2f5; font-size: 13px; }
.good { color: #1a7f37; font-weight: 600; } .warn { color: #9a6700; font-weight: 600; } .bad { color: #cf222e; font-weight: 600; }
.tag { display: inline-block; padding: 0 7px; border-radius: 10px; font-size: 12px; font-weight: 600; background: #eef0f3; }
.tag.bad { background: #ffebe9; } .tag.ok { background: #e6f4ea; color: #1a7f37; }
img { max-width: 100%; background: #fff; border: 1px solid #e3e6eb; border-radius: 6px; }
figure { margin: 0 0 18px; } figcaption { font-size: 12px; color: #6b7280; }
.box { background: #fff; border: 1px solid #e3e6eb; border-radius: 8px; padding: 12px 16px; }
"""

VERDICT_CLASS = {"error": "bad", "intentional": "ok", "false_positive": "ok"}


def _score(value) -> str:
    if value is None:
        return '<span class="muted">n/a</span>'
    cls = "good" if value >= 80 else "warn" if value >= 60 else "bad"
    return f'<span class="{cls}">{value:.1f}</span>'


def _detail(detail: dict) -> str:
    return ", ".join(f"{k}={v}" for k, v in detail.items() if not isinstance(v, (list, dict)))


def _video_type(vt: dict | None) -> str:
    if not vt:
        return ""
    notes = []
    if vt.get("designed_share"):
        notes.append(f"designed pictures (graphics, animation, screen capture) {vt['designed_share']:.0%} of the runtime: "
                     "camera checks not applied to them")
    if vt.get("music_montage"):
        notes.append("cut to music at a quick pace: colour continuity not judged, flash cuts counted as rhythm")
    return (f'<p class="small"><b>Video type:</b> {escape(vt.get("label", ""))}'
            + (f' <span class="muted">— {escape("; ".join(notes))}</span>' if notes else "") + "</p>")


def render(report: dict, figures: Path | None) -> str:
    def img(name: str, alt: str) -> str:
        if figures is None or not (figures / name).exists():
            return ""
        return f'<figure><img src="figures/{escape(name)}" alt="{escape(alt)}" loading="lazy"><figcaption>{escape(alt)}</figcaption></figure>'

    eqi, ai, crit, video = report["eqi"], report.get("ai"), report["criteria"], report["video"]
    narrative = crit.get("narrative", {})
    issues = [i for k in config.SIGNAL_CRITERIA for i in crit[k]["issues"]]

    score_rows = "".join(
        f"<tr><td>{escape(c['label'])}</td><td>{c['weight']:.2f}</td><td>{_score(c['score'])}</td>"
        f"<td>{_score(c['score_with_ai_verdicts'])}</td><td>{len(c.get('issues', []))}</td><td>{escape(c.get('ai_comment') or '')}</td></tr>"
        for c in crit.values()
    )

    def verdict(i: dict) -> str:
        if ai is None:
            return '<span class="muted">—</span>'
        v, r = i.get("verdict"), i.get("ai_review") or {}
        tag = f'<span class="tag {VERDICT_CLASS.get(v, "")}">{escape(v or "not reviewed")}</span>'
        if r.get("verdict") and r["verdict"] != v:  # an excuse given without enough confidence
            tag += f' <span class="small muted">(model said {escape(r["verdict"])} at {r.get("confidence") or "?"}/5)</span>'
        elif r.get("confidence"):
            tag += f' <span class="small muted">{r["confidence"]}/5</span>'
        seen = f'<div class="small muted">Seen: {escape(r["observation"])}</div>' if r.get("observation") else ""
        return f"{tag} {escape(i.get('note') or '')}{seen}"

    issue_rows = "".join(
        f"<tr><td>{escape(i['id'])}</td><td>{escape(i['kind'])}</td><td>{_ts(i['t'])}–{_ts(i['t_end'])}</td>"
        f"<td>{i['severity']:.2f}</td><td class=\"small\">{escape(_detail(i['detail']))}</td><td>{verdict(i)}</td></tr>"
        for i in issues
    ) or '<tr><td colspan="6" class="muted">No issues detected.</td></tr>'

    if ai:
        levels = narrative.get("levels") or []
        runs = f" (median of {len(levels)} runs: {', '.join(map(str, levels))})" if len(levels) > 1 else ""
        models = sorted(set(ai.get("run_models") or [])) or [ai.get("model") or ""]
        parts = "".join(
            f"<tr><td>{escape(p['start'])}–{escape(p['end'])}</td><td>{escape(p['fit'])}</td>"
            f"<td>{escape(p.get('about') or '')}</td><td class=\"small\">{escape(p.get('visuals') or '')}</td></tr>"
            for p in narrative.get("parts") or [])
        parts_html = ("<table><tr><th>Part</th><th>Fit</th><th>About</th><th>On screen</th></tr>" + parts + "</table>"
                      "<p class=\"small muted\">Parts of the first run. Level from the parts (1 + 4 × the runtime share "
                      "weighted by fit: " + ", ".join(f"{k} {v:g}" for k, v in config.K6_FIT_WEIGHT.items())
                      + f"), reported only: {', '.join(map(str, narrative.get('parts_levels') or [])) or '—'}.</p>") if parts else ""
        ai_html = (
            f"<div class=\"box\"><p><b>K6 narrative–visual coherence:</b> level {narrative.get('level')}/5{runs} — "
            f"{escape(narrative.get('evidence') or '')}</p>{parts_html}<p>{escape(ai.get('summary') or '')}</p>"
            + ("<p><b>Improvements</b></p><ul>" + "".join(f"<li>{escape(s)}</li>" for s in ai.get("improvements") or []) + "</ul>"
               if ai.get("improvements") else "")
            + f"<p class=\"small muted\">Model {escape(', '.join(models))} · verdicts: "
            + escape(", ".join(f"{n} {v.replace('_', ' ')}" for v, n in (ai.get("verdict_counts") or {}).items())) + "</p></div>"
        )
    else:
        ai_html = f"<p class=\"muted\">{escape(report.get('ai_error') or 'AI layer not run.')}</p>"

    cards = "".join(img(f"issue_{i['id']}.png", f"{i['id']} · {i['kind']} · {_ts(i['t'])}") for i in issues)
    name = Path(video["path"]).name
    full = eqi["full"]
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EQI report — {escape(name)}</title><style>{CSS}</style></head>
<body><main>
<h1>EQI report — {escape(name)}</h1>
<div class="meta">{video['duration_s']} s · {video['width']}×{video['height']} · {video['fps']} fps · {len(report.get('shots', []))} shots · {escape(report['tool']['name'])} {escape(report['tool']['version'])}</div>
{_video_type(report.get('video_type'))}
<div class="cards">
  <div class="card">EQI<b>{_score(full if full is not None else eqi['signal_only'])}</b><span class="small muted">{'K1–K5 measured + K6 rated by AI' if full is not None else 'K1–K5 measured (no AI layer)'}</span></div>
  <div class="card">Measured only<b>{_score(eqi['signal_only'])}</b><span class="small muted">K1–K5</span></div>
</div>
<h2>Criteria</h2>
<table><tr><th>Criterion</th><th>Weight</th><th>Score</th><th>If AI verdicts counted</th><th>Issues</th><th>AI comment</th></tr>{score_rows}</table>
<p class="small muted">K1–K5 are measured; K6 is rated by the AI. The AI's verdicts on measured issues are shown as opinions and do not change the score: in validation they excused most real defects as intentional.</p>
<h2>AI review</h2>
{ai_html}
<h2>Figures</h2>
{img("scores.png", "Scores per criterion")}{img("timeline.png", "Issues over time")}{img("loudness.png", "Loudness (EBU R128)")}{img("beats_cuts.png", "Cuts vs beats")}
<h2>Issues</h2>
<table><tr><th>ID</th><th>Type</th><th>Time</th><th>Severity</th><th>Measurement</th><th>AI opinion (not scored)</th></tr>{issue_rows}</table>
<h2>Evidence frames</h2>
{cards or '<p class="muted">No evidence frames.</p>'}
</main></body></html>
"""


def write(report: dict, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    figures = out_dir / "figures"
    path = out_dir / "report.html"
    path.write_text(render(report, figures if figures.is_dir() else None), encoding="utf-8")
    return path
