"""Runs the worker on one local clip, without the app or a database.

Writes the evidence packet, the clip result and the stills to a folder, for
scripts/seamstate/try-clip.ts to review. For trying an authorized clip by
hand; the service itself only ever works from signed links (server.py).

    .venv/bin/python -m scripts.try_clip CLIP OUT --side right --view side_facing --setting tee
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

from seamstate_worker.media import FootageError
from seamstate_worker.pipeline import ClipRequest, analyze
from seamstate_worker.pose import MediaPipePose

SETTINGS = ("tee", "front_toss", "overhand_bp", "machine")
VIEWS = ("side_facing", "side_behind", "front_on", "rear", "overhead", "other")


def capture(args: argparse.Namespace) -> dict:
    setting: dict = {"setting": args.setting}
    if args.setting == "tee":
        setting["teeZone"] = args.zone
    elif args.setting == "front_toss":
        setting.update(locationAnnounced=None, intendedZone=args.zone, assignment=None)
    elif args.setting == "overhand_bp":
        setting.update(delivery=args.delivery, pitchMix="unknown", pitchType=None, assignment=None)
    else:
        setting.update(machineSettingAsEntered=None, placement="unknown", pitchType=None)
    return {
        "protocolVersion": "seamstate-capture-v1",
        "battingSide": args.side,
        "cameraView": args.view,
        "setting": setting,
        "task": args.task,
        "devices": [],
        "limitations": None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("clip", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--side", choices=("right", "left"), required=True)
    parser.add_argument("--view", choices=VIEWS, required=True)
    parser.add_argument("--setting", choices=SETTINGS, default="tee")
    parser.add_argument("--zone", type=int, choices=range(1, 10), default=None)
    parser.add_argument("--delivery", choices=("coach_bp", "live_pitcher"), default="coach_bp")
    parser.add_argument("--task", default=None)
    parser.add_argument("--timing", choices=("real_time", "slow_motion", "unknown"), default="real_time")
    parser.add_argument("--slowdown", type=float, default=None)
    args = parser.parse_args()

    model = Path(os.environ.get("SEAMSTATE_POSE_MODEL", "/models/pose_landmarker_full.task"))
    request = ClipRequest(str(uuid.uuid4()), capture(args), args.timing, args.slowdown)
    estimator = MediaPipePose(model)
    try:
        result = analyze(args.clip, request, estimator, lambda stage, metrics: print(stage, metrics, file=sys.stderr))
    except FootageError as error:
        print(f"footage problem: {error.code}", file=sys.stderr)
        return 2
    finally:
        estimator.close()
    stills = args.out / "stills"
    stills.mkdir(parents=True, exist_ok=True)
    for frame_id, data in result.stills.items():
        (stills / f"{frame_id}.jpg").write_bytes(data)
    (args.out / "packet.json").write_text(json.dumps(result.packet))
    (args.out / "result.json").write_text(json.dumps({
        "verdict": result.verdict,
        "reasons": result.reasons,
        "versions": result.versions,
        "inspection": result.inspection.record(),
    }, indent=2))
    print(f"{result.verdict}: {len(result.packet['swings'])} swings, {len(result.stills)} stills -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
