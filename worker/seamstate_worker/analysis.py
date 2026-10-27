"""From per-frame people to the hitter's swings and their events.

All positions are in the image plane, in units of frame height (x is scaled
by the frame's aspect ratio so both axes use the same unit), and speeds are
in body heights per second of real time. Nothing here is a 3D measurement.
Gaps where the hitter was not tracked stay gaps: an event whose landmarks
were not visible is left out rather than guessed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from seamstate_worker.landmarks import BODY_ROLES, pose_index_for

VISIBLE = 0.5

# Tracking people across frames.
LINK_DISTANCE = 0.25  # frame heights between consecutive positions of one person
LINK_GAP_FRAMES = 10
STITCH_OVERLAP_FRAMES = 3  # a brief duplicate of one body (for example while bending over) must not split the hitter in two
MIN_COVERAGE = 0.3  # share of frames a person must appear in to be a candidate
CLEAR_SIZE_RATIO = 1.4  # the hitter must be this much bigger than anyone else to be chosen automatically

# Swing detection (body heights per second, real time).
SWING_PEAK_SPEED = 3.0
SWING_START_FRACTION = 0.3
FINISH_FRACTION = 0.15
LOAD_SPEED = 0.4
STRIDE_SPEED = 0.4
SUSTAIN_S = 0.05
MERGE_S = 1.5  # nobody swings twice this quickly; a follow-through or bat drop after a swing belongs to it
LOOKBACK_S = 2.0
FINISH_LIMIT_S = 1.5
FAST_SMOOTH_S = 0.04
SLOW_SMOOTH_S = 0.1
MIN_TRACKED_FRACTION = 0.8
# Before a swing the hands are set near a shoulder. Fast hands far from both
# shoulders (reaching down to the tee, picking up a ball) are not a swing.
HANDS_SET_DISTANCE = 0.25  # body heights
HANDS_SET_S = 0.5

WRISTS = (15, 16)
HIPS = (23, 24)
SHOULDERS = (11, 12)
ANKLES = (27, 28)


@dataclass
class Track:
    frames: dict[int, np.ndarray] = field(default_factory=dict)

    def last_index(self) -> int:
        return max(self.frames)


@dataclass(frozen=True)
class Selection:
    status: str  # 'selected' | 'ambiguous' | 'none'
    track: Track | None
    candidates: int


@dataclass
class Event:
    frame: int
    interval: tuple[int, int] | None = None  # frame indexes


@dataclass
class Swing:
    index: int  # 1-based
    start: int
    end: int
    peak: int
    events: dict[str, Event]
    visibility: dict[str, float]
    tracked_fraction: float
    assessable: bool
    reason: str | None


def _iso(points: np.ndarray, aspect: float) -> np.ndarray:
    """(33, 2) positions in frame-height units."""
    return np.stack([points[:, 0] * aspect, points[:, 1]], axis=1)


def _center(points: np.ndarray, aspect: float) -> np.ndarray | None:
    iso = _iso(points, aspect)
    for group in (HIPS, SHOULDERS):
        visible = [i for i in group if points[i, 2] >= VISIBLE]
        if visible:
            return iso[visible].mean(axis=0)
    return None


def _height(points: np.ndarray) -> float:
    visible = points[points[:, 2] >= VISIBLE]
    return float(visible[:, 1].max() - visible[:, 1].min()) if len(visible) >= 4 else 0.0


def track_people(detections: list[list[np.ndarray]], aspect: float) -> list[Track]:
    """Link each frame's people to the nearest recent position (greedy)."""
    tracks: list[Track] = []
    for frame, people in enumerate(detections):
        centers = [(_center(person, aspect), person) for person in people]
        taken: set[int] = set()
        for center, person in sorted(centers, key=lambda item: -_height(item[1])):
            if center is None:
                continue
            best, best_distance = None, LINK_DISTANCE
            for number, track in enumerate(tracks):
                if number in taken or frame - track.last_index() > LINK_GAP_FRAMES or frame in track.frames:
                    continue
                previous = _center(track.frames[track.last_index()], aspect)
                if previous is None:
                    continue
                distance = float(np.linalg.norm(center - previous))
                if distance < best_distance:
                    best, best_distance = number, distance
            if best is None:
                tracks.append(Track({frame: person}))
                taken.add(len(tracks) - 1)
            else:
                tracks[best].frames[frame] = person
                taken.add(best)
    return _stitch(tracks, aspect)


