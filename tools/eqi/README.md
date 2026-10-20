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

Before judging, the program measures the **video type** (see *Video type*): which
shots are camera footage and which are designed pictures (graphics, animation,
screen capture, cards), and whether the video is a montage cut to music. Each check
of K1–K5 is applied only where its assumption about the footage holds — a camera
check to camera footage, colour continuity to consecutive shots of one scene — so
that a whiteboard animation, a screen-recorded tutorial, a music video and an
interview are each judged by what an error is in that kind of video.

## Criteria (single source of truth: `eqi/config.py`)

| | Criterion | Weight | Measured as | Main references |
|---|---|---|---|---|
| K1 | Cut & transition smoothness | 0.20 | shots: hard cuts (PySceneDetect; where the picture barely changes, mean \|Δgray\| < 2, a hit counts only if the shot-transition network TransNetV2 sees a transition there — an encoder keyframe redrawing a still picture is not a cut) and dissolves, fades and wipes (twin comparison; in a video where no cut is found, dissolves in moving footage from the colour make-up one second apart); flash frames (≤ 2-frame shots whose pixels leave the range of the frames either side; in a montage cut to music a flash cut of its rhythm), jump cuts (cuts that keep the background and visibly change the picture: unchanged-pixel ratio, mean \|Δgray\| ≥ 2 — a detector hit where an encoder's keyframe redraws the same picture is not a jump; inside a shot also a sudden, reliably measured jump of a panning camera; a change that only brightens or darkens is a change of light, not a jump; jumps a few frames apart are the footage's frame cadence — repeated frames, a timelapse, stop motion — not cuts; not tested where a designed picture keeps its layout, a slide or a screen), opposite camera motion across a cut (Farnebäck optical flow) | PySceneDetect; Souček & Lokoč 2020; Zhang et al. 1993; Pardo et al. 2021 |
| K2 | Pacing & temporal rhythm | 0.20 | dead air (the sound gone — no signal at all — while the picture stands still; longer stretches counting as more errors; a silent title or end card marked by a cut is not dead air, nor a pause with room tone), very long static shots (the picture a second later almost the same), average shot length (inside an animation or screen recording a change of the whole picture within a second is a change of scene, as a cut), cut–beat alignment vs chance when the audio is music-driven (librosa beat tracking, onset pulse clarity) | Cutting et al. 2010; McFee et al. 2015 |
| K3 | Colour & lighting consistency | 0.16 | camera shots only: shots whose colour deviates from the video's dominant grade (CIEDE2000; dips to black left out) or whose tint (a\*b\*) differs from both neighbouring shots while those agree (a mismatched camera or grade inside a scene; neither test in a montage cut to music, which jumps between setups by design), flicker of the light (one-way brightness changes of the whole frame, not movement in it), clipped highlights/shadows | Sharma et al. 2005 |
| K4 | Audio-visual balance | 0.12 | the mix as the platform plays it: integrated loudness below the accepted delivery levels (−24 LUFS broadcast, −14 LUFS streaming; a louder mix is turned down to −14 LUFS, a quieter one is not raised), true peak > −1 dBTP after that turn-down, loudness range, sudden loudness jumps against the level of the seconds before (momentary vs short-term loudness, ffmpeg ebur128) | ITU-R BS.1770; EBU R128; ATSC A/85 |
| K5 | Framing & composition | 0.12 | camera footage only, judged per shot from three frames (¼, ½, ¾; a face counts when most of them show one), and through a long take (≥ 8 s) from a frame every second, in 4 s stretches each judged like a shot: subject (Haar face detector, else spectral-residual saliency) cut off by the frame edge, headroom, placement vs centre/thirds, soft focus (Laplacian variance vs the video's typical sharpness), camera shake (phase-correlation jitter) | Viola & Jones 2001; Hou & Zhang 2007 |
| K6 | Narrative–visual coherence | 0.20 | Gemini first splits the video into its parts and labels what each part's visuals do — *shown* (b-roll, inserts, graphics, text, shots chosen for the music), *covered* (the scene cut from shots chosen to follow it), *recorded* (one recording of the speaker or event), *unrelated* — then rates 1–5 against an anchored rubric with timestamped evidence; median of three independent runs; score = (level − 1)/4 · 100 | Wu et al. 2024 (Q-Align) |

Every criterion score is a transparent function of its issues (see *Scoring*).
Two indices are reported:

* **EQI** (`eqi.full`) — measured K1–K5 plus K6 rated by the AI
* **EQI_signal** (`eqi.signal_only`) — K1–K5 only (weights renormalized), when no AI is used

For the ablation the report also gives `eqi.full_with_ai_verdicts`: the score
if issues the AI called *intentional* or *false_positive* stopped counting.
`AI_VERDICTS_IN_SCORE` in `config.py` switches that back on; keep it off unless
a new model passes the validation below.

**Video type** (`eqi/videotype.py`, reported as `video_type`). Each check of K1–K5
rests on an assumption about the footage — a camera recorded it, consecutive shots
continue one scene, a pause is part of the programme. The video type tells where
the assumption holds; it is decided by deterministic rules on measured features,
so K1–K5 stay independent of the AI.

* *Designed pictures* — graphics, animation, screen capture, slides, title cards. A
  camera never repeats one exact colour over a large area except where its sensor
  clips; a drawn or rendered picture does. A shot is designed when its five most
  frequent exact mid-tone colours cover at least 15 % of it (frames sampled at
  640 px with nearest-neighbour resizing, letterbox bars left out), each counted
  only as a *spike*: an exact colour with few nearly equal colours (± 2 levels)
  around it. Compression turns a smooth area of camera footage — a wall, a sky, a
  table — into a mound of nearly equal colours (1–5 near pixels per exact one
  measured), a drawn fill stays one colour (0.0–0.6); 93 % of all keyframes of the
  three test sets have no such fill at all. A shot is also designed when it shows
  text, logos or renders on black (a black ground of at least 30 % that meets crisp
  content: at most 45 % soft dark tones next to it; titles and logos measured
  0.09–0.48, camera shadows roll off at 0.55 or more). In a video that uses designed
  pictures (most of its shots on white, or 15 % of its runtime clearly designed), a
  white ground or a weaker fill (≥ 5 %) counts too: a heavier encode breaks up part of
  a slide's exact fills, and the decision must not flip with the encode. A blown sky
  in camera footage on its own is not designed. The
  camera checks are not applied to designed shots — exposure, flicker and grade
  match (K3), framing, focus and shake (K5), a kept background as a jump cut and
  opposite motion across a cut (K1) — and a video without camera footage is not
  judged on K3 and K5 at all (weights renormalized, as K4 for a video without
  sound). In a mixed video K3 and K5 count by the share of the runtime that is
  camera footage (`eqi.coverage`): they judge only that share, and one shot more or
  less judged as camera footage then moves EQI a little, not a lot. Inside a designed shot, a change of the whole picture within a second
  (mean |Δgray| to the frame a second before ≥ 30: a pan to the next panel, a new
  window, a morph) is a change of scene and counts as a cut for the average shot
  length (K2) and as evidence (K1).
* *Montage cut to music* — music-driven audio and an average shot of at most 3 s: a
  music video, an ad, a highlight reel. It cuts between setups and moments by
  design, so shot-to-shot colour continuity (K3's grade and tint tests) is not
  judged, and a one- or two-frame shot is a flash cut of its rhythm, reported as
  style (in two K-pop videos 3–4 such flashes among 83–119 cuts had emptied K1).
* The label — graphics, animation or screen capture (designed ≥ 70 % of the
  runtime); single take; montage cut to music; live action with graphics or screen
  capture (designed ≥ 20 %); presenter or interview (faces in half the camera
  shots); live-action edit — is reported and given to the AI as context.

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
from three of its frames (a long take from its 4 s stretches), and frozen
(duplicate) frames are left out of the spike statistics that find jump cuts
inside a shot.

**Scoring.** Cut errors (flash frames, jump cuts, opposite camera motion), dead
air and loudness jumps are events: the viewer meets each at a moment, however many
good cuts surround it, and one glaring error is enough to make an edit look
careless. They are counted as severity-weighted errors per minute of viewing, at
one rate for all three criteria: the error term is
1 − (Σ severity / minutes) / `ERRORS_FULL_PER_MIN` with the rate set to 1, so one
full-severity error per minute empties the term and one in two minutes halves it.
A video shorter than a minute counts as one minute of viewing: ratings of an
experience hardly depend on its length (duration neglect, Fredrickson & Kahneman
1993), and without the floor one detection would decide a 15 s clip's score between
full marks and zero.
Dead air is a stretch that gives the viewer nothing: the sound is gone (≤ −90 dBFS,
no signal at all: nothing was put on the track, or it dropped out) while the picture
stands still. A pause with room tone — a speaker thinking, someone typing, a still
slide or screen there to be read — is not dead air; every injected and real loss of sound measured
lies at −200 dBFS (digital zero), every pause with room tone between −80 and −50
dBFS. Dead air counts by its length: half an error at 1.5 s, a full one at 3 s, and
one more for every further 3 s (a 9 s freeze is three errors). A long shot (≥ 20 s)
is static when the picture a second later is almost the same (median |Δgray| to the
frame a second before < 1.5): a speaker talking (2–7) or a hand drawing on a
whiteboard (2.5–3.5) changes it, although their frame-to-frame differences are as
small as those of a still picture. Flicker is the light changing: a shot flickers
when its detrended brightness jitters (L\* SD > 1.5) and at least half of its frame
changes brighten or darken the whole picture one way (|Δ mean| ≥ 0.85 · mean |Δ|,
the lighting test of K1); before, movement in the picture (hands, a moving camera,
0–26 % one-way changes) was read as flicker.
K1 = 100 · error term · evidence factor; K2 = 0.5 · dead-air term + 0.25 · average
shot length + 0.25 · cut–beat alignment (renormalized when the audio is not music);
K4 = 100 · (1 − 0.5 · level/peak/range penalty − 0.5 · (1 − jump term)).
K3 and K5 judge properties of shots (grade and exposure; framing, focus and
shake) and count them as a share of the shots (a long take's 4 s stretches count
as shots in K5):
K3 = 100 · (1 − 3 · (0.7 · mismatches + 0.3 · exposure findings) / shots) · evidence factor,
K5 = 100 · (1 − 3 · mean penalty per shot). Their detectors also fire on
deliberate style — a trailer's differently graded scenes, a handheld action shot —
so a per-minute count would punish style as hard as errors.

*Style.* A device that makes up a quarter of the cuts (at least two) is how the
video is cut — a vlog cut with jump cuts, a music video's strobe of flash frames —
and is reported with its measurements but counts zero. Below that share, jump
cuts, opposite camera motion and loudness jumps count less the more often the
video uses them: each repeat halves the chance that any one use is a slip, so n
uses count n · 2^−(n−1) slips in total (1, 1, 0.75, 0.5, 0.31 …). One detection
more or less then moves the score a little instead of switching between a full
penalty and none (the previous rule zeroed three repeats and counted two in full).
A flash frame below the strobe share is the classic leftover frame and counts in
full however often it occurs.

*Evidence.* A criterion the video gives no chance to observe scores at most the
scale's midpoint: no cut is no evidence of smooth cutting, one lit shot none of
matching grades. Every cut (K1) and every transition between lit shots (K3) is
evidence, and the ceiling rises from 50 toward 100 as they add up — 1 cut: 75,
2: 83, 6: 93, 19: 98 — instead of jumping from 50 to 100 at the first cut. The
measured score is scaled to that ceiling (evidence factor = ceiling / 100), so a
problem always counts, even in a video with few cuts. K2 needs no ceiling: its
average-shot-length part already marks an uncut take. The AI is told the measured
number of cuts and the video type.

**K6 from a walk through the parts.** Before giving its level, the model splits the
video into 3–12 consecutive parts by topic, step or scene and labels each by what
its visuals do: *shown* — the edit puts on screen what is said or what the part is
about, with material chosen for it (b-roll, a cutaway, an insert or close-up of the
thing named, a graphic, an animation, on-screen text, a screen recording of the
step; without speech, shots chosen and ordered to carry the topic, the story or the
music); *covered* — the scene cut together from shots chosen to follow it (angles,
a reaction, the detail of the action as it happens); *recorded* — one recording of
the speaker or the event, trimmed at most; *unrelated* — visuals that do not fit,
distract, or show nothing. Then it gives its overall level on the 1–5 rubric (1:
visuals unrelated, or one recording while many topics are discussed; 5: visuals
consistently and specifically shown), which is K6. Walking through the parts first
anchors the level in what is on screen: run-to-run reliability on the held-out set
rose from ICC 0.75 to 0.86, and footage that only records a scene (an amateur
unboxing) is no longer read as illustrating it (median level 2 instead of 3); an
unedited take stays at level 1. A level computed from the parts (1 + 4 × the share
of the runtime weighted 1, ½, 0 and 0) is reported next to it (`parts_levels`): it
is as reliable, but in EQI it orders the groups no better (see *Video types*); when
the model gives no overall level it is used instead (`level_source`).

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

K6 is the median of `--k6-repeats` independent reviews of the same upload
(default 3; with two runs, their mean): on the Sintel trailer two runs gave level
4 and level 3, on an amateur unboxing 1 and 4 (a 15-point swing in EQI), and a
median of three cannot be moved by one run that reads the video very differently.
The report keeps every run's level, the level computed from every run's parts, and
the parts of the first run (shown in `report.html`). An answer that is not valid
JSON is asked for again once; if it never parses, the raw answers are stored in
`report.json` (`ai_unparsed_responses`). Token use of every call is stored in
`ai.usage`: for the 52 s Sintel trailer one Gemini 3.1 Pro run took 80 k input
and 3–4 k output tokens (thinking included).

### Shot-transition network: TransNetV2

A hard cut that barely changes the picture is checked with TransNetV2 (Souček &
Lokoč 2020, MIT licence), a network trained on annotated shot transitions (see K1).
It runs from an ONNX file with ONNX Runtime on the CPU. The file is made once from
the official TensorFlow weights in a separate environment; TensorFlow and PyTorch
are needed only there:

```bash
C=85cef72af9a916bdfd7cc94a670c9cdfbf12d1ed      # TransNetV2 master, 2021-07-28
mkdir -p third_party/TransNetV2/transnetv2-weights/variables
for f in saved_model.pb variables/variables.data-00000-of-00001 variables/variables.index; do
  curl -L -o third_party/TransNetV2/transnetv2-weights/$f \
    https://media.githubusercontent.com/media/soCzech/TransNetV2/$C/inference/transnetv2-weights/$f
done
for f in inference-pytorch/convert_weights.py inference-pytorch/transnetv2_pytorch.py LICENSE; do
  curl -L -o third_party/TransNetV2/$(basename $f) https://raw.githubusercontent.com/soCzech/TransNetV2/$C/$f
done
# sha256 as in TransNetV2 issue #1: saved_model.pb 8ac2a52c…f554, variables.data-… b8c9dc3e…9367, variables.index 8b99e28b…403f
python -m venv .venv-transnet
.venv-transnet/Scripts/python -m pip install tensorflow==2.15.1 onnx==1.17.0 onnxruntime==1.18.1
.venv-transnet/Scripts/python -m pip install torch==2.3.1 --index-url https://download.pytorch.org/whl/cpu
.venv-transnet/Scripts/python scripts/export_transnetv2.py third_party/TransNetV2
# transnetv2.onnx: 30,549,149 bytes, sha256 09c2dc32bad2e16004fdebe9743d928738e6896da18ea0aea94077c7757c7000
```

The script copies the weights into the official PyTorch port, replaces the bit shifts
of its colour histogram (ONNX has them only for unsigned integers) with the same
integer arithmetic, and checks the ONNX model against the TensorFlow model (largest
difference 1.2e-7). Without the file the check is off: `video.shot_check` in
`report.json` is null and every hit of the cut detector counts, as before 14 October.
`EQI_TRANSNET_MODEL` points to another location of the file.

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
python -m eqi serve                                     # analysis page in the browser (127.0.0.1:8765), analyses in out/app
python -m eqi batch videos/ --out out/batch --strict-model --resume --dover   # all videos + scores.csv (Tier 2 input)
python -m eqi synth --out out/synthetic_clean.mp4       # clean synthetic test video
python -m eqi tier1 source.mp4 --out out/tier1 --figures   # controlled-defect experiment
python -m eqi rescore out/tier1 --out out/tier1_new     # same Tier-1 videos, scored with the current code
python -m eqi rescore out/tier1 --out out/tier1_new --reuse-reports   # only the scoring rules changed: no new analysis
python -m eqi rescore-reports out/batch --out out/batch_new --ai-from out/batch_ai   # saved reports, current scoring; K6 from another run
python -m eqi ai-check out/tier1 out/tier1_b --out out/ai_check --extra out/k6_test   # AI review accuracy (calls Gemini)
python -m eqi tier2 out/batch/scores.csv ratings.csv --out out/tier2
python -m pytest -q tests                               # 94 tests
```

`ratings.csv` (long format): `video, rater, overall[, cuts, pacing, color, audio, framing, narrative]`
with ratings on the ITU-T P.910 five-point ACR scale.

The scripts that re-score the tier sets and Tier 1 from cached features and compute the
statistics under *Proof protocol* (bootstraps, ICC, K6 drift, re-encode stability) are in
`eval/`; see `eval/README.md`.

A file without a picture (audio only, damaged, not a video) stops `analyze` with a
plain message; `batch` notes it in `scores.csv` (`error` column) and goes on with
the next video. Portrait, rotated, variable-frame-rate, odd-sized, silent and
very short videos are analysed (see *Stability*).

`serve` opens a page in the browser where videos are dropped or chosen and analysed
one after the other with the same pipeline as `analyze`, with or without the AI layer.
Each analysis gets a folder in `out/app` with the uploaded video, `job.json` and the
usual `report.json`, `report.html` and figures; the page shows the stage of the running
analysis, then EQI and the measured-only score, and links the report. It uses the
report's stylesheet and listens on 127.0.0.1 only. An analysis that was running when
the server stopped is marked failed rather than started again, so that a restart never
spends AI credit on its own.

### Outputs
* `report.json` — video type, scores, every issue with time, severity, measurement and AI verdict, K6 parts, shot list, timing, and the cut detector's hits the shot-transition network removed (`video.shot_check`)
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
interview compilation — with the harness above, and scored with the code of 8
October (`out/tier1v6_*`) and with the current code (`out/tier1v7_*`, same videos in
`out/tier1v2_*/videos`; the clean reference is re-encoded like the variants, so
its EQI differs slightly from the original file's).

| Source | Clean EQI_signal | Issues on clean | Detected, strongest level | Detected, all levels | Same-kind false alarms | Side effects: new + lost (severity) | Monotonic kinds |
|---|---|---|---|---|---|---|---|
| Synthetic | 100.0 → 97.2 | 0 | 8/8 | 17/23 | 0 | 0 | 7/7 |
| Sintel trailer | 85.6 → 81.1 | 14 | 5/8 | 10/23 | 1 | 1 + 26 (3.91) → 1 + 16 (3.51) | 5/7 |
| Tears of Steel | 90.6 → 89.7 | 10 | 6/8 | 11/23 | 2 | 8 + 0 (0.87) | 7/7 → 6/7 |
| NASA ScienceCast | 82.0 → 83.7 | 6 → 9 | 6/8 | 12/23 | 0 | 0 → 3 + 2 (0.63) | 6/7 → 7/7 |
| NASA interview | 59.4 → 68.9 | 9 | 7/8 | 17/23 | 0 | 0 → 3 + 0 (0.34) | 6/7 |
| **Real videos** | | | **24/32 (75 %)** | **50/92 (54 %)** | **3/80** | **35 in 22/80 (4.78) → 33 in 26/80 (5.35)** | **24/28** |

(8 October → current code where they differ.) The changes of 10 October (see
*Fixes after the market test*) leave detection and false alarms as they were. The
clean scores move with them: the evidence factor caps K1 and K3 of the synthetic
source's 7 cuts at 93.8; the NASA interview's two jump cuts now count one slip
together instead of two (K1 20 → 59, EQI_signal 59.4 → 68.9); the Sintel trailer's
three sound hits count 0.75 of a slip instead of nothing (K4 75 → 49) while its
long shots are judged in stretches (K5 56 → 65); the ScienceCast's long takes are
judged in stretches too, so one soft shot weighs by its screen time (K5 41 → 74,
with 3 more but smaller findings). When a jump cut removes time inside a long take
the grid of stretches moves, which adds 5 small side effects. The new
non-monotonic kind is a jump cut in Tears of Steel whose K1 rises by 0.1 at the
strongest level, where the undetected jump adds one cut to the evidence.

With the per-minute scoring a detected defect now costs what a viewer would
notice: the mean EQI_signal drop at the strongest level over the four real
videos is 17.8 for a flash frame, 10.9 for a 4 s dead air, 3.3 for a jump cut,
4.3 for a colour shift, 1.3 for a +12 dB boost, 2.5 for shake and 1.1 for a crop
(5.9 over all kinds; with the scoring of 8 October 5.6, with that of the first
blind test 1.4, e.g. 1.9 for a flash frame and 3.4 for dead air). Where the clean video already has the
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

*With the rules of 12 October* (video type, see *Video types* below), Tier 1 on the
four real videos gives 23/32 at the strongest level (24/32 before), 47/92 at all
levels (50/92), the same 3/80 same-kind false alarms and 24/28 monotonic kinds; side
effects 13 new + 22 lost in 29 of 80 variants (severity 6.8; before 15 + 18 in 26,
5.4). All differences are in the NASA ScienceCast, 58 % of whose runtime is medical
animation, now measured as designed: the crop landed on an animation shot, which
framing no longer judges; the milder colour shift sat between a camera shot and an
animation shot, and with the animation out of the grade statistics it no longer
passes (the strongest one still does); and with fewer camera shots, K3's and K5's
statistics rest on fewer shots (a borderline colour finding of the clean video
vanishes in six variants). On the synthetic source (40 s) and the Sintel trailer
(52 s) detection is unchanged, but a defect now costs what it costs in a one-minute
video (the minute floor): a 4 s dead air lowers the synthetic EQI_signal by 17.0
instead of 19.2 points. Mean EQI_signal drop at the strongest level over the real
videos: flash frame 19.0, dead air 12.2, shake 3.7, jump cut 2.3, colour shift 1.5,
loudness boost 1.3, crop 0.3.

*13 October.* The two "jump cuts" of the clean NASA interview were the harness's
IDR frames (one a second) redrawing the same picture: at 74 s and 79 s the speaker
does not move and the picture changes by 0.7/255 (mean |Δgray|), while 97 % of its
pixels stay. A jump cut at a detected cut now needs a visible change of the
picture, the floor a jump inside a shot already needed (mean |Δgray| ≥ 2). The
clean interview then has no jump cut (K1 59.2 → 98.7, EQI_signal 68.9 → 78.8, 7
issues instead of 9), and detection, false alarms and side effects of all five
sources are unchanged; so are the scores of all 88 tier-set videos. With the higher
clean score the mean EQI_signal drop at the strongest level rises for the flash
frame (19.0 → 19.5) and the crop (0.3 → 0.4). The same IDR frames still count as
cuts (see *Limitations*).

*14 October.* A hard cut that barely changes the picture (mean |Δgray| < 2 at
64×36) now counts only if the shot-transition network TransNetV2 sees a transition
there (see *Install*). The network was used as published (no training on our
videos) with its own decision threshold of 0.5. Of the 75 such hits in the three
test sets and the five Tier-1 sources, the network saw 2; the rest were keyframe
hits on still pictures — all 7 "cuts" of the uncut eclipse video (probability
0.004–0.007, one every 5.35 s, the encoder's keyframe interval), 28 of the 37 cuts
of the NASA interview, frames of a handheld whip pan — and hits inside fades through
black. The first version also removed those: in the Sintel trailer two shots joined
by a fade through black became one shot, whose colour then mixed black frames into
the lit picture (K3 of the clean trailer 78.7 → 50.0), and the side effects of
Tier 1 rose from 22 lost issues (severity 5.27) to 33 (15.62). The network marks
hard cuts, not fades, and lightness cannot tell a fade from a dark still picture
(the eclipse, L\* 0.6–0.9, is darker than the fades, L\* 0.3–0.7). What does is
black itself: all 13 hits at fades and cuts through black lay 0–0.17 s from a frame
with no picture (99 % of the pixels at most 4/255), every other hit at least 0.37 s,
and only 4 of those 62 within a second. So a hit within 0.25 s of black is not checked. With that rule,
on the cached measurements of the same videos (K6 as before):
* Tier 1 is unchanged: strongest level 31/40, all levels 64/115, 3 same-kind false
  alarms, side effects 13 new (1.52) and 22 lost (5.27). Monotonic kinds 31/35 →
  30/35: with 10 shots instead of 37 the clean NASA interview's K3 statistics move
  more, and the level-2 colour shift raises its K3 by 3.0. Its clean EQI_signal falls
  78.8 → 72.8, because the keyframe hits no longer add K1 and K3 evidence.
* All 88 videos: EQI ρ 0.68 → 0.68 (without broken 0.60 → 0.61; paired bootstrap
  +0.00, 95 % CI −0.00 to +0.01), measured only 0.52 → 0.53 (+0.01, +0.00 to +0.03;
  without broken 0.36 → 0.38, +0.00 to +0.04). Ten videos change: the uncut eclipse
  video 68.2 → 52.4 (no cut, so K1 is the scale's midpoint), an amateur video with a
  keyframe hit every 4 s 64.4 → 56.5, the others by at most 1.3.
* Re-encoding (*Stability*): EQI_signal moves by 1.5 instead of 1.9 (median; mean
  2.7 instead of 2.9, at most 13.2 as before), K3 by 5.7 instead of 6.7 (mean), and
  the video type label stays the same in 30 of 30 copies instead of 28.

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
Gemini 3.1 Pro (`--strict-model`; mean of two runs with the code of 8 October,
median of three with the code of 10 October).

| Set | Professional | Mid | Amateur | Broken | Spearman ρ, group order vs EQI |
|---|---|---|---|---|---|
| First set, before the fixes (22 videos) | 76.1 | 70.2 | 78.4 | 68.4 | −0.06 |
| First set, code of 8 October (22 videos, `out/eval_tiers/results_v6`) | 81.5 | 68.4 | 68.2 | 45.4 | 0.54 (p = 0.01) |
| Market set, code of 8 October, held out for it (33 videos, `out/eval_market/results`) | 81.8 | 74.3 | 66.8 | 61.1 | 0.66 (p < 0.001) |
| **Held-out set, final code of 10 October (33 videos, `out/eval_holdout/results`)** | **80.8** | **77.3** | **74.2** | **60.0** | **0.42 (p = 0.015)** |

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

What still cost well-made videos points after 8 October: loud masters (−8 to −10
LUFS with true peaks above −1 dBTP in an ad, a music video and a short film)
brought K4 down to 15–37 against the streaming ceiling of −14 LUFS; two jump cuts
counted as two slips while three counted as a style, so one more or one less
detection could flip the group (a tour montage on the first set: K1 85 → 42); and
K6 varied by three levels between the two runs on one video (levels 1 and 4 on an
amateur unboxing). These are addressed by the fixes below.

**Fixes after the market test (10 October 2026).** The open points above and new
measurement errors found in the two test sets were closed with general rules
(criteria, weights and the 0–100 scale unchanged; details in *Criteria* and
*Scoring*): jumps a few frames apart are the footage's frame cadence, not jump cuts
(they had given an uncut amateur take 47 and a timelapse travel video 132 "cuts",
so an uncut take looked like a flawlessly cut edit); repeated devices are
discounted smoothly; loudness is judged as the platform plays it; the evidence
ceiling of K1 and K3 rises with every cut instead of jumping from 50 to 100 at the
first one, and scales the measured score rather than capping it (a cap hid every
problem smaller than the gap: a colour shift then cost 0.1 instead of 4.3 EQI
points); long takes are judged in 4 s stretches (a two-minute handheld take had
been one framing decision from three frames); dead air counts per 3 s; K6 is the
median of three runs. Both earlier sets were used to design these rules, so they
are development sets now, and a third set was held out (below).

Each rule switched off on its own, on the cached measurements of both earlier sets
(group medians professional / mid / amateur / broken, Spearman ρ of group order vs
EQI; K6 = median of three runs):

| Rules | First set (22) | ρ | Market set (33) | ρ |
|---|---|---|---|---|
| All rules of 10 October | 80.6 / 67.2 / 72.6 / 45.3 | 0.46 | 80.6 / 77.2 / 69.4 / 59.3 | 0.69 |
| without the frame-cadence rule | 80.6 / 67.2 / 72.6 / 45.3 | 0.46 | 80.8 / 77.2 / 69.4 / 59.3 | 0.69 |
| without the repetition discount | 82.2 / 66.5 / 70.4 / 44.5 | 0.49 | 81.2 / 74.4 / 69.4 / 59.3 | 0.68 |
| without loudness as played | 82.2 / 65.4 / 69.8 / 44.5 | 0.46 | 81.2 / 76.4 / 66.2 / 59.3 | 0.64 |
| without the evidence ceiling | 82.7 / 68.9 / 73.3 / 45.8 | 0.46 | 80.9 / 78.0 / 70.3 / 59.7 | 0.68 |
| without long takes in stretches | 78.0 / 65.7 / 72.4 / 44.5 | 0.45 | 80.5 / 77.9 / 69.4 / 59.7 | 0.69 |
| without dead air by length | 80.6 / 67.2 / 72.6 / 46.8 | 0.44 | 80.6 / 77.2 / 69.4 / 61.3 | 0.68 |
| none (rules of 8 October) | 81.5 / 67.2 / 68.2 / 45.4 | 0.52 | 81.8 / 74.3 / 67.3 / 62.1 | 0.67 |

No single rule changes the ranking much: they remove measurement errors and
discontinuities, and the group order rests mostly on what the AI's K6 sees. On the
market set the rules together lift mid videos (loud masters, two-jump-cut
reviews) and lower broken copies (longer freezes), ρ 0.67 → 0.69; on the first set
the amateur group rises (its three well-edited videos — a recycling documentary,
a stop-motion film, a tour montage — gain from the discount and from loudness as
played), ρ 0.52 → 0.46. The frame-cadence rule hardly moves the medians but
changes single videos both ways: the uncut amateur take loses its 47 phantom cuts
(K1 99 → 75), while in two travel films a lone jump that the phantom repeats had
turned into "style" now counts as a slip (K1 74 → 50 and 100 → 68).

**Held-out set (10 October 2026).** 33 new Commons imports of YouTube videos
under CC BY, grouped by producer before any scoring and analysed once with the
final code (neutral names h01…h33 in shuffled order, the first 120 s, K6 the
median of three runs in one session). Professional: a film trailer, two K-pop
music videos, a cooking video, a lab behind-the-scenes, a parliament explainer, a
wedding film, a game showcase, a whiteboard-animation explainer, a football club
ad. Mid: creators' software and hotel reviews, cooking, travel and sport vlogs, two
unboxings, an independent music video, a tutorial, a travel short film. Amateur:
five personal unboxings, an airport arrival, a lumberjack show, a hang-gliding
flight, a student film, a dance clip. Broken: copies of three narrated professional
videos (lab behind-the-scenes, parliament explainer, game showcase). The rules of
8 October were scored on the same measurements for comparison (K6 there the mean
of the first two runs, as they used it):

| Rules | Professional | Mid | Amateur | Broken | ρ, all groups | ρ, without broken |
|---|---|---|---|---|---|---|
| 10 October (final) | 80.8 | 77.3 | 74.2 | 60.0 | 0.42 (0.13–0.68) | 0.25 (−0.17–0.60) |
| 10 October, K6 mean of the first two runs | 79.8 | 77.3 | 74.2 | 60.0 | 0.38 | 0.19 |
| 8 October | 75.1 | 75.0 | 75.4 | 57.7 | 0.22 | 0.01 |
| 10 October, K1–K5 only (EQI_signal) | 75.9 | 76.2 | 74.0 | 50.0 | 0.27 | 0.02 |

(Medians; 95 % CIs from 4,000 bootstrap resamples of the videos within each group.)
The group order holds on videos that played no part in the design: professional >
mid > amateur > broken by median and by mean (77.3 / 75.8 / 70.8 / 57.8). On the
same measurements the new rules beat those of 8 October, which gave the three clean
groups the same median: ρ +0.20 (95 % CI +0.09 to +0.34) over all groups, +0.23
(+0.09 to +0.41) without the broken copies. Most of the gain comes from the rules
(ρ 0.38 with K6 still the mean of two runs), the rest from the median of three. But
the separation is weaker than on the development sets (market set 0.69 after the
fixes) and too weak to place a single video: a random professional video scores
above a random mid one with probability 0.59, mid above amateur 0.61, professional
above amateur 0.66, and without the broken copies ρ is not significant (p = 0.19).
Every professional video and all mid videos but one score above every broken copy;
amateur videos score above broken copies with probability 0.77, since the AI gives
each broken copy the original's full K6 (level 5): two of the three copies (64.0,
60.0) outscore three amateur videos each. The copies lost 19.7 (game showcase
83.7 → 64.0) and 28.4 points (parliament 77.8 → 49.4), the lab behind-the-scenes
only 5.6 (65.6 → 60.0): its K1–K5 fell by 13 points, but the AI gave the broken copy
story level 5 in all three runs and the clean original level 4 in all three. On
K1–K5 alone the broken copies are clearly lowest (every professional and amateur
video above every broken copy, drops of 13–35 points), while the three clean groups
are not ordered (ρ 0.02): their order comes from K6.

Found after the run (and fixed on 12 October with general rules, see below — which
made this set a development set too):
* Fast-cut music videos use single-frame flashes as a device: two K-pop videos get
  K1 = 0 from 3–4 one-frame shots among 83–119 cuts (flash frames below the style
  share count in full).
* A whiteboard animation reads as overexposed in every shot (about 80 % of the
  pixels at full white; K3 50), and its drawing shots of up to 30 s as long static
  shots.
* Silent, static moments of 2–4 s in the lab behind-the-scenes (typing, a pause in
  speech) count as dead air (K2 18).
* Three amateur unboxings score 83–85, above the median professional video: few
  cuts and few measurable slips. K1–K5 count errors; they do not see the craft
  (shot choice, rhythm, grade, sound design) that makes a professional video better
  than a correct one.

In the first three cases the AI review called the findings intentional, rightly.
With its verdicts applied (`full_with_ai_verdicts`, an opinion in the report, not
EQI) the clean groups separate well — medians 91.0 / 90.0 / 77.4, ρ 0.72 without
the broken copies, mid above amateur 0.97, though professional above mid stays at
0.59 — but the AI excuses the injected defects as well: the broken copies (median
85.1) then score above most amateur videos (amateur above broken 0.20), and the game
showcase copy loses 1.8 points. So the verdicts stay opinions.

**Video types (12 October 2026).** The cases above share one cause: a check applied
where its assumption about the footage does not hold. The rules of *Video type* and
*Scoring* replace the AI's verdicts there with measured decisions — designed
pictures (graphics, animation, screen capture, cards) are not judged by camera
checks, a montage cut to music is not held to colour continuity and its flash cuts
count as rhythm, dead air needs the sound gone, flicker needs the light to change, a
still shot needs the picture a second later to be the same, an animation's change
of scene counts as a cut, and a short video counts as a minute — and K6 gets a
structured prompt. Criteria, weights and the 0–100 scale are unchanged; K3 and K5
count by the share of camera footage they judge. All three tier sets were used to
design these rules, so none of them is held out any more; the numbers below
measure how the rules behave on the videos they were designed on, and a new
held-out set is needed for an independent estimate.

On all 88 videos with K6 kept as it was (the stored runs of 8–10 October), the K1–K5
rules alone (medians professional / mid / amateur / broken; Spearman ρ of group
order vs EQI; 95 % CI of the change from 4,000 bootstrap resamples within the
groups):

| Set | Rules of 10 October | ρ | Rules of 12 October | ρ | Change of ρ |
|---|---|---|---|---|---|
| First set (22) | 80.6 / 67.2 / 72.6 / 45.3 | 0.46 | 81.7 / 72.7 / 71.7 / 46.2 | 0.51 | +0.05 (−0.07 to +0.23) |
| Market set (33) | 80.6 / 77.2 / 69.4 / 59.3 | 0.69 | 82.4 / 78.2 / 72.3 / 59.3 | 0.67 | −0.01 (−0.16 to +0.16) |
| Held-out set (33) | 80.8 / 77.3 / 74.2 / 60.0 | 0.42 | 85.3 / 82.0 / 75.3 / 63.1 | 0.75 | +0.33 (+0.10 to +0.59) |
| All 88 | 80.6 / 75.3 / 71.7 / 58.5 | 0.51 | 84.1 / 77.5 / 74.7 / 57.5 | 0.63 | +0.12 (+0.02 to +0.24) |
| All 88, without broken | | 0.38 | | 0.54 | +0.16 (+0.02 to +0.32) |
| All 88, K1–K5 only (EQI_signal) | 79.6 / 76.5 / 74.0 / 52.0 | 0.41 | 84.2 / 79.7 / 75.5 / 52.0 | 0.52 | +0.11 (−0.01 to +0.25) |

The gain sits where the type-specific errors were (the held-out set: two K-pop
videos, a whiteboard and a parliament animation, two screen-recorded tutorials, a
behind-the-scenes video with screen recordings); on the two other sets the order is
as before. Each rule switched off on its own (all 88 videos, ρ over all groups /
without broken): all rules 0.63 / 0.54; without designed pictures 0.57 / 0.45;
without the montage rule 0.58 / 0.46; without dead air as lost sound 0.58 / 0.46;
without the minute floor 0.61 / 0.51; without scene changes in designed pictures
0.62 / 0.52; without "still = the same a second later" 0.62 / 0.52; without
flicker as light 0.63 / 0.53 (it removes misreadings of movement but does not order
the groups); without the video type at all 0.53 / 0.40.

K6 with the structured prompt was run on 41 of the 88 videos on 12 October (29 of
the held-out set, 12 of the market set) before the API's prepaid credit ran out,
and on the other 47 on 13 October (Gemini 3.1 Pro, three runs each; four videos
have two runs and one has one, where the credit ran out during a video). Run-to-run
reliability of the level, one-way ICC(1,1) over three runs (Shrout & Fleiss 1979),
on the videos with three runs of both prompts:

| K6 | First set (20) | Market (32) | Held-out (31) | All 83 |
|---|---|---|---|---|
| Earlier prompt (8–10 October; first and market set: third run two days later) | 0.75 | 0.61 | 0.82 | 0.75 |
| Structured prompt, the model's overall level (used) | 0.90 | 0.80 | 0.89 | 0.86 |
| Structured prompt, level computed from the parts (reported) | 0.84 | 0.80 | 0.86 | 0.83 |

On the 41 videos of 12 October (11 professional, 15 mid, 13 amateur, 2 broken), as of 10
October EQI ordered the groups with ρ 0.32 (0.22 without broken), with the rules of
12 October and the earlier K6 0.63 (0.57), and with the structured K6 0.67 (0.63;
+0.35, 95 % CI +0.09 to +0.64 against 10 October): medians 84.1 / 83.0 / 71.1 /
59.7, professional above mid 0.64, mid above amateur 0.82, professional above
amateur 0.96, amateur above broken 0.81. The new K6 alone separates the clean
groups better than the earlier one (ρ 0.63 vs 0.58; amateur median level 2 instead
of 3: footage that only records a scene is no longer read as illustrating it), but
its share of the EQI gain is small and not significant (+0.05, −0.07 to +0.19); the
gain comes from the K1–K5 rules. The level computed from the parts orders mid above
amateur better (0.88) but professional above mid worse (0.53), so it is reported,
not used.

*All 88 videos (13 October).* With the structured K6 on every video (26
professional, 26 mid, 28 amateur, 8 broken), EQI orders the groups with ρ 0.68
(0.60 without broken): medians 85.8 / 82.2 / 69.7 / 57.9, professional above mid
0.73, mid above amateur 0.75, professional above amateur 0.90, amateur above broken
0.78. Against the code of 10 October that is +0.17 (95 % CI +0.05 to +0.30; without
broken +0.22, +0.07 to +0.39), against the rules of 12 October with the earlier K6
+0.04 (−0.02 to +0.12; without broken +0.06, −0.03 to +0.16), which is not
significant. By set, with the earlier K6 in brackets: first set 0.49 (0.51), market
set 0.75 (0.67), held-out set 0.75 (0.75). The structured K6 puts amateur videos
well below the rest (median level 2 against 5 for professional and mid; the
earlier prompt 3 against 4) but does not separate professional from mid (both at
the top level; professional above mid 0.57 for K6 alone), and it gives the broken
copies the level of their professional originals (5), which K1–K5 separate. K6
alone orders the clean groups about as well as the earlier prompt (ρ 0.55 vs
0.53). The reviews come from two days (41 videos on 12 October, 47 on 13 October)
and the structured prompt's day-to-day drift is not measured: a repeat of 15
videos of 12 October, planned on 13 October, failed when the credit ran out again.
Reports: `out/<set>/results_v8` (the runs) and `out/<set>/results_v8_final` (K1–K5
with the final code, K6 from the runs).

**Stability (12 October 2026).** *Inputs:* a portrait phone video, a 2560×1440
60 fps video, a variable-frame-rate video without audio, an odd-sized (853×479)
video with 8 kHz mono sound, a 1 s clip, a still picture with sound, an all-black
silent video, WebM/VP9 and AVI/MPEG-4 files are analysed; an audio-only file and a
truncated MP4 stop with a plain message (`No video stream …`), and `batch` goes on
with the next file. Two failures were fixed on the way: a track that is silent from
start to end was never found silent (the silence threshold is relative to the
track's own level, so digital silence now counts as silence too), and an all-black
video was taken for a designed picture. Analysis takes about 1× real time for
1080p30 and 2.5× for 1440p60 on a 16-thread PC. *Re-encoding:* 15 videos of
all types, each re-encoded at 720p CRF 30 and 480p CRF 28 (30 copies), were scored
again: EQI_signal moved by 1.9 points (median; mean 3.1, at most 13.2), with the
rules of 10 October by 0.9 (mean 2.5, at most 8.2); the video type label stayed the
same in 28 of 30. The decision on designed pictures had first flipped with the
encode (a heavy encode breaks up part of a slide's exact fills; up to 30.7 points),
which the rules now prevent: in a video that uses designed pictures, weaker fills
and white grounds are designed too, K3 and K5 count by the share of camera footage,
and a freeze under room tone is no longer dead air. What still moves is older: the
number of jump cuts found (an unboxing with four jump cuts as published, one at
720p — the earlier rules had hidden this by also counting false jump cuts in its
intro graphics, which made all of them a style), K3's video-relative statistics
over few shots, and loudness jumps at the threshold after a new audio encode.
*13 October:* in both copies of the NASA interview the shot detector fired at seven
of the new encoder's keyframes, where the same picture is redrawn (mean |Δgray|
0.6–0.9); two of these "cuts" kept 95–96 % of the pixels and counted as jump cuts
(K1 95.0 → 58). With the visible-change rule (*Tier 1*, 13 October) K1 of the
copies is 96.9 and 97.1; over the 30 copies K1 moves by 5.4 points on average
instead of 7.7 (at most 29.6 instead of 36.9), EQI_signal by 1.9 (median; mean
2.9, at most 13.2, the unboxing). The keyframe hits still split the interview's
shots, which adds K3 evidence (K3 71.1 → 83–84). *14 October:* the shot-transition
network removes these hits (6–7 in each copy of the interview); EQI_signal now moves
by 1.5 (median; mean 2.7, at most 13.2), and the video type label is the same in all
30 copies.

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
* Loudness jumps count less the more often they recur (n jumps count
  n · 2^−(n−1) slips); an amateur mix with a level jump at every clip boundary is
  then judged mainly by its loudness level and range. A trailer's three sound hits
  still count as 0.75 of a slip, which in a 52 s trailer costs K4 about a quarter.
* K4 judges the mix as a streaming platform plays it: a loud master is turned
  down to −14 LUFS (YouTube does this), so neither its level nor its peaks count,
  while a quiet mix is not raised and does count. For broadcast delivery, where a
  loud master fails technical QC, this is too lenient; EQI does not judge
  broadcast compliance.
* The style share is still a threshold: a device on a quarter of the cuts counts
  zero, just below that it is discounted only by its repeats. Below the share the
  discount is smooth, so one detection more or less moves K1 by a few points, not
  by tens (two jump cuts count one slip, three 0.75, four 0.5).
* Devices that look like errors are recognised by the video type, not by the AI:
  flash cuts only in a montage cut to music (music-driven, average shot ≤ 3 s),
  white grounds and other designed pictures only where the picture is measured as
  designed, pauses only by their sound. A device outside these rules still counts as
  an error below the style share — flash cuts in a trailer whose music has no steady
  beat, for instance.
* Designed pictures are not judged by the camera checks, so a defect inside one is
  not measured either: in Tier 1 the crop and the milder colour shift that landed on
  the ScienceCast's medical animation shots are no longer found (23/32 at the
  strongest level instead of 24/32). The decision uses exact colours: a 2D animation
  with shading, or a screen whose background is a photo or a fine pattern, reads as
  camera footage (part of an animated feature's shots, a tutorial's textured
  background); a camera shot with a large flat highlight can read as designed in a
  video that also uses graphics.
* K1–K5 count errors. A plain, correctly made video (an unboxing on a tripod) makes
  few measurable errors; telling professional from correct-but-plain work rests on
  K6, which now credits only what the edit chose to show (see *K6 from parts*).
* The evidence ceiling lowers K1 and K3 of every video with few cuts, also of
  well-made formats without hard cuts (one long interview take): there the score
  says that little of the cutting or grading could be observed, not that it is
  poor. In animation and screen recordings, scene changes without a cut count as
  evidence.
* K3 and K5 count by the share of camera footage they judge: in a video that is
  mostly graphics they rest on few shots, whose video-relative statistics are
  fragile.
* A long take is judged in 4 s stretches on a grid that starts at the shot's first
  frame. Time removed inside a long take (a jump cut) moves the grid, so a finding
  at the reporting margin can move to a neighbouring stretch: in Tier 1 such shifts
  appear as side effects of severity ≈ 0.1–0.3.
* K6 drifts with the preview model: a third run two days after the first two
  (same model name, same prompt, same inputs) gave professional and mid videos
  0.8 levels more on average (level 5 where the earlier runs gave 4) and amateur
  videos the same. The median of three runs keeps such a run from moving K6, but
  K6 levels from different days are not interchangeable; a test set should be
  reviewed in one session. Whether the structured prompt (12 October) drifts less
  has not been measured: its reviews of the tier sets come from two days (41
  videos on 12 October, 47 on 13 October), and a repeat of 15 videos on the second
  day failed when the API credit ran out.
* A title or end card is recognised by a cut near where the sound starts or stops;
  a silent end card that appears without a cut counts as dead air, like a last shot
  that freezes and runs silent to the end. Dead air needs the sound gone (no
  signal); a freeze frame under room tone is not dead air (none occurred in the
  three test sets; the two room-tone freezes found were still screens).
* Re-encoding moves some measurements (see *Stability*): shot detection and the
  jump-cut test find a different number of jump cuts in some videos, video-relative
  statistics over few shots shift with one shot more or less, and a loudness jump at
  the threshold can appear or vanish with the audio codec.
* The shot detector also fires where an encoder's keyframe redraws a still picture.
  Since 14 October such a hit counts only if TransNetV2 sees a transition there
  (*Tier 1*, 14 October), but not within 0.25 s of black, where the network cannot
  judge a fade: a keyframe hit right beside black still counts as a cut. A fade
  through black is marked only where the cut detector happens to fire inside it (the
  twin comparison does not see fades: their frame differences are too small), and
  the network is a published model, not validated on our footage beyond these sets.
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
Shrout & Fleiss 1979 · Souček & Lokoč 2020 (TransNetV2) · Viola & Jones 2001 · Wu et al. 2024 (Q-Align) ·
Zhang, Kankanhalli & Smoliar 1993 (twin comparison)
