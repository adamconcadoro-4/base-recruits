"""Pose estimation. The pipeline depends only on the PoseEstimator protocol,
so tests can drive it with synthetic people and the model can be swapped
behind a version string."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

import numpy as np

POSE_MODEL_VERSION = "mediapipe-pose-landmarker-full-float16-1"
POSE_MODEL_SHA256 = "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1"
MAX_PEOPLE = 4


class PoseEstimator(Protocol):
    def detect(self, rgb: np.ndarray, time_ms: int) -> list[np.ndarray]:
        """People in one frame, each a (33, 3) array of normalized x, y and visibility."""
        ...

    def close(self) -> None: ...


class MediaPipePose:
    """MediaPipe Pose Landmarker in video mode, up to four people per frame."""

    def __init__(self, model_path: Path):
        from seamstate_worker.media import sha256_file

        if sha256_file(model_path) != POSE_MODEL_SHA256:
            raise RuntimeError("pose model file does not match the pinned version")
        from mediapipe.tasks.python import BaseOptions, vision

        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=MAX_PEOPLE,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(options)
        self._last_ms = -1

    def detect(self, rgb: np.ndarray, time_ms: int) -> list[np.ndarray]:
        import mediapipe as mp

        # Video mode needs strictly increasing timestamps.
        stamp = max(time_ms, self._last_ms + 1)
        self._last_ms = stamp
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self._landmarker.detect_for_video(image, stamp)
        return [
            np.array([[point.x, point.y, point.visibility or 0.0] for point in person], dtype=np.float32)
            for person in result.pose_landmarks
        ]

    def close(self) -> None:
        self._landmarker.close()
