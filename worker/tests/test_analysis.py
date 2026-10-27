import unittest

import numpy as np

from seamstate_worker.analysis import find_swings, select_hitter, track_people
from seamstate_worker.evidence import clip_verdict, pick_frames
from tests.synthetic import ASPECT, hitter_points


def run(people_at, seconds=2.4, fps=120, slowdown=1.0, side="right"):
    """Playback times for a clip; people_at takes real time."""
    count = int(seconds * slowdown * fps)
    times = [int(round(i * 1000 / fps)) for i in range(count)]
    detections = [people_at(t / 1000 / slowdown) for t in times]
    tracks = track_people(detections, ASPECT)
    selection = select_hitter(tracks, len(times))
    swings = find_swings(selection.track, times, ASPECT, side, slowdown) if selection.track else []
    return times, selection, swings


def event_s(times, swing, name, slowdown=1.0):
    return times[swing.events[name].frame] / 1000 / slowdown


class SwingTests(unittest.TestCase):
    def test_one_swing_with_ordered_events(self):
        times, selection, swings = run(lambda t: [hitter_points(t)])
        self.assertEqual(selection.status, "selected")
        self.assertEqual(len(swings), 1)
        swing = swings[0]
        self.assertTrue(swing.assessable)
        self.assertEqual(swing.index, 1)
        self.assertAlmostEqual(event_s(times, swing, "contact"), 1.50, delta=0.02)
        self.assertAlmostEqual(event_s(times, swing, "swing_start"), 1.42, delta=0.03)
        self.assertAlmostEqual(event_s(times, swing, "finish"), 1.60, delta=0.03)
        self.assertAlmostEqual(event_s(times, swing, "stride_start"), 1.08, delta=0.04)
        self.assertAlmostEqual(event_s(times, swing, "foot_contact"), 1.27, delta=0.04)
        self.assertAlmostEqual(event_s(times, swing, "load_start"), 0.98, delta=0.05)
        order = [swing.events[n].frame for n in ("setup", "load_start", "swing_start", "contact", "finish")]
        self.assertEqual(order, sorted(order))
        self.assertLessEqual(swing.events["foot_contact"].frame, swing.events["contact"].frame)
        self.assertGreater(swing.visibility["lead_ankle"], 0.9)
        self.assertEqual(swing.tracked_fraction, 1.0)

    def test_frame_rate_does_not_change_the_result(self):
        times_30, _, swings_30 = run(lambda t: [hitter_points(t)], fps=30)
        times_240, _, swings_240 = run(lambda t: [hitter_points(t)], fps=240)
        self.assertEqual(len(swings_30), 1)
        self.assertEqual(len(swings_240), 1)
        self.assertAlmostEqual(event_s(times_30, swings_30[0], "contact"), event_s(times_240, swings_240[0], "contact"), delta=0.04)

    def test_slow_motion_uses_real_time(self):
        times, _, swings = run(lambda t: [hitter_points(t)], fps=30, slowdown=8)
        self.assertEqual(len(swings), 1)
        self.assertAlmostEqual(event_s(times, swings[0], "contact", slowdown=8), 1.50, delta=0.01)

    def test_no_swing_and_waggles_are_not_invented(self):
        _, selection, swings = run(lambda t: [hitter_points(t, swing_at=None, stride=None, load=None)])
        self.assertEqual(selection.status, "selected")
        self.assertEqual(swings, [])
        _, _, swings = run(lambda t: [hitter_points(t, swing_at=None, stride=None, load=None, waggle=0.02)])
        self.assertEqual(swings, [])
        self.assertEqual(clip_verdict(selection, [], 0.6), ("no_swing_detected", ["no_swing_found"]))

    def test_two_swings(self):
        from tests.synthetic import _smoothstep

        def people(t):
            # The hitter resets slowly between swings, then swings again.
            if t < 2.5:
                return [hitter_points(t)]
            points = hitter_points(t - 2.5)
            back = 1 - _smoothstep((t - 2.5) / 0.6)
            for index in (13, 14, 15, 16):
                points[index, 0] -= 0.35 * back / ASPECT
            for index in (27, 31):
                points[index, 0] -= 0.08 * back / ASPECT
            return [points]
        times, _, swings = run(people, seconds=4.8)
        self.assertEqual([s.index for s in swings], [1, 2])
        self.assertAlmostEqual(event_s(times, swings[1], "contact"), 4.0, delta=0.02)

    def test_hidden_feet_leave_stride_events_out_and_limit_the_clip(self):
        times, selection, swings = run(lambda t: [hitter_points(t, hidden=(27, 28, 31, 32))])
        self.assertEqual(len(swings), 1)
        self.assertNotIn("stride_start", swings[0].events)
        self.assertNotIn("foot_contact", swings[0].events)
        self.assertLess(swings[0].visibility["lead_ankle"], 0.1)
        verdict, reasons = clip_verdict(selection, swings, 0.6)
        self.assertEqual(verdict, "limited")
        self.assertIn("missing_feet", reasons)

    def test_tracking_gap_makes_a_swing_not_assessable(self):
        times, selection, swings = run(lambda t: [] if 0.6 < t < 1.38 else [hitter_points(t)])
        self.assertEqual(len(swings), 1)
        self.assertFalse(swings[0].assessable)
        self.assertIn("not tracked", swings[0].reason)
        self.assertEqual(pick_frames(swings, selection.track, times), [])
        self.assertEqual(clip_verdict(selection, swings, 0.6)[0], "retake_recommended")

    def test_left_handed_hitter_uses_the_right_ankle_as_lead(self):
        def lefty(t):
            points = hitter_points(t)
            points[[27, 28]] = points[[28, 27]]
            points[[31, 32]] = points[[32, 31]]
            return [points]
        times, _, swings = run(lefty, side="left")
        self.assertIn("foot_contact", swings[0].events)
        _, _, wrong_side = run(lefty, side="right")
        self.assertNotIn("foot_contact", wrong_side[0].events)