def _stitch(tracks: list[Track], aspect: float) -> list[Track]:
    """Join a track to the one it carries on from.

    A track that starts while another is still running (usually a duplicate
    detection of the same body) can take over that person's later frames. When
    it overlaps the earlier track by only a few frames and its first frame after
    that track ends would have linked to it, it is the same person.
    """
    tracks = sorted(tracks, key=lambda t: min(t.frames))
    joined = True
    while joined:
        joined = False
        for earlier in tracks:
            end = earlier.last_index()
            last = _center(earlier.frames[end], aspect)
            for later in tracks:
                if later is earlier or not min(earlier.frames) < min(later.frames) <= end + LINK_GAP_FRAMES:
                    continue
                if sum(1 for f in later.frames if f <= end) > STITCH_OVERLAP_FRAMES:
                    continue
                after = sorted(f for f in later.frames if f > end)
                if not after or after[0] - end > LINK_GAP_FRAMES:
                    continue
                first = _center(later.frames[after[0]], aspect)
                if last is None or first is None or float(np.linalg.norm(first - last)) >= LINK_DISTANCE:
                    continue
                for f in after:
                    earlier.frames[f] = later.frames[f]
                tracks.remove(later)
                joined = True
                break
            if joined:
                break
    return tracks


def select_hitter(tracks: list[Track], frame_count: int) -> Selection:
    """The batter is the one clearly larger candidate; otherwise the person must choose."""
    candidates = [t for t in tracks if len(t.frames) >= MIN_COVERAGE * frame_count]
    if not candidates:
        return Selection("none", None, 0)
    sizes = sorted(((float(np.median([_height(p) for p in t.frames.values()])), n) for n, t in enumerate(candidates)), reverse=True)
    if len(sizes) == 1 or sizes[0][0] >= CLEAR_SIZE_RATIO * sizes[1][0]:
        return Selection("selected", candidates[sizes[0][1]], len(candidates))
    return Selection("ambiguous", None, len(candidates))


def _series(track: Track, frame_count: int, indexes: tuple[int, ...], aspect: float, need_all: bool = True) -> np.ndarray:
    """(frames, 2) mean position of the given points; NaN where not visible."""
    out = np.full((frame_count, 2), np.nan)
    for frame, points in track.frames.items():
        visible = [i for i in indexes if points[i, 2] >= VISIBLE]
        if visible and (len(visible) == len(indexes) or not need_all):
            out[frame] = _iso(points, aspect)[visible].mean(axis=0)
    return out


def _smooth(values: np.ndarray, times_s: np.ndarray, window_s: float) -> np.ndarray:
    """Centered moving average over a real-time window; NaN gaps are not filled."""
    out = np.full_like(values, np.nan)
    lows = np.searchsorted(times_s, times_s - window_s / 2, side="left")
    highs = np.searchsorted(times_s, times_s + window_s / 2, side="right")
    for i in range(len(values)):
        if np.isnan(values[i]).any():
            continue
        block = values[lows[i]:highs[i]]
        block = block[~np.isnan(block).any(axis=1)]
        out[i] = block.mean(axis=0)
    return out


def _speed(positions: np.ndarray, times_s: np.ndarray, body: float) -> np.ndarray:
    speed = np.full(len(positions), np.nan)
    for i in range(1, len(positions) - 1):
        a, b = positions[i - 1], positions[i + 1]
        dt = times_s[i + 1] - times_s[i - 1]
        if dt > 0 and not (np.isnan(a).any() or np.isnan(b).any()):
            speed[i] = float(np.linalg.norm(b - a)) / dt / body
    return speed


def body_height(track: Track, aspect: float) -> float:
    """Median shoulder-to-ankle distance (frame heights); a hip-based estimate when ankles are hidden."""
    values = []
    for points in track.frames.values():
        iso = _iso(points, aspect)
        shoulders = [i for i in SHOULDERS if points[i, 2] >= VISIBLE]
        ankles = [i for i in ANKLES if points[i, 2] >= VISIBLE]
        hips = [i for i in HIPS if points[i, 2] >= VISIBLE]
        if shoulders and ankles:
            values.append(float(np.linalg.norm(iso[shoulders].mean(axis=0) - iso[ankles].mean(axis=0))))
        elif shoulders and hips:
            values.append(2.2 * float(np.linalg.norm(iso[shoulders].mean(axis=0) - iso[hips].mean(axis=0))))
    return float(np.median(values)) if values else 0.0


def _first_sustained(speed: np.ndarray, times_s: np.ndarray, lo: int, hi: int, above: bool, threshold: float) -> int | None:
    """First index in [lo, hi] where speed stays above (or below) threshold for SUSTAIN_S."""
    for i in range(lo, hi + 1):
        if np.isnan(speed[i]) or (speed[i] > threshold) != above:
            continue
        j = i
        while j + 1 <= hi and not np.isnan(speed[j + 1]) and (speed[j + 1] > threshold) == above:
            j += 1
        if times_s[j] - times_s[i] >= SUSTAIN_S or j == hi:
            return i
    return None


def _hands_set(track: Track, peak: int, times_s: np.ndarray, aspect: float, body: float) -> bool:
    """Whether the hands were near a shoulder shortly before the fastest point; True when they were never seen."""
    closest = None
    for frame in range(peak, -1, -1):
        if times_s[peak] - times_s[frame] > HANDS_SET_S:
            break
        points = track.frames.get(frame)
        if points is None or min(points[i, 2] for i in WRISTS) < VISIBLE:
            continue
        iso = _iso(points, aspect)
        hands = iso[list(WRISTS)].mean(axis=0)
        for shoulder in SHOULDERS:
            if points[shoulder, 2] >= VISIBLE:
                distance = float(np.linalg.norm(hands - iso[shoulder])) / body
                closest = distance if closest is None else min(closest, distance)
    return closest is None or closest <= HANDS_SET_DISTANCE


