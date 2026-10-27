import json
import os
import re
import tempfile
import unittest
from pathlib import Path

from seamstate_worker.landmarks import BODY_ROLES, POSE_POINTS
from seamstate_worker.pipeline import ClipRequest, analyze
from tests.synthetic import CAPTURE, SyntheticEstimator, hitter_points, make_clip

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_packet.json"
MEDIA_ID = "00000000-0000-4000-8000-000000000001"


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.clip = make_clip(Path(cls.dir.name) / "swing.mp4", seconds=2.4, fps=60, size="1280x720")

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def run_clip(self, people_at, **request):
        stages = []
        result = analyze(self.clip, ClipRequest(MEDIA_ID, CAPTURE, request.get("timing_basis", "real_time"), request.get("factor")),
                         SyntheticEstimator(people_at), lambda stage, metrics: stages.append((stage, metrics)))
        return result, stages

    def test_end_to_end_packet_and_stills(self):
        result, stages = self.run_clip(lambda t: [hitter_points(t)])
        self.assertEqual(result.verdict, "suitable")
        self.assertEqual([s for s, _ in stages], ["inspecting", "inspecting", "tracking", "tracking", "extracting", "extracting"])
        packet = result.packet
        self.assertEqual(packet["mediaId"], MEDIA_ID)
        self.assertEqual(packet["frameCount"], 144)
        self.assertFalse(packet["releaseVisible"])
        self.assertEqual(len(packet["swings"]), 1)
        self.assertEqual(sorted(result.stills), sorted(f["frameId"] for f in packet["frames"]))
        for data in result.stills.values():
            self.assertEqual(data[:2], b"\xff\xd8")  # JPEG
            self.assertNotIn(b"Exif", data[:64])
        # Metrics are timings and counts only.
        for _, metrics in stages:
            self.assertTrue(all(isinstance(v, (int, float, str)) for v in metrics.values()))
        if os.environ.get("UPDATE_FIXTURES"):
            FIXTURE.write_text(json.dumps(packet, indent=2) + "\n")
        self.assertEqual(packet, json.loads(FIXTURE.read_text()),
                         "the shared packet fixture is out of date; run with UPDATE_FIXTURES=1 and re-run the TypeScript tests")

    def test_two_people_stop_for_the_person_to_choose(self):
        result, _ = self.run_clip(lambda t: [hitter_points(t, offset_x=-0.25), hitter_points(t, offset_x=0.25)])
        self.assertEqual(result.verdict, "subject_selection_required")
        self.assertEqual(result.packet["swings"], [])
        self.assertEqual(result.stills, {})

    def test_no_swing(self):
        result, _ = self.run_clip(lambda t: [hitter_points(t, swing_at=None, stride=None, load=None)])
        self.assertEqual(result.verdict, "no_swing_detected")
        self.assertEqual(result.stills, {})


class SharedDefinitionTests(unittest.TestCase):
    """The worker's body roles and pose points match the app's."""

    def test_body_roles_match_types_ts(self):
        source = (ROOT / "src/lib/seamstate/types.ts").read_text()
        block = re.search(r"export const BODY_ROLES = \[(.*?)\] as const", source, re.S).group(1)
        self.assertEqual(tuple(re.findall(r"'([a-z_]+)'", block)), BODY_ROLES)

    def test_pose_points_match_landmarks_ts(self):
        source = (ROOT / "src/lib/seamstate/landmarks.ts").read_text()
        block = re.search(r"export const POSE_POINTS = \{(.*?)\} as const", source, re.S).group(1)
        self.assertEqual({k: int(v) for k, v in re.findall(r"([a-z_]+): (\d+)", block)}, POSE_POINTS)


if __name__ == "__main__":
    unittest.main()
