"""Criteria, weights and thresholds — the single source of truth for the
article's Criteria table. Thresholds are initial values; they are calibrated
on the controlled-defect experiment (Tier 1) and must be reported with it.
"""

# ── Edit Quality Index (EQI) weights, sum = 1 ────────────────────────────────
# K1–K5 are measured from the signal; K6 is judged by the multimodal model.
WEIGHTS = {
    "cuts": 0.20,       # K1 Cut & transition smoothness
    "pacing": 0.20,     # K2 Pacing & temporal rhythm
    "color": 0.16,      # K3 Color & lighting consistency
    "audio": 0.12,      # K4 Audio-visual balance
    "framing": 0.12,    # K5 Framing & composition
    "narrative": 0.20,  # K6 Narrative–visual coherence
}

LABELS = {
    "cuts": "K1 Cut & transition smoothness",
    "pacing": "K2 Pacing & temporal rhythm",
    "color": "K3 Color & lighting consistency",
    "audio": "K4 Audio-visual balance",
    "framing": "K5 Framing & composition",
    "narrative": "K6 Narrative–visual coherence",
}

SHORT_LABELS = {
    "cuts": "K1 Cuts", "pacing": "K2 Pacing", "color": "K3 Color",
    "audio": "K4 Audio", "framing": "K5 Framing", "narrative": "K6 Narrative",
}

SIGNAL_CRITERIA = ["cuts", "pacing", "color", "audio", "framing"]

# ── Analysis resolution ──────────────────────────────────────────────────────
SMALL_SIZE = (160, 90)   # per-frame statistics (w, h)
KEYFRAME_WIDTH = 480     # face, saliency and sharpness analysis
# Each shot is judged from several frames (positions within the shot), so that
# compression noise or one blink cannot flip its face, framing or sharpness finding.
KEYFRAME_POSITIONS = (0.25, 0.5, 0.75)
# A long take is also sampled once per LONG_TAKE_SAMPLE_S (its framing, focus and
# steadiness change as the camera moves), from LONG_TAKE_MIN_S on.
LONG_TAKE_MIN_S = 8.0
LONG_TAKE_SAMPLE_S = 1.0

# ── Video-relative thresholds ────────────────────────────────────────────────
# K3 and K5 compare a shot with the video's own statistics. Each shot weighs its
# length up to the median shot length, and the median is averaged over a band, so a
# short fragment or a change to one shot moves them only a little while a long shot
# still counts as one shot (it cannot hide its own mismatch). A finding's severity grows
# from 0 at the threshold to full at COLOR_JUMP_FULL_AT / SOFT_FULL_AT, and a finding
# within the first REPORT_MIN_SCALE of that ramp is not reported: there the two sides
# of the threshold are within the jitter of re-encoding and shot detection.
REPORT_MIN_SCALE = 0.10
# A criterion the video gives no chance to observe (no cut for K1, one shot for K3's
# shot-to-shot match) scores at most the scale's midpoint, not full marks: no cut is no
# evidence of smooth cutting. Each observed opportunity (a cut, a transition between lit
# shots) is evidence, and the ceiling rises from the midpoint toward 100 as they add up,
# EVIDENCE_PRIOR of them taking it halfway (1 cut: 75, 2: 83, 6: 93, 19: 98) instead of
# jumping from 50 to 100 at the first cut. The measured score is scaled to that ceiling,
# so every problem still counts. (K2 needs no ceiling: its average-shot-length part
# already marks an uncut take.)
NO_EVIDENCE_SCORE = 50.0
EVIDENCE_PRIOR = 1.0

# ── Errors per minute of viewing (K1, K2, K4) ────────────────────────────────
# Cut errors, dead air and loudness jumps are events: the viewer meets each at a
# moment, however many good cuts surround it, and one glaring error is enough to make
# an edit look careless. Each criterion counts its events as severity-weighted errors
# per minute of viewing, all at one rate: error term = 1 − (Σ severity / minutes) / this,
# i.e. one full-severity error per minute empties it. (K3 and K5 judge properties of
# shots — grade, exposure, framing — as a share of the shots.)
ERRORS_FULL_PER_MIN = 1.0

