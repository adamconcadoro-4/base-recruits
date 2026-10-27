import tempfile
import unittest
from pathlib import Path

from seamstate_worker.media import FootageError, decode_frames, extract_stills, inspect, sniff_container
from tests.synthetic import make_clip


class MediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        root = Path(cls.dir.name)
        cls.cfr = make_clip(root / "cfr.mp4", seconds=2, fps=60)
        cls.mov = make_clip(root / "clip.mov", seconds=1, fps=30)
        # Every other frame dropped in the second half: a variable-rate file.
        cls.vfr = make_clip(root / "vfr.mp4", seconds=2, fps=60, vf="select='lt(n\\,60)+not(mod(n\\,2))'",
                            extra=["-fps_mode", "vfr"])
        cls.rotated = root / "rotated.mp4"
        import subprocess
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation", "90", "-i", str(cls.cfr), "-c", "copy", str(cls.rotated)], check=True)
        cls.fake = root / "notes.mp4"
        cls.fake.write_text("this is not a video")

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def test_constant_rate_clip(self):
        info = inspect(self.cfr)
        self.assertEqual(info.container, "mp4")
        self.assertEqual(info.video_codec, "h264")
        self.assertEqual((info.width, info.height, info.rotation), (640, 360, 0))
        self.assertEqual(info.frame_count, 120)
        self.assertAlmostEqual(info.measured_fps, 60, delta=0.5)
        self.assertFalse(info.variable_frame_rate)
        self.assertAlmostEqual(info.duration_ms, 2000, delta=20)
        self.assertRegex(info.sha256, r"^[0-9a-f]{64}$")

    def test_container_comes_from_the_bytes_not_the_name(self):
        self.assertEqual(sniff_container(self.mov), "mov")
        with self.assertRaises(FootageError) as caught:
            inspect(self.fake)
        self.assertEqual(caught.exception.code, "not_a_video")

    def test_variable_frame_rate_is_detected(self):
        info = inspect(self.vfr)
        self.assertTrue(info.variable_frame_rate)
        self.assertEqual(info.frame_count, 90)

    def test_rotation_is_read_and_applied(self):
        info = inspect(self.rotated)
        self.assertIn(info.rotation, (90, 270))
        self.assertEqual(info.display_size, (360, 640))
        first = next(iter(decode_frames(self.rotated, info)))
        self.assertEqual(first.shape, (640, 360, 3))

    def test_every_decoded_frame_and_exact_stills(self):
        info = inspect(self.cfr)
        frames = list(decode_frames(self.cfr, info))
        self.assertEqual(len(frames), info.frame_count)
        stills = extract_stills(self.cfr, info, [5, 60, 119])
        self.assertEqual(sorted(stills), [5, 60, 119])
        self.assertEqual(stills[60].shape, (360, 640, 3))
        # The still at index 60 is the same picture as decoded frame 60.
        self.assertLess(abs(int(stills[60].mean()) - int(frames[60].mean())), 3)


if __name__ == "__main__":
    unittest.main()
