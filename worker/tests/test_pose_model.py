"""Runs the real pose model when its pinned file is available
(SEAMSTATE_POSE_MODEL); skipped otherwise, e.g. in CI without network."""

import os
import tempfile
import unittest
from pathlib import Path

from seamstate_worker.media import decode_frames, frame_times_ms, inspect
from seamstate_worker.pose import MediaPipePose
from tests.synthetic import make_clip

MODEL = Path(os.environ.get("SEAMSTATE_POSE_MODEL", "/models/pose_landmarker_full.task"))


@unittest.skipUnless(MODEL.exists(), "pose model file not available")
class PoseModelTests(unittest.TestCase):
    def test_a_clip_with_nobody_in_it_finds_nobody(self):
        with tempfile.TemporaryDirectory() as directory:
            clip = make_clip(Path(directory) / "empty.mp4", seconds=1, fps=30)
            info = inspect(clip)
            pose = MediaPipePose(MODEL)
            try:
                found = [pose.detect(frame, t) for frame, t in zip(decode_frames(clip, info), frame_times_ms(clip))]
            finally:
                pose.close()
        self.assertEqual(len(found), 30)
        self.assertTrue(all(people == [] for people in found))

    def test_a_tampered_model_file_is_refused(self):
        with tempfile.NamedTemporaryFile(suffix=".task") as handle:
            handle.write(b"not the model")
            handle.flush()
            with self.assertRaises(RuntimeError):
                MediaPipePose(Path(handle.name))


if __name__ == "__main__":
    unittest.main()
