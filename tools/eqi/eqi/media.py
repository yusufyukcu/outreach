"""ffmpeg helpers. The ffmpeg binary ships with imageio-ffmpeg, so nothing has
to be installed system-wide."""

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def run_ffmpeg(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if check and proc.returncode != 0:
        tail = "\n".join(proc.stderr.strip().splitlines()[-6:])
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}):\n{tail}")
    return proc


@dataclass
class VideoInfo:
    path: Path
    fps: float
    n_frames: int
    width: int
    height: int
    duration: float
    has_audio: bool


_FFMPEG_FPS = re.compile(r"Video:.*?(\d+(?:\.\d+)?) fps")
_FFMPEG_TBR = re.compile(r"Video:.*?(\d+(?:\.\d+)?)k? tbr")


def probe(path: Path) -> VideoInfo:
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"No such video file: {path}")
    # Ask ffmpeg first: OpenCV can spin on a file without a picture (audio only)
    header = run_ffmpeg(["-i", str(path)], check=False).stderr
    if "Video:" not in header:
        raise ValueError(f"No video stream in {path.name} (audio only, damaged, or not a video file)")
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        cap.release()
        raise ValueError(f"Cannot open video: {path} (damaged or unsupported file)")
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    readable = cap.read()[0]
    cap.release()
    if not readable or width <= 0 or height <= 0:
        raise ValueError(f"No picture could be decoded from {path.name} (damaged or unsupported file)")
    has_audio = "Audio:" in header
    if not 1.0 <= fps <= 240.0:
        # Some WebM files report their time base (e.g. 1000) as the frame rate;
        # ffmpeg's stream line has the real one
        found = _FFMPEG_FPS.search(header) or _FFMPEG_TBR.search(header)
        fps = float(found.group(1)) if found else 30.0
    return VideoInfo(path, fps, n_frames, width, height, n_frames / fps, has_audio)


def extract_audio(path: Path, wav_path: Path, sample_rate: int = 48000) -> bool:
    """Stereo PCM wav for loudness and beat analysis. False when the video has no audio."""
    proc = run_ffmpeg(
        ["-y", "-i", str(path), "-vn", "-ac", "2", "-ar", str(sample_rate), "-c:a", "pcm_s16le", str(wav_path)],
        check=False,
    )
    return proc.returncode == 0 and wav_path.exists() and wav_path.stat().st_size > 44


def grab_frame(path: Path, frame_index: int, width: int = 640) -> np.ndarray | None:
    """Frame by index (BGR), counted the same way as the analysis pass. Seeking
    by timestamp with ffmpeg lands one frame later, which would put the wrong
    frame into a proof figure."""
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, frame_index))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return None
    h, w = frame.shape[:2]
    return cv2.resize(frame, (width, round(h * width / w)), interpolation=cv2.INTER_AREA)