# ── K1 Cut & transition smoothness ───────────────────────────────────────────
SCENE_MIN_LEN = 1                 # frames; low so that flash frames survive detection
# Gradual transitions (dissolve, fade, wipe), twin comparison at 64×36:
GRADUAL_LOW_K = 3.0               # a frame "changes" above this many times the video's median frame difference…
GRADUAL_LOW_MIN = 2.0             # …and never below this (mean |Δgray|, 0–255)
GRADUAL_MIN_FRAMES = 3            # a run of such frames this long…
GRADUAL_MAX_FRAMES = 45           # …but not longer (sustained motion)
GRADUAL_HIGH = 12.0               # whose two ends differ this much…
GRADUAL_MAX_HIST_CORR = 0.6       # …and look like different shots (HSV histogram correlation at most this)
GRADUAL_LONG_HIGH = 40.0          # a longer run counts only when its ends are clearly unrelated pictures
GRADUAL_LONG_MAX_HIST_CORR = 0.3
# A video in which no cut was found, but whose colour make-up changes completely several
# times, is cut with dissolves that moving footage hides from the twin comparison:
SLOW_DISSOLVE_SPAN_S = 1.0        # frames this far apart are compared…
SLOW_DISSOLVE_MAX_CORR = 0.6      # …and an HSV-histogram correlation at most this means two scenes
SLOW_DISSOLVE_EDGE_S = 2.0        # changes in the first and last seconds (fades, the camera starting) do not count
SLOW_DISSOLVE_MIN = 2             # this many changes make the video an edit
FLASH_MAX_FRAMES = 2              # a shot this short is a flash frame…
FLASH_OUTSIDE_MIN = 0.25          # …when this share of its pixels leaves the range of the frames either side
                                  # by more than STABLE_TAU (a frame between them is a step of a lighting
                                  # change or a one-frame dissolve; injected white frames: 1.0, a lamp switching on: 0.0)
FLASH_SAME_SHOT_DIFF = 12.0       # pictures either side of a flash this close (mean |Δgray|) = one shot interrupted
FLASH_EDGE_DIFF = 20.0            # a frame difference this large where a flash ends (64×36 gray)
# Jump cut = a cut that keeps the background: most pixels stay unchanged across it
# (a new camera angle or scene changes nearly every pixel).
STABLE_SIZE = (320, 180)          # resolution for the unchanged-pixel ratio (keeps background texture)
STABLE_TAU = 12                   # |Δgray| below this counts as unchanged (compression noise is ~1–4)
DARK_LEVEL = 24                   # pixels this dark in both frames say nothing about a kept background
STABLE_MIN_VALID = 0.20           # below this share of usable pixels the ratio is undefined (dark scenes)
JUMP_CUT_STABLE = (0.50, 0.98)    # unchanged-pixel ratio of a jump cut at a detected cut
HIDDEN_JUMP_Z = 8.0               # robust z-score of a frame-difference spike inside a shot
HIDDEN_JUMP_MIN_DIFF = 2.0        # and its absolute size (mean |Δgray|, 0–255; small when only a speaker on a plain backdrop moves)
HIDDEN_JUMP_MIN_STABLE = 0.50     # background kept → a jump cut the shot detector missed
HIDDEN_JUMP_ISOLATION = 3.0       # spike this many times its neighbours (a cut, not sustained motion)
FROZEN_DIFF = 0.05                # frames that change less than this are frozen (duplicates): they carry no
                                  # motion, so they are left out of a shot's spike statistics
JUMP_MIN_PIECE_S = 0.5            # jumps inside a shot closer than this to the next one are the footage's
                                  # frame cadence (repeated frames, timelapse, stop motion): no jump in
                                  # such a shot is taken for a jump cut
FREEZE_BEFORE_S = 0.25            # a jump right after this long a freeze is the freeze ending, not a jump cut
MOTION_JUMP_PX = 4.0              # in a moving shot: a sudden change of the camera translation this large (px at SMALL_SIZE)…
MOTION_JUMP_MIN_CONF = 0.3        # …measured this reliably also means "same view, piece removed"
MOTION_JUMP_Z = 5.0               # (its frame-difference spike needs a lower robust z than a static shot's)
MOTION_MIN = 1.0                  # px/frame at SMALL_SIZE to count a shot as moving
MOTION_CLASH_COS = -0.5           # opposite camera motion on both sides of a cut
# A change of light moves pixel values one way (|mean Δ| ≈ mean |Δ|): a muzzle flash
# 0.93, a lamp switching on 0.93–1.0; a jump cut displaces the picture both ways
# (0.0–0.5 in the Tier-1 and real jump cuts). Such a change is not a jump cut.
LIGHTING_ONE_WAY = 0.85
# A cut device on CUT_STYLE_SHARE of the cuts (at least CUT_STYLE_MIN times) is how the
# video is cut (a vlog cut with jump cuts, a music video's strobe): reported as style
# without lowering K1. Below that share, jump cuts and opposing camera motion used again
# and again count less with every repeat (criteria.repetition_factor: n uses count
# n · 2^−(n−1) slips), while flash frames stay slips, since a lone flash or black frame
# is the classic leftover frame. Loudness jumps are discounted the same way.
CUT_STYLE_MIN = 2
CUT_STYLE_SHARE = 0.25
SEVERITY = {
    "flash_frame": 1.0,
    "jump_cut": 0.6,
    "motion_clash": 0.4,
    "dead_air": 1.0,
    "long_static_shot": 0.3,
    "color_jump": 1.0,
    "flicker": 0.5,
    "overexposed": 0.5,
    "underexposed": 0.3,
    "loudness_level": 1.0,        # scaled by how far off target
    "true_peak": 0.5,
    "loudness_jump": 0.6,
    "loudness_range": 0.3,
    "subject_cut_off": 0.6,
    "headroom": 0.3,
    "placement": 0.2,
    "soft_focus": 0.5,
    "shaky": 0.5,                 # scaled by jitter size
}

