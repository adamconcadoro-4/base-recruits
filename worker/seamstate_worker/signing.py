"""HMAC-SHA256 signatures for messages between the app and the worker.

Header format: "t=<unix seconds>,v1=<hex>", signing "<t>.<raw body>". The
same shared secret signs both directions; a signature older than five
minutes is refused so a captured message cannot be replayed later.
"""

from __future__ import annotations

import hashlib
import hmac
import time

HEADER = "X-SeamState-Signature"
MAX_AGE_S = 300


def sign(secret: bytes, body: bytes, now: float | None = None) -> str:
    stamp = str(int(now if now is not None else time.time()))
    digest = hmac.new(secret, stamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return f"t={stamp},v1={digest}"


def verify(secret: bytes, body: bytes, header: str | None, now: float | None = None) -> bool:
    if not header or not secret:
        return False
    parts = dict(item.split("=", 1) for item in header.split(",") if "=" in item)
    stamp, given = parts.get("t", ""), parts.get("v1", "")
    if not stamp.isdigit() or not given:
        return False
    if abs((now if now is not None else time.time()) - int(stamp)) > MAX_AGE_S:
        return False
    expected = hmac.new(secret, stamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, given)
