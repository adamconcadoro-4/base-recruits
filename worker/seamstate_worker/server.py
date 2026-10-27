"""HTTP entry point for the worker (Google Cloud Run).

POST /v1/analyze  a signed dispatch from the app: one job attempt, one
                  short-lived signed link to read one clip.
GET  /healthz     liveness.

The worker has no database or AI-provider credentials. It reads the clip
through the signed link, reports each stage to the app's callback URL (from
its own configuration, never from a request), asks the app for signed upload
links for exactly the stills it made, and sends the evidence packet. When
the app answers {"continue": false} (the job was cancelled, deleted or
replaced by a newer attempt, or permission was withdrawn) the worker stops.

Nothing that identifies the athlete or contains a link is logged.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import tempfile
import threading
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from seamstate_worker import WORKER_VERSION
from seamstate_worker.media import FootageError
from seamstate_worker.pipeline import ClipRequest, analyze
from seamstate_worker.signing import HEADER, sign, verify

log = logging.getLogger("seamstate_worker")

MAX_DISPATCH_BYTES = 64 * 1024
MAX_CLIP_BYTES = 209_715_200
HTTP_TIMEOUT_S = 60
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class Stop(Exception):
    """The app said this attempt may no longer write."""


@dataclass(frozen=True)
class Config:
    secret: bytes
    callback_url: str
    media_origin: str  # e.g. https://<project>.supabase.co
    model_path: Path

    @staticmethod
    def from_env() -> "Config":
        secret = os.environ.get("SEAMSTATE_WORKER_SECRET", "")
        callback = os.environ.get("SEAMSTATE_CALLBACK_URL", "")
        origin = os.environ.get("SEAMSTATE_MEDIA_ORIGIN", "").rstrip("/")
        if len(secret) < 32:
            raise RuntimeError("SEAMSTATE_WORKER_SECRET must be at least 32 characters")
        if not (callback.startswith("https://") or callback.startswith("http://localhost")):
            raise RuntimeError("SEAMSTATE_CALLBACK_URL must be an https URL")
        if not origin.startswith("https://"):
            raise RuntimeError("SEAMSTATE_MEDIA_ORIGIN must be an https origin")
        return Config(secret.encode(), callback, origin, Path(os.environ.get("SEAMSTATE_POSE_MODEL", "/models/pose_landmarker_full.task")))


@dataclass(frozen=True)
class Dispatch:
    job_id: str
    attempt_id: str
    media_url: str
    request: ClipRequest


def parse_dispatch(body: dict, config: Config) -> Dispatch:
    """Strict check of the app's dispatch; raises ValueError on anything unexpected."""
    if set(body) != {"jobId", "attemptId", "mediaId", "mediaUrl", "capture", "timing"}:
        raise ValueError("unexpected fields")
    for key in ("jobId", "attemptId", "mediaId"):
        if not isinstance(body[key], str) or not UUID.match(body[key]):
            raise ValueError(f"{key} must be a uuid")
    url = body["mediaUrl"]
    if not isinstance(url, str) or not url.startswith(config.media_origin + "/storage/v1/object/sign/"):
        raise ValueError("the clip link must be a signed storage link")
    capture, timing = body["capture"], body["timing"]
    if not isinstance(capture, dict) or capture.get("battingSide") not in ("right", "left"):
        raise ValueError("capture context is missing")
    if not isinstance(timing, dict) or timing.get("timingBasis") not in ("real_time", "slow_motion", "unknown"):
        raise ValueError("timing is missing")
    factor = timing.get("slowdownFactor")
    if factor is not None and (not isinstance(factor, (int, float)) or not 2 <= factor <= 32):
        raise ValueError("slow-down factor out of range")
    return Dispatch(body["jobId"], body["attemptId"], url,
                    ClipRequest(body["mediaId"], capture, timing["timingBasis"], float(factor) if factor is not None else None))