# ── K2 Pacing & temporal rhythm ──────────────────────────────────────────────
SILENCE_BELOW_REF_DB = 30.0       # silence = RMS this far below the 90th percentile
DEAD_AIR_MIN_S = 1.5              # silent and visually static for at least this long
DEAD_AIR_MAX_ERRORS = 10.0        # dead air counts one full error per 2 × DEAD_AIR_MIN_S (no practical cap)
LEAD_IN_OUT_S = 2.0               # silent black lead-in / tail of an export is not dead air
CARD_EDGE_S = 0.5                 # a silence this close to the video's start or end opens or closes it; a cut
                                  # this close to where the sound starts / stops marks a title or end card
STATIC_DIFF = 1.5                 # mean |Δgray| below this = visually static
LONG_STATIC_SHOT_S = 20.0
ASL_GOOD_RANGE = (1.0, 8.0)       # average shot length (s) without penalty; calibrate per genre
MUSIC_PULSE_CLARITY = 0.30        # onset autocorrelation peak above this → music-driven
BEAT_TOLERANCE_S = 0.08           # cut counts as on-beat within ±80 ms
PACING_SUBWEIGHTS = {"dead_air": 0.5, "asl": 0.25, "beat": 0.25}

# ── K3 Color & lighting consistency ──────────────────────────────────────────
COLOR_JUMP_MIN_DE = 4.0           # CIEDE2000 of a shot vs the video's dominant grade (> ~2 is visible at a glance)
COLOR_JUMP_MAD_K = 3.0            # …and an outlier against this video's own shot-to-shot variation
COLOR_JUMP_FULL_AT = 2.0          # full severity at this multiple of the threshold
BLACK_SHOT_L = 5.0                # mean L* below this: a dip to black, which has no grade
TINT_JUMP_AB = 10.0               # a shot's tint (a*b* mean) this far from both neighbours…
TINT_NEIGHBOUR_AB = 6.0           # …while the neighbours agree within this = a mismatched shot inside a scene
TINT_MIN_L = 15.0                 # tint is meaningless in near-black shots
FLICKER_STD_L = 1.5               # detrended frame-to-frame L* oscillation inside a shot
OVEREXPOSED_FRAC = 0.08           # share of pixels ≥ 250
UNDEREXPOSED_FRAC = 0.25          # share of pixels ≤ 5…
EXPOSED_FACE_LUMA = 60.0          # …unless the detected face is this bright (mean gray): a dark backdrop, not underexposure
BLACK_FRAME_FRAC = 0.95           # an almost entirely black shot is a dip to black, not an exposure error
COLOR_PENALTY_SCALE = 3.0

# ── K4 Audio-visual balance (ITU-R BS.1770 / EBU R128) ───────────────────────
# Accepted delivery levels: broadcast −23 LUFS (EBU R128) / −24 LKFS (ATSC A/85) up to
# the −14 LUFS of streaming platforms. A mix at any of these standards is not an error.
LOUDNESS_TARGET_RANGE_LUFS = (-24.0, -14.0)
# Streaming platforms (YouTube) turn a louder mix down to about this level and leave a
# quieter one as it is: a loud master reaches the viewer at this level, a quiet one
# stays quiet. The true peak is judged after that gain.
PLATFORM_LOUDNESS_LUFS = -14.0
LOUDNESS_TOLERANCE_LU = 2.0
LOUDNESS_FULL_PENALTY_LU = 8.0    # this far beyond tolerance → full severity
TRUE_PEAK_MAX_DBTP = -1.0
LOUDNESS_JUMP_LU = 10.0           # rise of the momentary loudness over the level just before
LOUDNESS_JUMP_WINDOW_S = 0.5      # momentary loudness integrates 400 ms: a step shows in full after 400 ms + one 100 ms hop
# "The level just before" is the short-term (3 s) loudness, so that a word after a
# short pause is not a jump but a loud burst after a quieter passage is. In the first
# seconds, before a 3 s window exists, the momentary level stands in.
LOUDNESS_CONTEXT_MIN_LUFS = -70.0
LOUDNESS_JUMP_FLOOR_LUFS = -35.0  # ignore rises that start from silence
LRA_MAX_LU = 15.0
AUDIO_GLOBAL_WEIGHT = 0.5
AUDIO_JUMP_WEIGHT = 0.5