class SubjectTests(unittest.TestCase):
    def test_the_clearly_larger_person_is_the_hitter(self):
        times, selection, swings = run(lambda t: [hitter_points(t, scale=0.4, offset_x=0.35, swing_at=None, stride=None),
                                                  hitter_points(t)])
        self.assertEqual(selection.status, "selected")
        self.assertEqual(selection.candidates, 2)
        self.assertEqual(len(swings), 1)

    def test_two_similar_people_need_the_person_to_choose(self):
        _, selection, swings = run(lambda t: [hitter_points(t, offset_x=-0.25), hitter_points(t, offset_x=0.25, swing_at=None)])
        self.assertEqual(selection.status, "ambiguous")
        self.assertIsNone(selection.track)
        self.assertEqual(clip_verdict(selection, swings, 0.6), ("subject_selection_required", ["several_people"]))

    def test_nobody_in_frame(self):
        _, selection, _ = run(lambda t: [])
        self.assertEqual(selection.status, "none")
        self.assertEqual(clip_verdict(selection, [], 0.0), ("no_swing_detected", ["hitter_not_found"]))

    def test_a_small_hitter_gets_a_retake(self):
        _, selection, swings = run(lambda t: [hitter_points(t)])
        self.assertEqual(clip_verdict(selection, swings, 0.1), ("retake_recommended", ["hitter_too_small"]))


class EvidenceFrameTests(unittest.TestCase):
    def test_stills_at_and_around_events(self):
        times, selection, swings = run(lambda t: [hitter_points(t)])
        frames = pick_frames(swings, selection.track, times)
        events = {f.event for f in frames if f.event}
        self.assertEqual(events, {"setup", "load_start", "stride_start", "foot_contact", "swing_start", "contact", "finish"})
        self.assertLessEqual(len(frames), 12)
        self.assertTrue(all(f.frame_id == f"f{f.frame:06d}" for f in frames))
        self.assertTrue(all(f.tracking == "tracked" for f in frames))
        contact = next(f for f in frames if f.event == "contact")
        neighbors = [f for f in frames if f.event is None and abs(f.time_ms - contact.time_ms) <= 40]
        self.assertEqual(len(neighbors), 2)
        self.assertEqual([f.frame for f in frames], sorted(f.frame for f in frames))


if __name__ == "__main__":
    unittest.main()
