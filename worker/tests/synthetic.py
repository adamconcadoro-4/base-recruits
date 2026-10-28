"""Synthetic people and clips for tests. No athlete footage is used anywhere
in the worker's tests."""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

import numpy as np

ASPECT = 16 / 9

# A standing right-handed hitter, side view, normalized (x by width, y by height).
_BASE = {
    0: (0.50, 0.30), 11: (0.49, 0.40), 12: (0.51, 0.40), 13: (0.48, 0.47), 14: (0.52, 0.47),
    15: (0.47, 0.45), 16: (0.48, 0.45), 23: (0.49, 0.62), 24: (0.51, 0.62), 25: (0.48, 0.76),
    26: (0.52, 0.76), 27: (0.47, 0.90), 28: (0.53, 0.90), 31: (0.46, 0.92), 32: (0.54, 0.92),
}


def _smoothstep(u: float) -> float:
    u = min(1.0, max(0.0, u))
    return 0.5 - 0.5 * math.cos(math.pi * u)


def hitter_points(t: float, *, swing_at: float | None = 1.5, stride: tuple[float, float] | None = (1.05, 1.30),
                  load: tuple[float, float] | None = (0.95, 1.20), waggle: float = 0.0, scale: float = 1.0,
                  offset_x: float = 0.0, hidden: tuple[int, ...] = ()) -> np.ndarray:
    """(33, 3) points at real time t (seconds)."""
    points = np.zeros((33, 3), dtype=np.float32)
    hand_dx = waggle * math.sin(2 * math.pi * t)
    if load:
        hand_dx += 0.06 * _smoothstep((t - load[0]) / (load[1] - load[0]))
    if swing_at is not None:
        # Gaussian hand speed (sigma 50 ms): the hands travel 0.35 frame heights through the zone.
        hand_dx -= 0.35 * 0.5 * (1 + math.erf((t - swing_at) / (0.05 * math.sqrt(2))))
    ankle_dx = -0.08 * _smoothstep((t - stride[0]) / (stride[1] - stride[0])) if stride else 0.0
    for index, (x, y) in _BASE.items():
        dx = 0.0
        if index in (13, 14, 15, 16):
            dx = hand_dx / ASPECT
        if index in (27, 31):  # lead (left) ankle and foot of a right-handed hitter
            dx = ankle_dx / ASPECT
        points[index] = (0.5 + (x - 0.5) * scale + offset_x + dx * scale, 0.5 + (y - 0.5) * scale, 0.0 if index in hidden else 0.95)
    for index in range(33):
        if index not in _BASE:
            points[index] = (0.5 + offset_x, 0.5, 0.0)
    return points


class SyntheticEstimator:
    """Returns scripted people instead of running a model."""

    def __init__(self, people_at, slowdown: float = 1.0):
        self.people_at = people_at
        self.slowdown = slowdown

    def detect(self, rgb, time_ms):
        return self.people_at(time_ms / 1000.0 / self.slowdown)

    def close(self):
        pass


def make_clip(path: Path, *, seconds: float = 2.0, fps: int = 60, size: str = "640x360", extra: list[str] | None = None,
              vf: str | None = None) -> Path:
    command = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={size}:rate={fps}:duration={seconds}"]
    if vf:
        command += ["-vf", vf]
    command += (extra or []) + ["-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", str(path)]
    subprocess.run(command, check=True)
    return path


CAPTURE = {
    "protocolVersion": "seamstate-capture-v1",
    "battingSide": "right",
    "cameraView": "side_facing",
    "setting": {"setting": "tee", "teeZone": 5},
    "task": None,
    "devices": [],
    "limitations": None,
}
