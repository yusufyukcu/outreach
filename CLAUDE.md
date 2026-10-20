@AGENTS.md

## EQI (`tools/eqi`)

`tools/eqi` is a Python program that measures the editing quality of a video: K1–K5 by signal processing, K6 by a Gemini review (median of three runs). An article about it comes later; it is not an article-writing tool. `tools/eqi/README.md` (English) holds the method and every result. The user writes in Turkish.

- Python 3.10 in `tools/eqi/.venv`: no PEP 701 nested f-strings. Tests: `.venv/Scripts/python -m pytest -q tests` from `tools/eqi` (about 2.5 min).
- The evaluation scripts are in `tools/eqi/eval/` (see its README) and their caches in `tools/eqi/out/eval_data/`. New evaluation scripts go there, not into a session scratchpad. Generated output goes in `tools/eqi/out/` (git-ignored).
- Run at most 3 analyses or cache builds at a time: about 10 in parallel filled the 16 GB of RAM.
- Gemini costs money and the credit has run out twice. Before anything that calls it (the AI layer of `analyze`, `batch` and `serve`, `ai-check`, `eval/k6_run.py`), ask the user whether the credit is topped up. A video with the structured K6 costs about $0.5.
- The three tier sets (`eval_tiers`, `eval_market`, `eval_holdout`; 88 videos) are all development sets. Say so with every result; an independent estimate needs a new held-out set that no rule was tuned on.
- Judge a change by tier separation, with `broken` clearly lowest, on those sets plus Tier 1. Do not tune thresholds on the Tier-1 videos. Report Tier 1 with same-kind false alarms and side effects in both directions (new issues and vanished clean issues).
- AI issue verdicts are opinions only; EQI = measured K1–K5 + AI-rated K6.
- DOVER (`third_party/DOVER`, `.venv-dover`) has a non-commercial licence: it is a Tier-2 comparison only, never part of the outreach web app or the EQI score.
- The TransNetV2 weights are in `third_party/TransNetV2/` (git-ignored; `scripts/export_transnetv2.py` rebuilds them). Without them the quiet-cut check is off and `video.shot_check` is null.
- Wikimedia Commons answers parallel downloads with 429: fetch one file at a time. Titles that differ only in letter case collide on Windows.
- The interface is the report-style page of `python -m eqi serve` (`eqi/webapp.py`, styled by `html_report.CSS`). No dashboards, extra screens or dark themes unless asked.
