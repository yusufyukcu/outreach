"""Baseline for Tier 2: DOVER (Wu et al., ICCV 2023), a general-purpose video quality
model with an aesthetic and a technical branch. Tier 2 reports how well it predicts
the experts' ratings next to EQI, to show what an edit-specific measure adds.

DOVER needs PyTorch and is licensed for non-commercial use only (S-Lab License
1.0), so it lives in its own environment and runs through dover_runner.py. It is a
comparison only and never enters the EQI score.
"""

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # tools/eqi
RUNNER = Path(__file__).with_name("dover_runner.py")
SETUP_HINT = "DOVER is not set up: see README, 'Baseline: DOVER' (or set DOVER_PYTHON and DOVER_DIR)"


def _python() -> Path:
    if os.environ.get("DOVER_PYTHON"):
        return Path(os.environ["DOVER_PYTHON"])
    windows = ROOT / ".venv-dover" / "Scripts" / "python.exe"
    return windows if windows.exists() else ROOT / ".venv-dover" / "bin" / "python"


def _dover_dir() -> Path:
    return Path(os.environ.get("DOVER_DIR") or ROOT / "third_party" / "DOVER")


def available() -> bool:
    return _python().exists() and (_dover_dir() / "pretrained_weights" / "DOVER.pth").exists()


def dover_scores(videos: list[Path]) -> dict[str, dict]:
    """{video path: {"technical", "aesthetic", "overall"} or {"error"}} for every video,
    from one DOVER process (the model is loaded once)."""
    if not available():
        raise RuntimeError(SETUP_HINT)
    done = subprocess.run([str(_python()), str(RUNNER), str(_dover_dir())], input="\n".join(map(str, videos)),
                          capture_output=True, text=True, encoding="utf-8", check=False)
    scores = {}
    for line in done.stdout.splitlines():
        if line.startswith("{"):
            row = json.loads(line)
            scores[row.pop("video")] = row
    if not scores and videos:
        raise RuntimeError(f"DOVER failed (exit {done.returncode}): {done.stderr[-2000:]}")
    return scores
