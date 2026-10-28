# SeamState worker for Google Cloud Run (CPU only).
# Deploy with CPU always allocated (--no-cpu-throttling): the worker answers
# 202 and keeps processing the clip after the response. One clip at a time
# (--concurrency=1); scale to zero when idle.
FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libegl1 libgles2 curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Pinned pose model; the build fails if the file is not the expected one.
ARG POSE_MODEL_URL=https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task
ARG POSE_MODEL_SHA256=5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1
RUN mkdir -p /models \
 && curl -fsSL -o /models/pose_landmarker_full.task "${POSE_MODEL_URL}" \
 && echo "${POSE_MODEL_SHA256}  /models/pose_landmarker_full.task" | sha256sum -c -

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY seamstate_worker ./seamstate_worker

RUN useradd --system --uid 10001 worker
USER worker
ENV PYTHONUNBUFFERED=1 SEAMSTATE_POSE_MODEL=/models/pose_landmarker_full.task
CMD ["python", "-m", "seamstate_worker.server"]