class AppClient:
    def __init__(self, config: Config, dispatch: Dispatch):
        self.config, self.dispatch = config, dispatch

    def send(self, message: dict) -> dict:
        payload = json.dumps({"jobId": self.dispatch.job_id, "attemptId": self.dispatch.attempt_id, **message},
                             separators=(",", ":")).encode()
        request = urllib.request.Request(self.config.callback_url, data=payload, method="POST",
                                         headers={"Content-Type": "application/json", HEADER: sign(self.config.secret, payload)})
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_S) as response:
            raw = response.read(1 << 20)
            if not verify(self.config.secret, raw, response.headers.get(HEADER)):
                raise RuntimeError("the app's answer was not signed")
        answer = json.loads(raw)
        if not answer.get("continue"):
            raise Stop()
        return answer

    def download(self, target: Path) -> None:
        with urllib.request.urlopen(self.dispatch.media_url, timeout=HTTP_TIMEOUT_S) as response, target.open("wb") as out:
            total = 0
            while chunk := response.read(1 << 20):
                total += len(chunk)
                if total > MAX_CLIP_BYTES:
                    raise FootageError("clip_too_large")
                out.write(chunk)

    def upload(self, url: str, data: bytes, content_type: str) -> None:
        if not url.startswith(self.config.media_origin + "/storage/v1/object/upload/sign/"):
            raise RuntimeError("upload link is not a signed storage link")
        request = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Type": content_type})
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_S):
            pass


def run_attempt(config: Config, dispatch: Dispatch, estimator_factory) -> None:
    client = AppClient(config, dispatch)
    workdir = Path(tempfile.mkdtemp(prefix="seamstate-"))
    try:
        clip = workdir / "clip"
        client.send({"type": "stage", "stage": "inspecting", "metrics": {"worker": WORKER_VERSION}})
        client.download(clip)
        estimator = estimator_factory()
        try:
            result = analyze(clip, dispatch.request, estimator,
                             lambda stage, metrics: client.send({"type": "stage", "stage": stage, "metrics": metrics}))
        finally:
            estimator.close()
        client.send({"type": "inspection", "inspection": result.inspection.record()})
        if result.stills:
            answer = client.send({"type": "upload_urls", "files": [f"{name}.jpg" for name in result.stills]})
            urls = answer.get("urls") or {}
            for name, data in result.stills.items():
                client.upload(urls[f"{name}.jpg"], data, "image/jpeg")
        client.send({"type": "result", "verdict": result.verdict, "reasons": result.reasons,
                     "packet": result.packet, "versions": result.versions})
        log.info("attempt finished", extra={"job": dispatch.job_id, "verdict": result.verdict})
    except Stop:
        log.info("attempt stopped by the app", extra={"job": dispatch.job_id})
    except FootageError as error:
        _report_failure(client, "footage", error.code)
    except Exception:  # noqa: BLE001 - any other problem is ours, never the swing's
        log.exception("attempt failed", extra={"job": dispatch.job_id})
        _report_failure(client, "service", "worker_error")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _report_failure(client: AppClient, kind: str, code: str) -> None:
    try:
        client.send({"type": "failed", "failureKind": kind, "failureCode": code})
    except Exception:  # noqa: BLE001 - the app's stall sweep retries or fails the job
        log.warning("could not report a failure", extra={"job": client.dispatch.job_id})


def make_handler(config: Config, estimator_factory, busy: threading.Lock):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):  # request lines can contain nothing sensitive, but stay quiet
            pass

        def _reply(self, status: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/healthz":
                self._reply(200, {"ok": True, "version": WORKER_VERSION})
            else:
                self._reply(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/v1/analyze":
                return self._reply(404, {"error": "not found"})
            length = int(self.headers.get("Content-Length") or 0)
            if not 0 < length <= MAX_DISPATCH_BYTES:
                return self._reply(413, {"error": "request too large"})
            raw = self.rfile.read(length)
            if not verify(config.secret, raw, self.headers.get(HEADER)):
                return self._reply(401, {"error": "bad signature"})
            try:
                dispatch = parse_dispatch(json.loads(raw), config)
            except (ValueError, json.JSONDecodeError) as error:
                return self._reply(400, {"error": str(error)})
            if not busy.acquire(blocking=False):
                return self._reply(503, {"error": "busy"})

            def work():
                try:
                    run_attempt(config, dispatch, estimator_factory)
                finally:
                    busy.release()

            threading.Thread(target=work, daemon=True).start()
            self._reply(202, {"accepted": True})

    return Handler


def main() -> None:
    from seamstate_worker.pose import MediaPipePose

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    config = Config.from_env()
    handler = make_handler(config, lambda: MediaPipePose(config.model_path), threading.Lock())
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), handler)
    log.info("SeamState worker %s listening", WORKER_VERSION)
    server.serve_forever()


if __name__ == "__main__":
    main()
