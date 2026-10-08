# EQI — Edit Quality Index

Automatic assessment of **post-production editing quality** (cuts, pacing, colour,
sound, framing and how the visuals serve the narration) of human-edited videos.
This is the *Tool* of the article **"AI-Driven Automatic Detection of Video Edit Quality"**.

The design principle: everything that can be **measured** is measured with
deterministic signal processing (reproducible, explainable); a multimodal model
(Gemini) only judges what cannot be measured (narrative coherence, K6). It also
comments on each measured issue (real error, deliberate style, or false
detection), but these comments **do not change the score**: in validation the
model excused most real, injected defects as deliberate style (see *Proof*).

## Criteria (single source of truth: `eqi/config.py`)

| | Criterion | Weight | Measured as | Main references |
|---|---|---|---|---|
| K1 | Cut & transition smoothness | 0.20 | shots: hard cuts (PySceneDetect) and dissolves, fades and wipes (twin comparison; in a video where no cut is found, dissolves in moving footage from the colour make-up one second apart); flash frames (≤ 2-frame shots whose pixels leave the range of the frames either side), jump cuts (cuts that keep the background: unchanged-pixel ratio; inside a shot also a sudden, reliably measured jump of a panning camera; a change that only brightens or darkens is a change of light, not a jump), opposite camera motion across a cut (Farnebäck optical flow) | PySceneDetect; Zhang et al. 1993; Pardo et al. 2021 |
| K2 | Pacing & temporal rhythm | 0.20 | dead air (silence + static picture inside the programme; a silent title or end card marked by a cut is not dead air), very long static shots, average shot length, cut–beat alignment vs chance when the audio is music-driven (librosa beat tracking, onset pulse clarity) | Cutting et al. 2010; McFee et al. 2015 |
| K3 | Colour & lighting consistency | 0.16 | shots whose colour deviates from the video's dominant grade (CIEDE2000; dips to black left out) or whose tint (a\*b\*) differs from both neighbouring shots while those agree (a mismatched camera or grade inside a scene), brightness flicker, clipped highlights/shadows | Sharma et al. 2005 |
| K4 | Audio-visual balance | 0.12 | integrated loudness outside the accepted delivery levels (−24 to −14 LUFS: broadcast to streaming), true peak > −1 dBTP, loudness range, sudden loudness jumps against the level of the seconds before (momentary vs short-term loudness, ffmpeg ebur128) | ITU-R BS.1770; EBU R128; ATSC A/85 |
| K5 | Framing & composition | 0.12 | judged per shot from three frames (¼, ½, ¾; a face counts when most of them show one): subject (Haar face detector, else spectral-residual saliency) cut off by the frame edge, headroom, placement vs centre/thirds, soft focus (Laplacian variance vs the video's typical sharpness), camera shake (phase-correlation jitter) | Viola & Jones 2001; Hou & Zhang 2007 |
| K6 | Narrative–visual coherence | 0.20 | Gemini rates 1–5 against an anchored rubric with timestamped evidence; score = (level − 1)/4 · 100 | Wu et al. 2024 (Q-Align) |

Every criterion score is a transparent function of its issues (see *Scoring*).
Two indices are reported:

* **EQI** (`eqi.full`) — measured K1–K5 plus K6 rated by the AI
* **EQI_signal** (`eqi.signal_only`) — K1–K5 only (weights renormalized), when no AI is used

For the ablation the report also gives `eqi.full_with_ai_verdicts`: the score
if issues the AI called *intentional* or *false_positive* stopped counting.
`AI_VERDICTS_IN_SCORE` in `config.py` switches that back on; keep it off unless
a new model passes the validation below.

**Video-relative thresholds.** K3's grade test and K5's soft-focus test compare a
shot with the video's own statistics (dominant grade and its shot-to-shot spread;
typical sharpness). Each shot weighs its length, but at most the median shot
length: a long take is one grading decision like any other shot and cannot hide
its own mismatch, while a fragment shorter than a typical shot moves the
statistics only by its share. The median is averaged over the middle 20 % of the
weight, so it moves gradually instead of jumping to the next shot's value.
Severity grows from 0 at the threshold to full at twice the threshold (half the
sharpness for soft focus); findings in the first tenth of that ramp are not
reported, because there the two sides of the threshold are within the jitter of
re-encoding and shot detection. A shot's framing, face and sharpness are judged
from three of its frames, and frozen (duplicate) frames are left out of the
spike statistics that find jump cuts inside a shot.

