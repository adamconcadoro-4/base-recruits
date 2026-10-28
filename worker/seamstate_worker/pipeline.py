"""One clip, start to finish: inspect, track, find swings, pick stills."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from time import monotonic
from typing import Callable

import numpy as np

from seamstate_worker import WORKER_VERSION
from seamstate_worker.analysis import body_height, find_swings, select_hitter, track_people
from seamstate_worker.evidence import build_packet, clip_verdict, crop_box, encode_still, pick_frames
from seamstate_worker.media import Inspection, decode_frames, extract_stills, frame_times_ms, inspect
from seamstate_worker.pose import POSE_MODEL_VERSION, PoseEstimator

Reporter = Callable[[str, dict], None]


@dataclass(frozen=True)
class ClipRequest:
    media_id: str
    capture: dict  # CaptureContext, as the app sent it
    timing_basis: str  # 'real_time' | 'slow_motion' | 'unknown'
    slowdown_factor: float | None


@dataclass
class ClipResult:
    inspection: Inspection
    verdict: str
    reasons: list[str]
    packet: dict
    stills: dict[str, bytes] = field(default_factory=dict)
    versions: dict = field(default_factory=dict)


def analyze(path: Path, request: ClipRequest, estimator: PoseEstimator, report: Reporter) -> ClipResult:
    started = monotonic()
    report("inspecting", {})
    inspection = inspect(path)
    report("inspecting", {"ms": int((monotonic() - started) * 1000), "frames": inspection.frame_count})

    started = monotonic()
    report("tracking", {})
    times = frame_times_ms(path)
    width, height = inspection.display_size
    aspect = width / height
    detections = []
    for index, frame in enumerate(decode_frames(path, inspection)):
        if index >= len(times):
            break
        detections.append(estimator.detect(frame, times[index]))
    times = times[: len(detections)]
    tracks = track_people(detections, aspect)
    selection = select_hitter(tracks, len(detections))
    report("tracking", {"ms": int((monotonic() - started) * 1000), "people": len(tracks), "candidates": selection.candidates})

    started = monotonic()
    report("extracting", {})
    batting_side = request.capture["battingSide"]
    slowdown = request.slowdown_factor if request.timing_basis == "slow_motion" and request.slowdown_factor else 1.0
    track = selection.track
    swings = find_swings(track, times, aspect, batting_side, slowdown) if track else []
    hitter_height = float(np.median([np.ptp(p[p[:, 2] >= 0.5][:, 1]) for p in track.frames.values()
                                     if (p[:, 2] >= 0.5).sum() >= 4])) if track and track.frames else 0.0
    verdict, reasons = clip_verdict(selection, swings, hitter_height)
    frames = pick_frames(swings, track, times, slowdown) if verdict in ("suitable", "limited") else []
    images = extract_stills(path, inspection, [f.frame for f in frames])
    by_index = {s.index: s for s in swings}
    stills = {}
    for f in frames:
        image = images.get(f.frame)
        if image is not None:
            box = crop_box(track, f.frame, by_index.get(f.swing_index), image.shape[1], image.shape[0])
            stills[f.frame_id] = encode_still(image, box)
    frames = [f for f in frames if f.frame_id in stills]
    packet = build_packet(request.media_id, inspection, request.capture, request.timing_basis, request.slowdown_factor,
                          swings, frames, times)
    report("extracting", {"ms": int((monotonic() - started) * 1000), "swings": len(swings), "stills": len(stills),
                          "body_height": round(body_height(track, aspect), 3) if track else 0})
    return ClipResult(inspection, verdict, reasons, packet, stills,
                      {"worker": WORKER_VERSION, "pose_model": POSE_MODEL_VERSION})
