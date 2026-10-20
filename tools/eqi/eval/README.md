# Evaluation scripts

The scripts behind the results in the main README. They re-score the 88 tier-set videos
and Tier 1 from cached features (nothing decoded, no Gemini), run the K6 Gemini reviews,
and compute the paired bootstraps, the ICC, the K6 day-to-day drift and the re-encode
stability. Until 21 October 2026 they lived in session scratchpads. The commands below
reproduce the stored outputs in `ref/` exactly (checked on 21 October).

Run them from `tools/eqi` with the program's venv (`.venv/Scripts/python`, Python 3.10);
`python` below means that.

## Data

`out/eval_data/` is git-ignored; `EQI_EVAL_DATA` points elsewhere.

| folder | contents |
|---|---|
| `fcache_tn2/` | features of the 88 tier-set videos and the 105 Tier-1 variants with the current code (TransNetV2 cut check); the default cache |
| `fcache3/` | the same with the code of 12 October, before that check; the K6 runs of 12 and 13 October were made from these features |
| `reenc/` | 30 re-encodes: 15 videos at 720p CRF 30 and 480p CRF 28 |
| `fcache_reenc_tn2/`, `fcache_reenc/` | features of the re-encodes, current code and code of 12 October |

`python eval/build_cache.py <name> 3` rebuilds a cache (about 75 min);
`python eval/reenc_eval.py build` extracts the re-encodes' features.

Environment variables, all optional:

* `EQI_CACHE`: the feature cache, a name in `out/eval_data` or a path (default `fcache_tn2`).
* `EQI_K6_RESULTS`: the results folder `h.py` takes K6 from. The default is the earlier
  prompt's runs (`results_v7`, for the holdout set `results`), which `final_eval.py`,
  `k6_eval.py` and `icc_matched.py` use as their baseline, so set it only for `h.py` and
  `ablate.py`.
* `EQI_CODE`: another code tree, e.g. an older commit checked out with `git worktree`
  (default `tools/eqi`).
* `EQI_REENC_CACHE`: the re-encodes' cache for `reenc_eval.py` (default `fcache_reenc_tn2`).

## Main results

| command | result | stored output |
|---|---|---|
| `EQI_K6_RESULTS=results_v8_final python eval/h.py --tier1` | tier separation per set and on all 88 (ρ 0.68), Tier 1 (31/40) | `ref/tn2_after.txt`; with `--save x`, `out/eval_data/dev_x.json` equals `ref/dev_tn2_after.json` |
| `python eval/final_eval.py` | structured K6 against the rules of 10 and 12 October (paired bootstrap), K6 alone, ICC | `ref/final_eval.out` |
| `python eval/reenc_eval.py` | re-encode stability: median EQI_signal change 1.5, type label the same in 30/30 | |
| `EQI_CACHE=fcache3 EQI_REENC_CACHE=fcache_reenc python eval/reenc_eval.py` | the same before the TransNetV2 check: 1.9 | |
| `python eval/boot.py a.json b.json` | paired bootstrap of ρ between two `--save` files | |

`final_eval.py` compares against `ref/dev_base_A.json` (rules of 10 October, earlier K6)
and `ref/dev_rules12_oldk6.json` (rules of 12 October, earlier K6).

## K6 drift test (not run yet, calls Gemini)

The 15 videos in `ref/drift_specs.txt` (5 per clean tier, seed 20261013 in `pick.py`) had
three answers on 12 October, and the final code sends Gemini the same inputs for them
(`same_inputs.py`: 15/15 on 21 October). The test makes 45 calls, about $7.5; check the
credit first.

```bash
python eval/api_check.py --call
EQI_CACHE=fcache3 python eval/k6_run.py results_v8_day2 $(cat eval/ref/drift_specs.txt) --workers 3
EQI_CACHE=fcache3 python eval/drift_eval.py
```

`k6_run.py` does not start without `EQI_CACHE`: `fcache3` keeps the inputs of 12 and 13
October, `fcache_tn2` is for runs with the current code.

## Other scripts

* K6: `k6_run.py` (Gemini runs into `out/<set>/<results folder>`), `k6_final.py` (final
  reports in `results_v8_final`), `k6_eval.py`, `k6_json.py`, `icc_matched.py`,
  `same_inputs.py`, `pick.py` (spec lists, written to `out/eval_data`; the lists of
  13 October are `ref/main_specs.txt` and `ref/drift_specs.txt`), `usage.py` (tokens
  used), `api_check.py`.
* Caches: `build_cache.py`, `update_cache.py` (brought the first TransNetV2 cache up to
  the final rule).
* Rules: `ablate.py` (each rule of 12 October switched off on its own), `t1_table.py`,
  `t1_detail.py`, `dumpiss.py`, `vt_list.py`, `single.py`, `k3_check.py`, `edge_run.py`
  (analyses the videos in `out/eval_data/edge`).
* Phantom cuts (13 and 14 October): `cut_tail.py`, `cut_tail2.py`, `cut_ncc.py`,
  `jc_detected.py`, `reenc_k1.py`, `reenc_shots.py`, `cutframes.py`.
* Probes looked at when a threshold was set (`probe_*.py`, `fill_dist.py`) and frame
  sheets (`sheet.py`, `tiles.py`, `designed_tiles.py`). Several of them decode frames of
  the videos.
