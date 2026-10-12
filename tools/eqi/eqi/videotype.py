"""Video type, measured from the signal: what kind of picture each shot shows and how
the video is cut. Each check of K1–K5 rests on an assumption about the footage — a
camera recorded it, consecutive shots continue one scene, a pause is part of the
programme — and the video type tells where that assumption holds, so that a check is
applied only there:

* Designed pictures (graphics, animation, screen capture, slides, title cards) have
  their whites, framing, focus, steadiness and colours set by design. The camera
  checks — exposure, framing, focus, shake, flicker, grade match, a kept background as
  a jump cut — are not applied to them; a video made only of them is not judged on
  K3 and K5 at all, as a video without sound is not judged on K4.
* A montage cut to music at a quick pace (a music video, an ad, a highlight reel) cuts
  between setups and moments by design: its shots are not expected to continue one
  colour grade, and a one- or two-frame shot is part of its rhythm, not a leftover.

The type is decided by deterministic rules on measured features, so K1–K5 stay
independent of the AI; the label is reported, and given to the AI as context."""

from dataclasses import dataclass, field

import numpy as np

from . import config
from .audio import AudioFeatures
from .features import Keyframe, VisualFeatures


def strongly_designed(k: Keyframe) -> bool:
    """Flat colour fills, or text and lines on a black ground: never camera footage. A
    picture that is almost entirely black is a dip to black, not a designed one."""
    if k.fill_mid >= config.DESIGNED_FILL_MID:
        return True
    return (config.DESIGNED_BLACK <= k.fill_black < config.BLACK_FRAME_FRAC and k.black_rolloff is not None
            and k.black_rolloff <= config.DESIGNED_BLACK_ROLLOFF)


@dataclass
class VideoType:
    label: str
    designed_share: float           # share of the runtime in designed pictures
    music_montage: bool             # cut to music at a quick pace
    music_driven: bool
    average_shot_s: float
    cuts_per_min: float
    face_share: float               # share of the camera shots that show a face
    white_background: bool          # most shots are on a white ground
    strong_share: float             # share of the runtime in shots with flat fills or text on black
    designed_shots: frozenset = field(default_factory=frozenset)   # indices into VisualFeatures.shots

    @property
    def designed_context(self) -> bool:
        """The video uses designed pictures: most of its shots are on a white ground, or a
        good share of its runtime clearly shows flat fills or cards."""
        return self.white_background or self.strong_share >= config.DESIGNED_VIDEO_SHARE

    def is_designed(self, k: Keyframe | None) -> bool:
        """A keyframe (a shot's or a long-take stretch's) shows a designed picture: flat
        fills or text on black; or, in a video that uses designed pictures, a white ground
        or fills that compression has partly broken up. A blown sky on its own is not
        designed (camera footage clips too), and in camera-only footage weak fills (a hazy
        sky flattened by compression) are not either; a heavier encode that breaks up a
        slide's fills does not turn it into camera footage."""
        if k is None:
            return False
        if strongly_designed(k):
            return True
        return self.designed_context and (k.fill_white >= config.DESIGNED_BACKGROUND
                                          or k.fill_mid >= config.DESIGNED_FILL_MID_IN_CONTEXT)

    def shot_designed(self, index: int) -> bool:
        return index in self.designed_shots

    def to_dict(self) -> dict:
        d = {k: getattr(self, k) for k in ("label", "designed_share", "music_montage", "music_driven",
                                             "average_shot_s", "cuts_per_min", "face_share")}
        d["designed_shots"] = len(self.designed_shots)
        return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d.items()}


def classify(f: VisualFeatures, a: AudioFeatures) -> VideoType:
    from .criteria import _continuous_spans, shot_weights, weighted_quantile   # criteria imports this module
    fps, duration = f.info.fps, max(f.info.duration, 1e-6)
    by_shot = {k.shot: k for k in f.keyframes}
    keys = [by_shot.get(s.index) for s in f.shots]
    frames = max(1, sum(s.length for s in f.shots))

    strong_share = sum(s.length for s, k in zip(f.shots, keys) if k is not None and strongly_designed(k)) / frames
    whites = [(k.fill_white, s.length) for s, k in zip(f.shots, keys) if k is not None]
    white_background = False
    if whites:
        values, lengths = zip(*whites)
        white_background = weighted_quantile(values, shot_weights(lengths)) >= config.DESIGNED_BACKGROUND

    spans = _continuous_spans(f)
    average_shot = float(np.mean([(b - a0) / fps for a0, b in spans]))
    vt = VideoType(label="", designed_share=0.0,
                   music_montage=bool(a.music_driven and average_shot <= config.MONTAGE_AVERAGE_SHOT_S),
                   music_driven=a.music_driven, average_shot_s=average_shot,
                   cuts_per_min=(len(spans) - 1) / (duration / 60.0), face_share=0.0,
                   white_background=bool(white_background), strong_share=float(strong_share))
    vt.designed_shots = frozenset(s.index for s, k in zip(f.shots, keys) if vt.is_designed(k))
    vt.designed_share = sum(s.length for s in f.shots if s.index in vt.designed_shots) / frames
    camera = [k for s, k in zip(f.shots, keys) if k is not None and s.index not in vt.designed_shots]
    vt.face_share = float(np.mean([k.subject_source == "face" for k in camera])) if camera else 0.0

    if vt.designed_share >= config.TYPE_DESIGNED_SHARE:
        vt.label = "graphics, animation or screen capture"
    elif len(spans) <= 1:
        vt.label = "single take"
    elif vt.music_montage:
        vt.label = "montage cut to music"
    elif vt.designed_share >= config.TYPE_MIXED_SHARE:
        vt.label = "live action with graphics or screen capture"
    elif vt.face_share >= config.TYPE_PRESENTER_FACES and not a.music_driven:
        vt.label = "presenter or interview"
    else:
        vt.label = "live-action edit"
    return vt
