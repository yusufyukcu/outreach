"""DOVER scores (Wu et al., ICCV 2023) for a list of videos.

Run with the DOVER environment's Python, not the EQI one (see README, "Baseline:
DOVER"); it does not import eqi. Video paths come one per line on stdin. For each
video it prints one JSON line: the technical and aesthetic branch scores and the
fused overall score in [0, 1], computed as in DOVER's evaluate_one_video.py with
the default score-level fusion. DOVER samples frames at random offsets, so the
seed is fixed per video and a video always gets the same score.

Usage: python dover_runner.py <dover_dir> < videos.txt
"""

import json
import random
import sys
from pathlib import Path

MEAN, STD = (123.675, 116.28, 103.53), (58.395, 57.12, 57.375)


def main(dover_dir: Path, videos: list[str]) -> None:
    sys.path.insert(0, str(dover_dir))
    import numpy as np
    import torch
    import yaml
    from dover.datasets import UnifiedFrameSampler, spatial_temporal_view_decomposition
    from dover.models import DOVER

    opt = yaml.safe_load((dover_dir / "dover.yml").read_text(encoding="utf-8"))
    model = DOVER(**opt["model"]["args"])
    model.load_state_dict(torch.load(dover_dir / "pretrained_weights" / "DOVER.pth", map_location="cpu"))
    sample_types = opt["data"]["val-l1080p"]["args"]["sample_types"]
    samplers = {}
    for stype, s in sample_types.items():
        if "t_frag" not in s:   # technical branch
            samplers[stype] = UnifiedFrameSampler(s["clip_len"], s["num_clips"], s["frame_interval"])
        else:                   # aesthetic branch
            samplers[stype] = UnifiedFrameSampler(s["clip_len"] // s["t_frag"], s["t_frag"], s["frame_interval"], s["num_clips"])
    mean, std = torch.FloatTensor(MEAN), torch.FloatTensor(STD)

    for video in videos:
        random.seed(0)
        np.random.seed(0)
        torch.manual_seed(0)
        try:
            views, _ = spatial_temporal_view_decomposition(video, sample_types, samplers)
            for key, v in views.items():
                clips = sample_types[key].get("num_clips", 1)
                views[key] = (((v.permute(1, 2, 3, 0) - mean) / std).permute(3, 0, 1, 2)
                              .reshape(v.shape[0], clips, -1, *v.shape[2:]).transpose(0, 1))
            scores = {key: out.mean().item() for key, out in zip(views, model(views))}  # forward(inference=True): eval + no_grad
            t, a = scores["technical"], scores["aesthetic"]
            x = (t - 0.1107) / 0.07355 * 0.6104 + (a + 0.08285) / 0.03774 * 0.3896
            row = {"video": video, "technical": t, "aesthetic": a, "overall": float(1 / (1 + np.exp(-x)))}
        except Exception as err:  # one unreadable video must not stop the others
            row = {"video": video, "error": f"{type(err).__name__}: {err}"}
        print(json.dumps(row), flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]), [line.strip() for line in sys.stdin if line.strip()])
