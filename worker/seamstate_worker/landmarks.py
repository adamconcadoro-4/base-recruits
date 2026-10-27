"""Body roles and pose points. Mirrors src/lib/seamstate/landmarks.ts and
BODY_ROLES in src/lib/seamstate/types.ts (a test checks they agree).

The pose model names points by the athlete's own left and right. A
right-handed hitter's lead side is the left side. Batting side always comes
from the person's confirmation, never from the picture."""

POSE_POINTS = {
    "nose": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
    "left_foot_index": 31,
    "right_foot_index": 32,
}

BODY_ROLES = (
    "head",
    "lead_shoulder",
    "rear_shoulder",
    "lead_elbow",
    "rear_elbow",
    "lead_wrist",
    "rear_wrist",
    "lead_hip",
    "rear_hip",
    "lead_knee",
    "rear_knee",
    "lead_ankle",
    "rear_ankle",
    "lead_foot",
    "rear_foot",
)

ROLE_GROUPS = {
    "feet": ("lead_ankle", "rear_ankle", "lead_foot", "rear_foot"),
    "legs": ("lead_hip", "rear_hip", "lead_knee", "rear_knee"),
    "hands": ("lead_wrist", "rear_wrist", "lead_elbow", "rear_elbow"),
    "torso": ("lead_shoulder", "rear_shoulder", "lead_hip", "rear_hip"),
    "head": ("head",),
}

# Landmarks a still must show to count as fully tracked.
KEY_POINTS = (0, 11, 12, 15, 16, 23, 24, 27, 28)


def pose_point_for(role: str, batting_side: str) -> str:
    if role == "head":
        return "nose"
    which, part = role.split("_")
    lead = "left" if batting_side == "right" else "right"
    rear = "right" if lead == "left" else "left"
    side = lead if which == "lead" else rear
    return f"{side}_foot_index" if part == "foot" else f"{side}_{part}"


def pose_index_for(role: str, batting_side: str) -> int:
    return POSE_POINTS[pose_point_for(role, batting_side)]
