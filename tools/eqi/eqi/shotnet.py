"""Shot-transition network: TransNetV2 (Souček & Lokoč 2020, MIT licence), a network
trained on annotated shot transitions, checks the hard cuts the cut detector reports
where the picture barely changes (see features.detect_shots). Its official TensorFlow
weights are converted to ONNX (README, *Install*) and run with ONNX Runtime on the CPU.
Without the model file the check is off and the report says so."""

import os
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL = Path(__file__).resolve().parent.parent / "third_party" / "TransNetV2" / "transnetv2.onnx"
SIZE = (48, 27)                      # input frames, width × height, RGB
WINDOW, STEP, MARGIN = 100, 50, 25   # the tiling of the official predict_frames
BATCH = 8                            # windows per run (memory)


@lru_cache(maxsize=1)
def _session():
    path = Path(os.environ.get("EQI_TRANSNET_MODEL") or MODEL)
    if not path.is_file():
        return None
    import onnxruntime as ort
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def available() -> bool:
    return _session() is not None


def transition_probability(frames: np.ndarray, at: list[int]) -> dict[int, float] | None:
    """TransNetV2's single-frame transition probability at the frames `at`, as its
    official predict_frames gives it: windows of 100 frames every 50 frames, the middle
    50 predictions of each kept, the video padded with copies of its first and last
    frame. Only the windows holding those frames are run, and each window is
    independent, so the values are those of a run over the whole video. `frames`:
    (n, 27, 48, 3) uint8 RGB. None when the model is not installed."""
    session = _session()
    if session is None:
        return None
    n = len(frames)
    if not n or not at:
        return {}
    end = MARGIN + STEP - (n % STEP or STEP)
    padded = np.concatenate([frames[:1]] * MARGIN + [frames] + [frames[-1:]] * end, 0)
    frame_of = {f: min(max(f, 0), n - 1) for f in at}
    wanted = sorted({k // STEP for k in frame_of.values()})
    single = {}
    for i in range(0, len(wanted), BATCH):
        part = wanted[i:i + BATCH]
        batch = np.stack([padded[k * STEP:k * STEP + WINDOW] for k in part])
        out = session.run(["single"], {"frames": batch})[0][:, MARGIN:MARGIN + STEP, 0]
        single.update(zip(part, out))
    return {f: float(single[k // STEP][k % STEP]) for f, k in frame_of.items()}