def _peaks(speed: np.ndarray, times_s: np.ndarray, is_swing) -> list[int]:
    candidates = [i for i in range(len(speed)) if not np.isnan(speed[i]) and speed[i] >= SWING_PEAK_SPEED
                  and speed[i] == np.nanmax(speed[np.abs(times_s - times_s[i]) <= 0.3]) and is_swing(i)]
    kept: list[int] = []
    for i in sorted(candidates, key=lambda c: -speed[c]):
        if all(abs(times_s[i] - times_s[k]) >= MERGE_S for k in kept):
            kept.append(i)
    return sorted(kept)


def _visibility(track: Track, lo: int, hi: int, batting_side: str) -> dict[str, float]:
    count = hi - lo + 1
    result = {}
    for role in BODY_ROLES:
        index = pose_index_for(role, batting_side)
        # Frames where the hitter was lost count as not visible.
        total = sum(float(track.frames[f][index, 2]) for f in range(lo, hi + 1) if f in track.frames)
        result[role] = round(total / count, 3)
    return result


def find_swings(track: Track, times_ms: list[int], aspect: float, batting_side: str, slowdown: float = 1.0) -> list[Swing]:
    """Swings from hand speed, with events from hand and lead-ankle motion."""
    frame_count = len(times_ms)
    if frame_count < 3:
        return []
    times_s = np.asarray(times_ms, dtype=float) / 1000.0 / slowdown  # real time
    body = body_height(track, aspect)
    if body <= 0:
        return []
    hands = _series(track, frame_count, WRISTS, aspect)
    lead_ankle = _series(track, frame_count, (pose_index_for("lead_ankle", batting_side),), aspect)
    hand_fast = _speed(_smooth(hands, times_s, FAST_SMOOTH_S), times_s, body)
    hand_slow = _speed(_smooth(hands, times_s, SLOW_SMOOTH_S), times_s, body)
    ankle_slow = _speed(_smooth(lead_ankle, times_s, SLOW_SMOOTH_S), times_s, body)

    swings: list[Swing] = []
    previous_end = -1
    for peak in _peaks(hand_fast, times_s, lambda i: _hands_set(track, i, times_s, aspect, body)):
        top = hand_fast[peak]
        start = peak
        while start - 1 > previous_end and not np.isnan(hand_fast[start - 1]) and hand_fast[start - 1] > SWING_START_FRACTION * top:
            start -= 1
        swing_start = start
        finish = peak
        while (finish + 1 < frame_count and times_s[finish + 1] - times_s[peak] <= FINISH_LIMIT_S
               and not np.isnan(hand_fast[finish + 1]) and hand_fast[finish + 1] > FINISH_FRACTION * top):
            finish += 1
        finish = min(finish + 1, frame_count - 1)
        window_start = swing_start
        while window_start - 1 > previous_end and times_s[swing_start] - times_s[window_start - 1] <= LOOKBACK_S:
            window_start -= 1
        tracked = [f for f in range(window_start, finish + 1) if f in track.frames]
        if not tracked:
            continue
        setup = tracked[0]

        events: dict[str, Event] = {"setup": Event(setup)}
        load = _first_sustained(hand_slow, times_s, setup, swing_start, True, LOAD_SPEED)
        if load is not None and load < swing_start:
            events["load_start"] = Event(load)
        stride = _first_sustained(ankle_slow, times_s, setup, peak, True, STRIDE_SPEED)
        if stride is not None:
            events["stride_start"] = Event(stride)
            landed = _first_sustained(ankle_slow, times_s, stride + 1, peak, False, STRIDE_SPEED)
            if landed is not None:
                events["foot_contact"] = Event(landed, (max(stride, landed - 1), min(peak, landed + 1)))
        events["swing_start"] = Event(swing_start, (max(setup, swing_start - 1), min(peak, swing_start + 1)))
        # Contact is estimated from peak hand speed; the bat and ball are not tracked.
        events["contact"] = Event(peak, (max(swing_start, peak - 1), min(finish, peak + 2)))
        events["finish"] = Event(finish)
        events = {name: event for name, event in events.items() if event.frame in track.frames}

        fraction = len(tracked) / (finish - window_start + 1)
        hands_seen = not np.isnan(hands[peak]).any()
        reason = None
        if fraction < MIN_TRACKED_FRACTION:
            reason = "The hitter was not tracked through enough of this swing."
        elif not hands_seen:
            reason = "The hands were not visible at the fastest point of this swing."
        swings.append(Swing(
            index=len(swings) + 1, start=window_start, end=finish, peak=peak, events=events,
            visibility=_visibility(track, window_start, finish, batting_side),
            tracked_fraction=round(fraction, 3), assessable=reason is None, reason=reason,
        ))
        previous_end = finish
        if len(swings) == 50:
            break
    return swings
