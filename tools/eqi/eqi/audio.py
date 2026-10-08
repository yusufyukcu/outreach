"""Audio features: EBU R128 / ITU-R BS.1770 loudness (ffmpeg ebur128), silence
runs, beats and pulse clarity (librosa)."""

import re
from dataclasses import dataclass, field
from pathlib import Path

import librosa
import numpy as np

from . import config
from .media import extract_audio, run_ffmpeg

_MOMENTARY = re.compile(r"t:\s*([\d.]+)\s+TARGET:\S+\s+LUFS\s+M:\s*(\S+)\s+S:\s*(\S+)")
_SUMMARY_I = re.compile(r"I:\s*(-?[\d.]+|-inf)\s*LUFS")
_SUMMARY_LRA = re.compile(r"LRA:\s*(-?[\d.]+)\s*LU\b")
_SUMMARY_PEAK = re.compile(r"Peak:\s*(-?[\d.]+|-inf)\s*dBFS")


def _num(s: str) -> float:
    try:
        return float(s)
    except ValueError:
        return float("-inf")


@dataclass
class Loudness:
    integrated: float          # LUFS
    lra: float                 # LU
    true_peak: float           # dBTP
    times: np.ndarray          # momentary loudness timestamps (s)
    momentary: np.ndarray      # LUFS, 400 ms window every 100 ms
    short_term: np.ndarray = field(default_factory=lambda: np.array([]))  # LUFS, 3 s window, same timestamps


def parse_ebur128(stderr: str) -> Loudness:
    times, values, short = [], [], []
    for m in _MOMENTARY.finditer(stderr):
        times.append(float(m.group(1)))
        values.append(_num(m.group(2)))
        short.append(_num(m.group(3)))
    summary = stderr[stderr.rfind("Summary:"):] if "Summary:" in stderr else ""
    i = _SUMMARY_I.search(summary)
    lra = _SUMMARY_LRA.search(summary)
    peak = _SUMMARY_PEAK.search(summary)
    return Loudness(
        integrated=_num(i.group(1)) if i else float("nan"),
        lra=float(lra.group(1)) if lra else float("nan"),
        true_peak=_num(peak.group(1)) if peak else float("nan"),
        times=np.array(times),
        momentary=np.array(values),
        short_term=np.array(short),
    )


@dataclass
class AudioFeatures:
    has_audio: bool
    loudness: Loudness | None = None
    rms_times: np.ndarray = field(default_factory=lambda: np.array([]))
    rms_db: np.ndarray = field(default_factory=lambda: np.array([]))
    silence_runs: list[tuple[float, float]] = field(default_factory=list)
    tempo: float = 0.0
    beats: np.ndarray = field(default_factory=lambda: np.array([]))
    pulse_clarity: float = 0.0

    @property
    def music_driven(self) -> bool:
        return self.has_audio and self.pulse_clarity >= config.MUSIC_PULSE_CLARITY


def _runs(mask: np.ndarray, times: np.ndarray, min_len: float) -> list[tuple[float, float]]:
    runs, start = [], None
    for t, on in zip(times, mask):
        if on and start is None:
            start = t
        elif not on and start is not None:
            if t - start >= min_len:
                runs.append((float(start), float(t)))
            start = None
    if start is not None and times.size and times[-1] - start >= min_len:
        runs.append((float(start), float(times[-1])))
    return runs


def pulse_clarity(onset_env: np.ndarray, sr: int, hop: int) -> float:
    """Peak of the normalized onset autocorrelation in the 60–180 BPM lag range."""
    env = onset_env - onset_env.mean()
    if not np.any(env):
        return 0.0
    ac = librosa.autocorrelate(env)
    ac = ac / ac[0]
    lo = int(round(60 / 180 * sr / hop))
    hi = int(round(60 / 60 * sr / hop))
    return float(max(0.0, ac[lo:hi + 1].max())) if hi < ac.size else 0.0


def analyze(video: Path, workdir: Path) -> AudioFeatures:
    wav = workdir / "audio.wav"
    if not extract_audio(video, wav):
        return AudioFeatures(has_audio=False)

    loud = parse_ebur128(run_ffmpeg(["-nostats", "-i", str(wav), "-af", "ebur128=peak=true", "-f", "null", "-"], check=False).stderr)

    sr, hop = 22050, 512
    y, _ = librosa.load(str(wav), sr=sr, mono=True)
    # Short frames (~46 ms) and hop (~12 ms) so silence boundaries are not smeared
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0]
    rms_db = 20 * np.log10(rms + 1e-10)
    rms_times = librosa.frames_to_time(np.arange(rms.size), sr=sr, hop_length=256)
    ref = np.percentile(rms_db, 90)
    silent = rms_db < ref - config.SILENCE_BELOW_REF_DB

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop)

    return AudioFeatures(
        has_audio=True,
        loudness=loud,
        rms_times=rms_times,
        rms_db=rms_db,
        silence_runs=_runs(silent, rms_times, config.DEAD_AIR_MIN_S),
        tempo=float(np.atleast_1d(tempo)[0]),
        beats=librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop),
        pulse_clarity=pulse_clarity(onset_env, sr, hop),
    )