# ── K5 Framing & composition ─────────────────────────────────────────────────
KEYFRAME_MIN_SHOT_S = 0.3         # shorter shots (flash frames) are K1's business only
FRAMING_UNIT_S = 4.0              # a long take is judged in stretches of about a typical shot's length
EDGE_MARGIN = 0.01                # subject box this close to a frame edge = cut off
HEADROOM_MAX_CENTER_Y = 0.62      # face centre lower than this = too much headroom
PLACEMENT_TOLERANCE = 0.10        # distance to centre or a thirds line that is still fine
SHARPNESS_REL = 0.35              # soft = sharpness below this share of the video's own median (shallow
                                  # depth of field or smooth animation is a style, not a defect)
SOFT_FULL_AT = 0.5                # full severity at this share of the soft threshold
DARK_FRAME_FRAC = 0.40            # sharpness is meaningless in a mostly black frame
SHAKE_JITTER_PX = 1.0             # detrended global motion RMS at SMALL_SIZE
MOTION_MIN_CONF = 0.20            # phase-correlation response below this = motion estimate not trusted
SHAKE_MIN_RELIABLE = 0.60         # judge shake only when this share of a shot's frames is trusted
FRAMING_PENALTY_SCALE = 3.0

# ── K6 Narrative–visual coherence (AI) ───────────────────────────────────────
# The most capable model available (October 2026). A pinned name, not an alias such
# as gemini-pro-latest, so that the experiments can be repeated with the same model.
GEMINI_MODEL_DEFAULT = "gemini-3.1-pro-preview"
GEMINI_FALLBACK_MODEL = "gemini-3.8-flash"   # used only after retries fail; the report records the model used
AI_RETRY_DELAYS_S = (5, 15, 30)              # back-off for 503 (overloaded) and 429 (rate limit)
# K6 varies between runs on the same video (Sintel: 4, then 3; an amateur unboxing: 1,
# then 4), so it is the median of three independent reviews: one run that reads the
# video very differently cannot move it. The report keeps every run's level.
AI_K6_REPEATS = 3
AI_PARSE_ATTEMPTS = 2                        # an answer that is not valid JSON is asked for again
AI_OVERVIEW_MAX_FRAMES = 400      # overview fps = min(1, this / duration); ≈ 112k tokens at high resolution
AI_ZOOM_CLIPS = 8                 # close-up clips around short or high-frequency issues
AI_ZOOM_HALF_S = 1.0
AI_ZOOM_MAX_S = 3.0               # longer issues get a clip of this length around their middle
AI_ZOOM_FPS = 24.0                # the API maximum: every frame of 24 fps footage, so a 1–2 frame flash is seen
AI_CLIP_RESOLUTION = "MEDIA_RESOLUTION_LOW"   # 70 tokens/frame: clips need timing; jitter clips keep full detail
AI_MAX_REVIEW_ISSUES = 25
AI_MEDIA_RESOLUTION = "MEDIA_RESOLUTION_HIGH"   # 280 tokens/frame; the default (70) hides focus, jitter and edge details
AI_THINKING_LEVEL = "HIGH"
AI_MIN_EXCUSE_CONFIDENCE = 4      # an issue is discounted only when the model is this sure (1–5) it is not an error
# How a verified issue would count after the AI review
VERDICT_FACTOR = {"error": 1.0, "intentional": 0.0, "false_positive": 0.0}
# Off: the AI's verdicts on measured issues are reported but do not change K1–K5.
# Validation (Oct 2026, defects injected into four real videos): every model and
# prompt tested excused most real defects as "intentional" (Gemini 3.1 Pro kept
# 3 of 19 as errors, mostly at confidence 5), while K6 separated matching from
# swapped narration. Keep this off unless a new model passes the same test.
AI_VERDICTS_IN_SCORE = False
