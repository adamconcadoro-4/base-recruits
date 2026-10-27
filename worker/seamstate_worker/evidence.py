"""Evidence stills, the clip verdict and the evidence packet.

The packet matches evidencePacketSchema in src/lib/seamstate/packet.ts (a
fixture shared by both test suites keeps them in step). It is the only
material the interpretation step and the validator may rely on.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from seamstate_worker.analysis import VISIBLE, Selection, Swing, Track
from seamstate_worker.landmarks import KEY_POINTS, ROLE_GROUPS
from seamstate_worker.media import Inspection

MAX_FRAMES = 200
MAX_FRAMES_PER_SWING = 12
# Stills around fast events: just before, at, and just after (ms of real time).
NEIGHBOR_EVENTS = ("contact", "swing_start", "foot_contact")  # in priority order
NEIGHBOR_MS = 33
MIN_HITTER_HEIGHT = 0.2  # share of frame height
CROP_PADDING = 0.3
JPEG_QUALITY = 85
EVENT_ORDER = ("setup", "load_start", "stride_start", "foot_contact", "swing_start", "contact", "finish")


@dataclass(frozen=True)
class EvidenceFrame:
    frame_id: str
    frame: int
    time_ms: int
    swing_index: int | None
    event: str | None
    tracking: str


def frame_id(frame: int) -> str:
    return f"f{frame:06d}"


def tracking_state(track: Track | None, frame: int) -> str:
    if track is None or frame not in track.frames:
        return "lost"
    points = track.frames[frame]
    return "tracked" if all(points[i, 2] >= VISIBLE for i in KEY_POINTS) else "partial"


def _nearest(times_ms: list[int], target: float) -> int:
    index = int(np.searchsorted(times_ms, target))
    if index <= 0:
        return 0
    if index >= len(times_ms):
        return len(times_ms) - 1
    return index if times_ms[index] - target < target - times_ms[index - 1] else index - 1


def pick_frames(swings: list[Swing], track: Track | None, times_ms: list[int], slowdown: float = 1.0) -> list[EvidenceFrame]:
    chosen: dict[int, EvidenceFrame] = {}
    for swing in swings:
        if not swing.assessable:
            continue
        # Every event first, then the frames around fast events while there is room.
        picked: list[tuple[int, str | None]] = [(swing.events[n].frame, n) for n in EVENT_ORDER if n in swing.events]
        for name in NEIGHBOR_EVENTS:
            event = swing.events.get(name)
            if event is not None:
                offset = NEIGHBOR_MS * slowdown  # real-time offset in playback ms
                for target in (times_ms[event.frame] - offset, times_ms[event.frame] + offset):
                    neighbor = _nearest(times_ms, target)
                    if swing.start <= neighbor <= swing.end and neighbor != event.frame:
                        picked.append((neighbor, None))
        for frame, name in picked[:MAX_FRAMES_PER_SWING]:
            if frame in chosen and chosen[frame].event is not None:
                continue
            chosen[frame] = EvidenceFrame(frame_id(frame), frame, times_ms[frame], swing.index, name, tracking_state(track, frame))
        if len(chosen) >= MAX_FRAMES:
            break
    return [chosen[f] for f in sorted(chosen)][:MAX_FRAMES]


def crop_box(track: Track | None, frame: int, swing: Swing | None, width: int, height: int) -> tuple[int, int, int, int]:
    """Pixel box around the hitter (padded), so stills leave out other people where possible."""
    points = []
    if track is not None:
        frames = [frame] if frame in track.frames else ([f for f in range(swing.start, swing.end + 1) if f in track.frames] if swing else [])
        for f in frames:
            visible = track.frames[f][track.frames[f][:, 2] >= 0.3]
            points.extend(visible[:, :2].tolist())
    if not points:
        return 0, 0, width, height
    xy = np.asarray(points)
    x0, y0 = xy.min(axis=0)
    x1, y1 = xy.max(axis=0)
    pad_x, pad_y = (x1 - x0) * CROP_PADDING + 0.05, (y1 - y0) * CROP_PADDING + 0.05
    left, top = max(0.0, x0 - pad_x), max(0.0, y0 - pad_y)
    right, bottom = min(1.0, x1 + pad_x), min(1.0, y1 + pad_y)
    return int(left * width), int(top * height), max(int(right * width), int(left * width) + 2), max(int(bottom * height), int(top * height) + 2)


def encode_still(rgb: np.ndarray, box: tuple[int, int, int, int]) -> bytes:
    """JPEG of the cropped region. OpenCV writes no camera or location metadata."""
    left, top, right, bottom = box
    crop = rgb[top:bottom, left:right]
    ok, data = cv2.imencode(".jpg", cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise RuntimeError("could not encode a still")
    return data.tobytes()


def clip_verdict(selection: Selection, swings: list[Swing], hitter_height: float) -> tuple[str, list[str]]:
    """Overall result and reason codes ('missing_<group>' maps to RETAKE_TIPS in the app)."""
    if selection.status == "ambiguous":
        return "subject_selection_required", ["several_people"]
    if selection.status == "none":
        return "no_swing_detected", ["hitter_not_found"]
    if not swings:
        return "no_swing_detected", ["no_swing_found"]
    if hitter_height < MIN_HITTER_HEIGHT:
        return "retake_recommended", ["hitter_too_small"]
    assessable = [s for s in swings if s.assessable]
    missing = []
    for group, roles in ROLE_GROUPS.items():
        values = [s.visibility[r] for s in (assessable or swings) for r in roles]
        if values and float(np.mean(values)) < VISIBLE:
            missing.append(f"missing_{group}")
    if not assessable:
        return "retake_recommended", missing[:1] or ["hitter_not_tracked"]
    return ("limited", missing) if missing else ("suitable", [])


def build_packet(media_id: str, inspection: Inspection, capture: dict, timing_basis: str, slowdown_factor: float | None,
                 swings: list[Swing], frames: list[EvidenceFrame], times_ms: list[int]) -> dict:
    def event(e) -> dict:
        return {"frameIndex": e.frame, "timeMs": times_ms[e.frame],
                "intervalMs": [times_ms[e.interval[0]], times_ms[e.interval[1]]] if e.interval else None,
                "method": "pose_rule"}

    return {
        "mediaId": media_id,
        "durationMs": inspection.duration_ms,
        "frameCount": inspection.frame_count,
        "timing": {"measuredFps": inspection.measured_fps, "timingBasis": timing_basis,
                   "slowdownFactor": slowdown_factor, "variableFrameRate": inspection.variable_frame_rate},
        "capture": capture,
        "swings": [{
            "index": s.index, "startMs": times_ms[s.start], "endMs": times_ms[s.end], "assessable": s.assessable,
            "reason": s.reason, "events": {name: event(e) for name, e in s.events.items()},
            "visibility": s.visibility, "trackedFraction": s.tracked_fraction,
        } for s in swings],
        "frames": [{"frameId": f.frame_id, "frameIndex": f.frame, "timeMs": f.time_ms, "swingIndex": f.swing_index,
                    "event": f.event, "tracking": f.tracking} for f in frames],
        # The worker does not detect the ball; release is never claimed visible.
        "releaseVisible": False,
    }