**Scoring.** Cut errors (flash frames, jump cuts, opposite camera motion), dead
air and loudness jumps are events: the viewer meets each at a moment, however many
good cuts surround it, and one glaring error is enough to make an edit look
careless. They are counted as severity-weighted errors per minute of viewing, at
one rate for all three criteria: the error term is
1 − (Σ severity / minutes) / `ERRORS_FULL_PER_MIN` with the rate set to 1, so one
full-severity error per minute empties the term and one in two minutes halves it.
K1 = 100 · error term; K2 = 0.5 · dead-air term + 0.25 · average shot length +
0.25 · cut–beat alignment (renormalized when the audio is not music);
K4 = 100 · (1 − 0.5 · level/peak/range penalty − 0.5 · (1 − jump term)).
K3 and K5 judge properties of shots (grade and exposure; framing, focus and
shake) and count them as a share of the shots:
K3 = 100 · (1 − 3 · (0.7 · mismatches + 0.3 · exposure findings) / shots),
K5 = 100 · (1 − 3 · mean penalty per shot). Their detectors also fire on
deliberate style — a trailer's differently graded scenes, a handheld action shot —
so a per-minute count would punish style as hard as errors.

*Style.* A device that recurs is a technique, not a slip: jump cuts or opposite
camera motion on three or more cuts (or on two that make up a quarter of the
cuts), flash frames on a quarter of the cuts (a strobe) and loudness jumps three
or more times (a trailer's hits, laughter in a vlog) are reported with their
measurements but count zero. A lone flash frame or jump cut is the classic slip
and counts in full.

*No evidence.* A video without a cut gives K1 the scale's midpoint (50), and a
video with only one lit shot caps K3 at 50: no cut is no evidence of smooth
cutting. The AI is told the measured number of cuts, and one unedited take with
nothing added (no graphics, text or cutaways) gets K6 level 1.

**What the AI sees.** The whole video at 1 frame/s and high media resolution
(280 tokens per frame instead of 70, so focus, jitter and edges stay visible),
with audio; close-up clips at 24 frames/s around issues the overview cannot
show (flash frames and jump cuts first, then shake and flicker, then loudness
jumps). The model must describe what it sees before its verdict, follow
explicit per-type rules for "intentional", and give a confidence; Gemini 3
models run at their default temperature, as Google recommends.

## Install

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # Windows; on macOS/Linux: .venv/bin/python
```

ffmpeg is bundled through `imageio-ffmpeg`. For the AI layer set `GEMINI_API_KEY`
(optional `GEMINI_VIDEO_MODEL`, default `gemini-3.1-pro-preview`, the most
capable model available; a pinned name rather than an alias such as
`gemini-pro-latest`, so experiments can be repeated) — either as an environment
variable or as a `GEMINI_API_KEY=…` line in `tools/eqi/.env` (git-ignored).
Without a key the signal layer still runs and `EQI_full` is reported as n/a. An
overloaded (503) or rate-limited (429) model is retried after 5, 15 and 30 s,
then `GEMINI_FALLBACK_MODEL` (default `gemini-3.8-flash`) is tried the same way;
the model that answered each run is stored in the report. For experiments use
`--strict-model` (no fallback) so that every video is judged by the same model,
and rerun failed videos with `batch --resume`.

K6 is the mean of `--k6-repeats` independent reviews of the same upload
(default 2): on the Sintel trailer two runs gave level 4 and level 3, a 5-point
swing in EQI. The report keeps every run's level. An answer that is not valid
JSON is asked for again once; if it never parses, the raw answers are stored in
`report.json` (`ai_unparsed_responses`). Token use of every call is stored in
`ai.usage`: for the 52 s Sintel trailer one Gemini 3.1 Pro run took 80 k input
and 3–4 k output tokens (thinking included).

### Baseline: DOVER (optional, for Tier 2)

Tier 2 compares EQI with DOVER (Wu et al., ICCV 2023), a general video quality
model with an aesthetic and a technical branch, to show what an edit-specific
measure adds. DOVER is licensed for **non-commercial use only** (S-Lab License
1.0) and needs PyTorch, so it runs in its own environment and never enters the EQI
score. Setup (Windows; on macOS/Linux use `bin/python`):

```bash
git clone https://github.com/VQAssessment/DOVER third_party/DOVER      # tested at f1ddc96 (2024-08-12)
python -m venv .venv-dover
.venv-dover/Scripts/python -m pip install torch==1.13.1+cpu torchvision==0.14.1+cpu --index-url https://download.pytorch.org/whl/cpu
.venv-dover/Scripts/python -m pip install "numpy<1.24" decord opencv-python-headless einops "timm==0.6.13" pyyaml scikit-video tqdm scipy
curl -L -o third_party/DOVER/pretrained_weights/DOVER.pth https://github.com/QualityAssessment/DOVER/releases/download/v0.1.0/DOVER.pth
# DOVER.pth: 239,729,097 bytes, sha256 f4a42c0bbc94c94dd7409e7f40887d44c5c30314d1d09e7edf03cc35813b4838
```

Other locations can be given with `DOVER_PYTHON` and `DOVER_DIR`. `eqi/dover_runner.py`
scores the videos as DOVER's `evaluate_one_video.py` does (default fusion to an
overall score in [0, 1]); DOVER samples frames at random offsets, so the seed is
fixed per video and a video always gets the same score. On CPU one video takes
about 10–15 s after the model has loaded.

## Use

```bash
python -m eqi analyze video.mp4 --out out/video1        # report.json, report.html, figures/
python -m eqi analyze video.mp4 --no-ai                 # signal layer only
python -m eqi batch videos/ --out out/batch --strict-model --resume --dover   # all videos + scores.csv (Tier 2 input)
python -m eqi synth --out out/synthetic_clean.mp4       # clean synthetic test video
python -m eqi tier1 source.mp4 --out out/tier1 --figures   # controlled-defect experiment
python -m eqi rescore out/tier1 --out out/tier1_new     # same Tier-1 videos, scored with the current code
python -m eqi rescore out/tier1 --out out/tier1_new --reuse-reports   # only the scoring rules changed: no new analysis
python -m eqi rescore-reports out/batch --out out/batch_new --ai-from out/batch_ai   # saved reports, current scoring; K6 from another run
python -m eqi ai-check out/tier1 out/tier1_b --out out/ai_check --extra out/k6_test   # AI review accuracy (calls Gemini)
python -m eqi tier2 out/batch/scores.csv ratings.csv --out out/tier2
python -m pytest -q tests                               # 70 tests
```

`ratings.csv` (long format): `video, rater, overall[, cuts, pacing, color, audio, framing, narrative]`
with ratings on the ITU-T P.910 five-point ACR scale.

### Outputs
* `report.json` — scores, every issue with time, severity, measurement and AI verdict, shot list, timing
* `report.html` — the same in readable form with all figures (open in a browser)
* `figures/timeline.png` — issue severity per criterion over time, cut positions
* `figures/issue_<id>.png` — evidence per issue: the exact frames around a cut, colour swatches, thirds grid with the subject box, jitter trace
* `figures/loudness.png`, `beats_cuts.png`, `scores.png`

## Proof protocol

**Tier 1 — controlled defects (ground truth known).** `tier1` injects seven defect
kinds at up to three severity levels into a clean source — jump cut, flash frame,
colour mismatch (white-balance shift), loudness jump, dead air, bad framing (crop
that pushes the subject to the edge), camera shake — all levels at the same time
position, and reports detection recall, false alarms and the score response.
On real footage five rules keep the measurement fair: the clean reference goes
through the same encoder as every variant; every frame more than about a second
away from a defect is identical to the clean reference (constant quantizer and an
IDR frame every second on the same pictures, also after a jump cut; the colour
shift is applied to its one shot only, not as an RGB round trip of the whole
video); defects are placed away from spots where the clean video already has an
issue of the same kind; the loudness boost goes into the quietest non-silent
window (a boost on an already loud passage is lost to clipping); and only an issue
the clean reference does not have counts as a detection (after a jump cut, later
issues are realigned on the shortened timeline). Besides same-kind false alarms,
`tier1` counts side effects away from the defect in both directions: new issues
of other kinds, and issues of the clean reference that vanished.

Result on the synthetic source (`synth`, 8 shots × 5 s, 120 BPM, −14 LUFS):
clean video EQI 100 with 0 issues; **0 false alarms and 0 side effects**; all
seven kinds detected at their strongest level; recall 17/23 events overall; the
targeted criterion never improves as severity rises (all 7 kinds monotonic) — the
same with the final code. Misses are sub-threshold by
design: colour shifts below ΔE00 = 4 (L1–L2) and +6/+9 dB boosts below the
+10 LU jump threshold (these still lower K4 through the true-peak check).

**Real-video check (calibration).** On the Sintel trailer (Blender Foundation,
CC-BY, 52 s, 854×480) the first version flagged cinematic style as errors
(EQI_signal 59.2: dark-scene cut read as a jump cut, black lead-in as dead air,
dramatic sound hits zeroing K4, fast action read as camera shake). Principled
fixes — ignore near-black pixels in the unchanged-pixel ratio, skip the first/last
2 s for dead air, saturate the loudness-jump penalty, judge shake only from
trusted motion estimates (phase-correlation response ≥ 0.2 on ≥ 60 % of a shot),
measure softness relative to the video's own lit shots — raised it to 80.5 while
the synthetic Tier-1 results stayed identical (0 false alarms, 17/23, 7/7
monotonic). The remaining issues are mostly deliberate style (dramatic hits, an
action shot's camera shake), which is what the AI review is for. With the final
code the trailer scores EQI_signal 81.2; with Gemini 3.1 Pro (K6 level 4 in both
runs) EQI 79.9. The model called all 15 reviewed issues intentional, 13 of them
at confidence 5.

**Tier 1 on real footage (October 2026).** The same 20 variants were made from
four real, professionally edited videos — the Sintel trailer, a 90 s Tears of
Steel excerpt, a 90 s NASA ScienceCast (narration over footage) and a 90 s NASA
interview compilation — with the harness above, and scored with the final code
(`out/tier1v6_*`, videos in `out/tier1v2_*/videos`; the clean reference is
re-encoded like the variants, so its EQI differs slightly from the original file's).

| Source | Clean EQI_signal | Issues on clean | Detected, strongest level | Detected, all levels | Same-kind false alarms | Side effects: new + lost (severity) | Monotonic kinds |
|---|---|---|---|---|---|---|---|
| Synthetic | 100.0 | 0 | 8/8 | 17/23 | 0 | 0 | 7/7 |
| Sintel trailer | 85.6 | 14 | 5/8 | 10/23 | 1 | 1 + 26 (3.91) | 5/7 |
| Tears of Steel | 90.6 | 10 | 6/8 | 11/23 | 2 | 8 + 0 (0.87) | 7/7 |
| NASA ScienceCast | 82.0 | 6 | 6/8 | 12/23 | 0 | 0 | 6/7 |
| NASA interview | 59.4 | 9 | 7/8 | 17/23 | 0 | 0 | 6/7 |
| **Real videos** | | | **24/32 (75 %)** | **50/92 (54 %)** | **3/80** | **35 in 22/80 (4.78)** | **24/28** |

With the per-minute scoring a detected defect now costs what a viewer would
notice: the mean EQI_signal drop at the strongest level over the four real
videos is 16.1 for a flash frame, 11.3 for a 4 s dead air, 4.5 for a jump cut,
4.4 for a colour shift, 1.3 for a +12 dB boost, 1.1 for shake and 0.4 for a crop
(5.6 over all kinds; with the scoring of the first blind test 1.4, e.g. 1.9 for
a flash frame and 3.4 for dead air). Where the clean video already has the
same kind of error, the criterion can be at its floor and the drop is smaller:
the NASA interview's silent title cards between the interviews are dead air
already, so a further 4 s of dead air no longer lowers K2. Detection is
that of the previous code with three differences: the lighting test removed a
muzzle flash that had been read as a jump cut in the clean Tears of Steel; the
+9 dB boost in the NASA interview is no longer found, since it rises less than
10 LU above the level of the seconds before (the +12 dB boost is); and in the
Sintel trailer the +12 dB boost is found but, with the trailer's own two hits,
counts as recurring sound design (three jumps), so K4 does not drop.

At the strongest level, by kind (real videos): flash frame, dead air and shake
4/4; colour shift 6/8 events; loudness boost 3/4; bad framing 2/4; jump cut 1/4.
Missed at the strongest level: jump cuts in Tears of Steel, the ScienceCast and the
interview (a piece removed from a handheld or busy shot looks like a new angle);
the colour shift in Sintel (its shots differ so much that the grade test's
threshold is about 26 ΔE00 while the shifted shot moves from 3.9 to 5.6, and its
neighbours are different scenes, so the tint test does not apply); the crop in
Sintel and Tears of Steel; the +12 dB boost in the ScienceCast.

*Side effects.* Away from the defect, `tier1` counts both new issues of other
kinds (the same-kind count alone missed them) and issues of the clean reference
that vanished. What is left sits in two videos. In Tears of Steel one 1 s, mostly
blown-out white shot has its colour just at the reporting margin and appears in 8
variants with severity 0.10–0.12 (and as the two same-kind false alarms). In
Sintel two findings just above the margin on one shot (colour 0.13, softness 0.09)
vanish in 10 variants, and in the three colour variants the warm-sky shot (0.57)
vanishes too: the shifted shot moves the video's grade, so K3 rises from 79.6 to
94 although the shift itself is not detected. Borderline flips cost a fraction of
an EQI point; the Sintel colour case is the one real reverse side effect.

*What the fixes changed.* The previous code on the earlier variant videos gave
27/32 at the strongest level, 64/92 at all levels, 0 same-kind false alarms and
**38 side effects (29 new, 9 lost) in 21 of 80 variants with a total severity of
22.2** — e.g. a
borderline Sintel shot (ΔE00 25.9 against a threshold moving between 18.6 and
25.5), or 16 EQI points lost in one ScienceCast variant whose shake was not even
detected. The causes were the harness (the colour filter changed every frame by
about 2 levels; long GOPs carried a defect's encoding to the next keyframe), shot
statistics that moved with every split or added shot, and frozen frames that made
ordinary motion look like a jump cut (z ≈ 860). Scoring those same earlier videos
with the final code isolates the code's share:

| Earlier videos | Strongest level | All levels | Same-kind false alarms | Side effects (severity) | Monotonic kinds |
|---|---|---|---|---|---|
| Previous code | 27/32 | 64/92 | 0 | 38 in 21/80 (22.2) | 25/28 |
| Final code | 27/32 | 61/92 | 3 | 24 in 10/80 (5.6) | 23/28 |

So the fixes cost three detections at weaker levels — a Sintel jump cut (frozen
frames no longer lower the shot's typical motion) and two mild crops (a face now
counts only when most of a shot's frames show it) — and add three false alarms of
severity ≈ 0.1, while cutting the side effects to a quarter of their severity
(the count falls less: borderline findings still flip). The larger drop on
the regenerated videos (61 → 51 of 92) comes from where the defects landed: the
injection avoids spots where the clean video already has an issue of the same
kind, the clean analyses differ between code versions, so 10 of the 14 variants
whose detection changed had their defect in another shot (with one defect
position per kind and source, recall varies with the shot drawn). The thresholds
were not tuned further on these videos, to avoid fitting them to the test set.

**AI layer validation (October 2026).** The strongest level of every defect
was injected into four real videos (Sintel trailer, a Tears of Steel excerpt,
a NASA ScienceCast and a NASA interview) and reviewed in a 2 × 2 design: first
vs calibrated prompt, Gemini 3.8 Flash vs 3.1 Pro. A correct review keeps an
injected defect as an *error* and excuses issues flagged on the clean,
professionally edited originals.

| Configuration | Injected defects kept as error | Clean-video issues excused | Balanced accuracy |
|---|---|---|---|
| First prompt, Flash | 2/25 (8 %) | 49/49 (100 %) | 54 % |
| First prompt, Pro | 5/26 (19 %) | 49/49 (100 %) | 60 % |
| Calibrated, Flash | 11/26 (42 %) | 26/49 (53 %) | 48 % |
| Calibrated, Pro | 6/26 (23 %) | 44/49 (90 %) | 56 % |

No configuration is meaningfully better than chance: the models see the
defects (flash frames are caught 4/4 once the clips run at 24 fps) but explain
most of them as deliberate style, often at confidence 5 (a 4 s freeze with
silence as "a dramatic pause"). Applied to the score, the verdicts would erase
the defects' effect (mean EQI drop over defect variants 2.5 → about 0). K6, in
contrast, separates matching from mismatched narration: the explainer scores
level 4, the same pictures with another video's speech level 2 (both models).
Hence the AI verdicts are reported as opinions only.

**Blind tier tests (October 2026).** Videos were grouped before scoring by who
made them — professional (studios, broadcasters, agencies, labels), mid (regular
creators' and organisations' own videos), amateur (individuals' personal videos) —
plus *broken* copies of professional videos with all seven Tier-1 defects at their
strongest level. They were analysed under neutral names (v01…, m01…) in shuffled
order; the AI never sees the groups. The groups describe the producer, not the
edit, so some amateur videos are well edited. EQI = measured K1–K5 + K6 from
Gemini 3.1 Pro (mean of two runs, `--strict-model`).

| Set | Professional | Mid | Amateur | Broken | Spearman ρ, group order vs EQI |
|---|---|---|---|---|---|
| First set, before the fixes (22 videos) | 76.1 | 70.2 | 78.4 | 68.4 | −0.06 |
| First set, final code (22 videos, `out/eval_tiers/results_v6`) | 81.5 | 68.4 | 68.2 | 45.4 | 0.54 (p = 0.01) |
| **Market set, final code, held out (33 videos, `out/eval_market/results`)** | **81.8** | **74.3** | **66.8** | **61.1** | **0.66 (p < 0.001)** |

(medians; ρ over all groups with professional > mid > amateur > broken). The
first set (22 Wikimedia Commons videos, 90 s excerpts or whole short videos) was
used while designing the fixes of 8 October: before them, unedited phone clips
got full marks on K1 and K3 for lack of evidence and the same K6 as edited
videos, broadcast-level loudness and speech after a pause cost professional
videos points, and a detected defect cost 0.5–4 EQI points. The market set was
chosen afterwards to represent what is published: YouTube videos imported to
Commons under CC BY (ads, music videos, a car review, a cooking and a guitar
lesson, a short film; reviews, travel vlogs, unboxings, a wedding highlight, a
tutorial; personal unboxings, a dance clip, a student film), the first 120 s of
each, plus broken copies of the cooking video, the car review and the guitar
lesson. Nothing was tuned on it. On the market set a random professional video
scores above a random mid one with probability 0.69, mid above amateur 0.79,
professional above amateur 0.86, amateur above broken 0.70; every professional
and mid video scores above every broken one, and each broken copy scores 19–30
points below its own clean original (cooking 79.8 → 61.1, car review 83.8 → 64.5,
guitar lesson 89.6 → 59.6). The broken copies keep the original's story (K6 level
4) and lose most on K1 and K2 (the flash frame and the 4 s freeze). In them the
flash frame, the freeze, the shake and the colour shift were found 3/3, the crop
2/3 (weakly), the jump cut 1/3 (missed inside moving shots) and the +12 dB boost
0/3: the harness puts it into the quietest stretch, which even boosted stays
less than 10 LU above the level of the seconds before. Gemini use for both sets: 6.1 M input and 0.42 M output
tokens (thinking included), 110 calls.

What still costs well-made videos points: loud masters (−8 to −10 LUFS with true
peaks above −1 dBTP in an ad, a music video and a short film) bring K4 down to
15–37 against the streaming ceiling of −14 LUFS; two jump cuts count as two slips while three
count as a style, so one more or one less detection can flip the group (a tour
montage on the first set: K1 85 → 42); and K6 varied by three levels between the
two runs on one video (levels 1 and 4 on an amateur unboxing).

**Tier 2 — real videos vs experts.** `tier2` reports SRCC, KRCC, PLCC (after a
4-parameter logistic mapping), RMSE with bootstrap 95 % CIs, rater reliability
ICC(2,1)/ICC(2,k) (Shrout & Fleiss 1979) and the split-half human ceiling. When
`scores.csv` holds the DOVER baseline (`batch --dover`), the same statistics are
reported for DOVER's overall, aesthetic and technical scores, and `vs_dover` gives
SRCC(EQI) − SRCC(DOVER) on the same videos with a paired bootstrap 95 % CI (videos
resampled together, since both correlations use the same ratings).

## Limitations (to report in the article)
* K3 compares mean colour, so a content-driven colour change (a close-up of a
  colourful object) can read as a grading mismatch; the AI review is expected to
  mark these `false_positive`. Thresholds are calibrated on synthetic defects and
  must be re-checked on real footage (Tier 1 on the authors' own videos).
* Haar cascades miss profile/small faces; saliency is a weaker subject cue and
  counts half.
* Jump-cut detection needs a kept background (static camera) or a measurable
  camera pan; a piece removed from a handheld or busy shot looks like a new
  angle and is missed.
* Dissolves, fades and wipes are found as cuts, but their style is not judged. In
  moving footage a dissolve does not raise the frame difference above the camera's
  own motion; it is found from the colour make-up a second apart only in a video
  where no cut is found otherwise. In a video that also has hard cuts such dissolves
  are missed: on the first test set the same colour test would have added real
  dissolves and false cuts (graphics appearing, a hand leaving the frame) in
  similar numbers.
* A change that only brightens or darkens the picture is taken for a change of
  light (a lamp, a muzzle flash), not for a jump cut or a flash frame. A jump cut
  in which a dark subject vanishes from a bright background also changes the
  pixels one way and is missed.
* Loudness jumps that recur three or more times count as sound design; an amateur
  mix with a level jump at every clip boundary is then judged only by its loudness
  level and range.
* K4 judges loudness against delivery levels (−24 to −14 LUFS). Loud music and
  advertising masters (−8 to −10 LUFS) lose most of K4 although the mix may be
  intended; the editor rarely controls the master.
* The style rule is a threshold: two jump cuts count as two slips, three as a
  technique, so one detection more or less can move K1 by tens of points. A
  discount that grows with each repetition would be smoother; it should be
  chosen on a new test set, not on the two used here.
* A title or end card is recognised by a cut near where the sound starts or stops;
  a silent end card that appears without a cut counts as dead air, like a last shot
  that freezes and runs silent to the end.
* Video-relative thresholds (K3 outlier test, K5 softness) can still flip a
  finding that sits at the reporting margin when a defect changes another shot
  (one shot each in Tears of Steel and Sintel, severity ≈ 0.1); the margin and the
  ramp keep the effect small. In a video without one dominant grade (a montage) a
  colour change can move the reference itself and hide another mismatch (Sintel:
  K3 79.6 → 94); there the grade test is fragile and the tint test is the reliable one.
* Jump cuts are found less often in shots that mix still and moving parts:
  frozen frames are left out of the spike statistics, which ends false jump cuts
  after a freeze but makes a jump in a busy shot stand out less.
* Recall in Tier 1 depends on which shot a defect lands in (one position per kind
  and source); more positions per source would narrow this.
  Lip-sync (SyncNet) is not measured.
* Gemini's YouTube/video understanding is a preview capability whose model
  versions change; the model name is stored in every report.
* Downloading YouTube videos violates YouTube's Terms of Service — analyze files
  you have the rights to.

## References
Castellano, PySceneDetect · Chung & Zisserman 2016 (SyncNet) · Cutting, DeLong & Nothelfer 2010 ·
EBU R 128 · Farnebäck 2003 · Hou & Zhang 2007 · ITU-R BS.1770 · ITU-T P.910 (2023) ·
Kuglin & Hines 1975 · McFee et al. 2015 (librosa) · Pardo et al. 2021 · Sharma, Wu & Dalal 2005 ·
Shrout & Fleiss 1979 · Viola & Jones 2001 · Wu et al. 2024 (Q-Align) ·
Zhang, Kankanhalli & Smoliar 1993 (twin comparison)
