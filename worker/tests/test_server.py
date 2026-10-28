import json
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import logging

from seamstate_worker import server
from seamstate_worker.signing import HEADER, sign, verify
from tests.synthetic import CAPTURE, SyntheticEstimator, hitter_points, make_clip

SECRET = b"s" * 40
CONFIG = server.Config(SECRET, "http://localhost:9/callback", "https://project.supabase.co", Path("/nonexistent"))
logging.disable(logging.CRITICAL)  # expected failures are logged by design
RealAppClient = server.AppClient
JOB, ATTEMPT, MEDIA = ("00000000-0000-4000-8000-00000000000" + c for c in "abc")


def dispatch_body(**overrides):
    body = {"jobId": JOB, "attemptId": ATTEMPT, "mediaId": MEDIA,
            "mediaUrl": "https://project.supabase.co/storage/v1/object/sign/assessment-media/a/b/c.mp4?token=x",
            "capture": CAPTURE, "timing": {"timingBasis": "real_time", "slowdownFactor": None}}
    body.update(overrides)
    return body


class SigningTests(unittest.TestCase):
    def test_round_trip_and_refusals(self):
        body = b'{"a":1}'
        header = sign(SECRET, body, now=1_000_000)
        self.assertTrue(verify(SECRET, body, header, now=1_000_100))
        self.assertFalse(verify(SECRET, body + b" ", header, now=1_000_100), "a changed body is refused")
        self.assertFalse(verify(SECRET, body, header, now=1_000_400), "an old signature cannot be replayed")
        self.assertFalse(verify(b"other" * 8, body, header, now=1_000_100))
        self.assertFalse(verify(SECRET, body, None))
        self.assertFalse(verify(SECRET, body, "t=abc,v1=00"))


class DispatchTests(unittest.TestCase):
    def test_a_valid_dispatch(self):
        dispatch = server.parse_dispatch(dispatch_body(), CONFIG)
        self.assertEqual(dispatch.request.media_id, MEDIA)

    def test_anything_unexpected_is_refused(self):
        for body in (dispatch_body(extra=1), dispatch_body(jobId="1; drop table"),
                     dispatch_body(mediaUrl="https://evil.example/storage/v1/object/sign/x"),
                     dispatch_body(mediaUrl="https://project.supabase.co/rest/v1/profiles"),
                     dispatch_body(timing={"timingBasis": "slow_motion", "slowdownFactor": 100}),
                     dispatch_body(capture={"battingSide": "switch"})):
            with self.assertRaises(ValueError):
                server.parse_dispatch(body, CONFIG)


class FakeApp:
    """Stands in for the app's callback endpoint and storage."""

    def __init__(self, clip: Path, stop_at: str | None = None):
        self.clip, self.stop_at, self.messages, self.uploads = clip, stop_at, [], {}

    def client(self, config, dispatch):
        app = self

        class Client(RealAppClient):
            def send(self, message):
                app.messages.append(message)
                if app.stop_at and message.get("stage") == app.stop_at:
                    raise server.Stop()
                if message["type"] == "upload_urls":
                    return {"continue": True, "urls": {name: f"{config.media_origin}/storage/v1/object/upload/sign/seamstate-artifacts/{name}?token=t"
                                                       for name in message["files"]}}
                return {"continue": True}

            def download(self, target):
                shutil.copy(app.clip, target)

            def upload(self, url, data, content_type):
                app.uploads[url] = (content_type, len(data))

        return Client(config, dispatch)


class AttemptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.clip = make_clip(Path(cls.dir.name) / "swing.mp4", seconds=2.4, fps=60)
        cls.fake = Path(cls.dir.name) / "fake.mp4"
        cls.fake.write_text("not a video")

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def attempt(self, clip, stop_at=None, people=lambda t: [hitter_points(t)]):
        app = FakeApp(clip, stop_at)
        with mock.patch.object(server, "AppClient", side_effect=app.client):
            server.run_attempt(CONFIG, server.parse_dispatch(dispatch_body(), CONFIG), lambda: SyntheticEstimator(people))
        return app

    def test_a_full_attempt(self):
        app = self.attempt(self.clip)
        types = [m["type"] for m in app.messages]
        self.assertEqual(types[-3:], ["inspection", "upload_urls", "result"])
        result = app.messages[-1]
        self.assertEqual(result["verdict"], "suitable")
        self.assertEqual(len(app.uploads), len(result["packet"]["frames"]))
        self.assertTrue(all(kind == "image/jpeg" for kind, _ in app.uploads.values()))

    def test_footage_problems_are_reported_as_footage(self):
        app = self.attempt(self.fake)
        self.assertEqual(app.messages[-1], {"type": "failed", "failureKind": "footage", "failureCode": "not_a_video"})

    def test_our_own_errors_are_reported_as_service_problems(self):
        def broken(t):
            raise RuntimeError("model crashed")
        app = self.attempt(self.clip, people=broken)
        self.assertEqual(app.messages[-1], {"type": "failed", "failureKind": "service", "failureCode": "worker_error"})

    def test_the_worker_stops_when_the_app_says_so(self):
        app = self.attempt(self.clip, stop_at="tracking")
        self.assertEqual(app.messages[-1].get("stage"), "tracking")
        self.assertFalse(any(m["type"] in ("upload_urls", "result", "failed") for m in app.messages))
        self.assertEqual(app.uploads, {})


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.busy = threading.Lock()
        self.started = []
        handler = server.make_handler(CONFIG, lambda: None, self.busy)
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.http.server_address[1]}"

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()

    def post(self, body: bytes, signed=True):
        headers = {"Content-Type": "application/json"}
        if signed:
            headers[HEADER] = sign(SECRET, body)
        request = urllib.request.Request(self.url + "/v1/analyze", data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_health(self):
        with urllib.request.urlopen(self.url + "/healthz", timeout=5) as response:
            self.assertEqual(json.loads(response.read())["ok"], True)

    def test_unsigned_and_malformed_dispatches_are_refused(self):
        body = json.dumps(dispatch_body()).encode()
        self.assertEqual(self.post(body, signed=False), 401)
        self.assertEqual(self.post(json.dumps(dispatch_body(extra=1)).encode()), 400)

    def test_one_clip_at_a_time(self):
        self.busy.acquire()
        try:
            self.assertEqual(self.post(json.dumps(dispatch_body()).encode()), 503)
        finally:
            self.busy.release()

    def test_accepted_dispatch_runs_in_the_background(self):
        with mock.patch.object(server, "run_attempt", side_effect=lambda *args: self.started.append(args)):
            self.assertEqual(self.post(json.dumps(dispatch_body()).encode()), 202)
            for _ in range(50):
                if self.started:
                    break
                threading.Event().wait(0.02)
        self.assertEqual(len(self.started), 1)


if __name__ == "__main__":
    unittest.main()
