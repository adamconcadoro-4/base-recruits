"""Reading a clip: decoded facts, analysis frames and full-resolution stills.

Everything here treats the file as untrusted. The container type comes from
the file's own bytes, never its name; the frame rate comes from decoded
presentation timestamps, never the container's claim; frames are decoded at
source timing with nothing generated or interpolated.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterator

import numpy as np

from seamstate_worker import WORKER_VERSION

MAX_DURATION_MS = 120_000
MIN_FRAMES = 10
ANALYSIS_LONG_SIDE = 960
_TIMEOUT_S = 300
# Only local files; never let a crafted file make ffmpeg open other inputs.
_LOCAL_ONLY = ["-protocol_whitelist", "file"]


class FootageError(Exception):
    """A problem with the footage itself (shown to the person with a retake reason)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Inspection:
    """Matches public.seamstate_media_inspections (snake_case keys)."""

    sha256: str
    container: str
    video_codec: str
    width: int
    height: int
    rotation: int
    measured_fps: float | None
    variable_frame_rate: bool
    frame_count: int
    duration_ms: int
    inspector_version: str

    def record(self) -> dict:
        return asdict(self)

    @property
    def display_size(self) -> tuple[int, int]:
        """Width and height after applying rotation."""
        return (self.height, self.width) if self.rotation in (90, 270) else (self.width, self.height)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def sniff_container(path: Path) -> str | None:
    """'mp4', 'mov' or 'webm' from the file signature, or None."""
    with path.open("rb") as handle:
        head = handle.read(16)
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return "mov" if head[8:12] == b"qt  " else "mp4"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    return None


def _run(command: list[str]) -> bytes:
    try:
        result = subprocess.run(command, capture_output=True, timeout=_TIMEOUT_S, check=False)
    except subprocess.TimeoutExpired as error:
        raise FootageError("decode_timeout") from error
    if result.returncode != 0:
        raise FootageError("unreadable_video")
    return result.stdout


def _rotation(stream: dict) -> int:
    degrees = 0
    for side_data in stream.get("side_data_list", []) or []:
        if "rotation" in side_data:
            # ffprobe reports the display matrix's counter-clockwise angle.
            degrees = -int(float(side_data["rotation"]))
    if not degrees and "rotate" in (stream.get("tags") or {}):
        degrees = int(stream["tags"]["rotate"])
    degrees %= 360
    return degrees if degrees in (0, 90, 180, 270) else 0


def frame_times_ms(path: Path) -> list[int]:
    """Decoded presentation time of every frame, in ms from the first frame."""
    output = _run(["ffprobe", "-v", "error", *_LOCAL_ONLY, "-select_streams", "v:0",
                   "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", str(path)])
    seconds = []
    for line in output.decode("ascii", "replace").splitlines():
        value = line.strip().rstrip(",")
        if value and value != "N/A":
            seconds.append(float(value))
    if not seconds:
        return []
    start = seconds[0]
    return [int(round((s - start) * 1000)) for s in seconds]


def _frame_rate(times: list[int]) -> tuple[float | None, bool]:
    if len(times) < 2 or times[-1] <= times[0]:
        return None, False
    fps = (len(times) - 1) * 1000.0 / (times[-1] - times[0])
    deltas = np.diff(np.asarray(times, dtype=float))
    median = float(np.median(deltas))
    if median <= 0:
        return round(fps, 3), True
    # Millisecond rounding makes small jitter normal; a variable-rate clip has
    # a real share of frames far from the usual spacing.
    irregular = float(np.mean(np.abs(deltas - median) > max(1.5, 0.25 * median)))
    return round(fps, 3), irregular > 0.05


def inspect(path: Path) -> Inspection:
    container = sniff_container(path)
    if container is None:
        raise FootageError("not_a_video")
    probe = json.loads(_run(["ffprobe", "-v", "error", *_LOCAL_ONLY, "-print_format", "json", "-show_streams",
                             "-show_format", "-select_streams", "v:0", str(path)]))
    streams = probe.get("streams") or []
    if not streams:
        raise FootageError("no_video_stream")
    stream = streams[0]
    width, height = int(stream.get("width") or 0), int(stream.get("height") or 0)
    if width < 64 or height < 64:
        raise FootageError("resolution_too_low")
    times = frame_times_ms(path)
    if len(times) < MIN_FRAMES:
        raise FootageError("clip_too_short")
    fps, variable = _frame_rate(times)
    frame_ms = int(round(1000 / fps)) if fps else 0
    duration_ms = times[-1] + frame_ms
    if duration_ms > MAX_DURATION_MS:
        raise FootageError("clip_too_long")
    return Inspection(
        sha256=sha256_file(path),
        container=container,
        video_codec=str(stream.get("codec_name") or "unknown")[:40],
        width=width,
        height=height,
        rotation=_rotation(stream),
        measured_fps=fps,
        variable_frame_rate=variable,
        frame_count=len(times),
        duration_ms=duration_ms,
        inspector_version=WORKER_VERSION,
    )


def analysis_size(inspection: Inspection, long_side: int = ANALYSIS_LONG_SIDE) -> tuple[int, int]:
    """Even-numbered decode size with the long side at most `long_side` (never upscaled)."""
    width, height = inspection.display_size
    scale = min(1.0, long_side / max(width, height))
    return max(2, int(width * scale) // 2 * 2), max(2, int(height * scale) // 2 * 2)


def _raw_frames(path: Path, size: tuple[int, int], select: str | None = None) -> Iterator[np.ndarray]:
    width, height = size
    filters = ([f"select='{select}'"] if select else []) + [f"scale={width}:{height}"]
    command = ["ffmpeg", "-v", "error", *_LOCAL_ONLY, "-i", str(path), "-map", "0:v:0", "-vf", ",".join(filters),
               "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    frame_bytes = width * height * 3
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    assert process.stdout is not None
    try:
        while True:
            chunk = process.stdout.read(frame_bytes)
            if len(chunk) < frame_bytes:
                break
            yield np.frombuffer(chunk, dtype=np.uint8).reshape(height, width, 3)
    finally:
        process.stdout.close()
        process.kill()
        process.wait()


def decode_frames(path: Path, inspection: Inspection) -> Iterator[np.ndarray]:
    """Every decoded frame, in order, rotated upright, at analysis size (RGB)."""
    return _raw_frames(path, analysis_size(inspection))


def extract_stills(path: Path, inspection: Inspection, frame_indexes: list[int]) -> dict[int, np.ndarray]:
    """Full-resolution upright frames for the given decoded frame indexes."""
    wanted = sorted(set(frame_indexes))
    if not wanted:
        return {}
    select = "+".join(f"eq(n,{index})" for index in wanted)
    size = analysis_size(inspection, long_side=1920)
    return dict(zip(wanted, (frame.copy() for frame in _raw_frames(path, size, select))))
