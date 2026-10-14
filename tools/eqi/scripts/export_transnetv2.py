"""Export the TransNetV2 shot-transition network to ONNX (third_party/TransNetV2/transnetv2.onnx).

Needs its own environment with TensorFlow and PyTorch (README, *Install*); the EQI
environment itself only needs onnxruntime. The official TensorFlow weights are copied
into the official PyTorch port with its convert_weights.py, the port is exported for
100-frame windows with sigmoid outputs, and the ONNX model is checked against the
TensorFlow model on random frames, as convert_weights.py --test does.

Usage: python scripts/export_transnetv2.py third_party/TransNetV2
"""

import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as functional

folder = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(folder))
import convert_weights  # noqa: E402  official inference-pytorch/convert_weights.py
import transnetv2_pytorch  # noqa: E402  official inference-pytorch/transnetv2_pytorch.py


def compute_color_histograms(frames):
    """The port's colour histogram (512 RGB bins, L2-normalized) without bit shifts,
    which ONNX defines only for unsigned integers; the counts are exact in float32."""
    frames = frames.int()
    b, t, h, w, _ = frames.shape
    flat = frames.reshape(b * t, h * w, 3)
    binned = (flat[:, :, 0] // 32) * 64 + (flat[:, :, 1] // 32) * 8 + flat[:, :, 2] // 32
    binned = (binned + (torch.arange(0, b * t) * 512).view(-1, 1)).reshape(-1).long()
    hist = torch.zeros(b * t * 512, dtype=torch.float32).scatter_add(0, binned, torch.ones_like(binned, dtype=torch.float32))
    return functional.normalize(hist.view(b, t, 512), p=2, dim=2)


class Sigmoids(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, frames):
        single, extra = self.model(frames)
        return torch.sigmoid(single), torch.sigmoid(extra["many_hot"])


def main() -> None:
    import onnxruntime as ort
    import tensorflow as tf

    model, tf_model = convert_weights.convert_weights(str(folder / "transnetv2-weights"))
    x = torch.from_numpy(np.random.default_rng(0).integers(0, 256, (2, 100, 27, 48, 3), dtype=np.uint8))
    with torch.no_grad():
        before = model(x)[0]
        transnetv2_pytorch.ColorHistograms.compute_color_histograms = staticmethod(compute_color_histograms)
        after = model(x)[0]
    assert torch.equal(before, after), "the histogram rewrite changed the output"

    out = folder / "transnetv2.onnx"
    torch.onnx.export(Sigmoids(model).eval(), (torch.zeros((1, 100, 27, 48, 3), dtype=torch.uint8),), str(out),
                      input_names=["frames"], output_names=["single", "many_hot"], opset_version=17,
                      dynamic_axes={"frames": {0: "batch"}, "single": {0: "batch"}, "many_hot": {0: "batch"}})

    session = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    worst = 0.0
    for seed in range(10):
        frames = np.random.default_rng(seed).integers(0, 256, (2, 100, 27, 48, 3), dtype=np.uint8)
        logits, _ = tf_model(tf.cast(frames, tf.float32))
        expected = tf.sigmoid(logits).numpy()
        worst = max(worst, float(np.abs(session.run(["single"], {"frames": frames})[0] - expected).max()))
    print(f"wrote {out}; largest difference to the TensorFlow model on random frames: {worst:.1e}")
    assert worst < 1e-4, "the ONNX model does not match the TensorFlow model"


if __name__ == "__main__":
    main()
