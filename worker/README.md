# SeamState worker

Turns one swing clip into an evidence packet: decoded facts about the file, the hitter's swings with their events, and
cropped evidence stills. Design: [`docs/seamstate.md`](../docs/seamstate.md) §3–4.

The worker holds **no database and no AI-provider credentials**. Per job attempt it receives one short-lived signed link
to read one clip, reports progress to the app, asks the app for signed upload links for exactly the stills it made, and
sends the packet. Every message both ways is signed (HMAC-SHA256, five-minute window). When the app answers
`{"continue": false}` (cancelled, deleted, a newer attempt, permission withdrawn, or SeamState switched off) it stops.

| Stage | Module | What it does | What it never does |
| --- | --- | --- | --- |
| Inspect | `media.py` | Container from the file's bytes; codec, size, rotation; frame rate and variable-rate check from decoded timestamps | Trust the filename or the container's claimed frame rate |
| Prepare | `media.py` | Decodes every frame at source timing (`-fps_mode passthrough`), upright, at most 960 px | Generate or interpolate frames |
| Track | `pose.py`, `analysis.py` | MediaPipe Pose Landmarker (up to 4 people); links people across frames; the clearly larger candidate is the hitter, otherwise `subject_selection_required` | Silently pick the pitcher or a coach |
| Swings | `analysis.py` | Swings from hand speed (body heights per second of real time); events from hand and lead-ankle motion; gaps stay gaps | Invent a swing, or fill an event whose landmarks were hidden |
| Evidence | `evidence.py` | Stills at each event and around contact, swing start and foot contact, cropped to the hitter, JPEG without metadata; the clip verdict | Send the whole video or report the ball's release |

Contact is estimated from peak hand speed: the bat and ball are not tracked, so no bat speed, exit velocity, force or
3D claim can come from this worker.

## Running the tests

```bash
cd worker
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
# The real-model test runs when the pinned model file is present:
curl -fsSL -o /tmp/pose_landmarker_full.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task
SEAMSTATE_POSE_MODEL=/tmp/pose_landmarker_full.task .venv/bin/python -m unittest discover -s tests -t .
```

Needs `ffmpeg` and, for MediaPipe, `libegl1` and `libgles2`. Tests use generated video and scripted synthetic people
only. `tests/fixtures/synthetic_packet.json` is shared with the TypeScript tests (`tests/unit/seamstate.test.ts`) so the
packet the worker builds and the schema the app checks stay in step; regenerate it with `UPDATE_FIXTURES=1`.

The synthetic tests prove the rules behave as written. They do not show the events are accurate on real swings; that
needs the authorized adult clips and the coach-reviewed evaluation in `docs/seamstate.md` §9.

## Configuration

| Variable | Meaning |
| --- | --- |
| `SEAMSTATE_WORKER_SECRET` | Shared signing secret (32+ characters), the same value as the app's |
| `SEAMSTATE_CALLBACK_URL` | The app's callback endpoint (https) |
| `SEAMSTATE_MEDIA_ORIGIN` | The Supabase project origin; clip and upload links must be signed storage links on it |
| `SEAMSTATE_POSE_MODEL` | Path to the pinned pose model (set in the image) |
| `PORT` | Set by Cloud Run |

## Deploying (needs Adam's go-ahead and the Google Cloud project)

Build from this folder and deploy to Cloud Run with CPU always allocated (the worker keeps processing after it answers
`202`), one request per instance, and scale to zero. The service is reachable, but every request must carry the app's signature
(anything else gets `401`), so the app needs no Google credentials:

```bash
gcloud run deploy seamstate-worker --source worker --region us-east4 --no-cpu-throttling --concurrency 1 \
  --min-instances 0 --max-instances 2 --memory 2Gi --cpu 2 --timeout 900 --allow-unauthenticated \
  --set-secrets SEAMSTATE_WORKER_SECRET=seamstate-worker-secret:latest \
  --set-env-vars SEAMSTATE_CALLBACK_URL=https://<site>/api/seamstate/callback,SEAMSTATE_MEDIA_ORIGIN=https://<project>.supabase.co
```

## Pinned versions

| Component | Version | Licence |
| --- | --- | --- |
| MediaPipe | 1.1.1 | Apache-2.0 |
| Pose model | `pose_landmarker_full` float16 v1, sha256 `5134a3aa…11b1` | To confirm from the MediaPipe model card before launch |
| OpenCV (headless) | 5.0.0.93 | Apache-2.0 |
| NumPy | 2.5.4 | BSD-3-Clause |
