'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { beginUploadAction, cancelUploadAction, completeUploadAction } from '@/app/(app)/assessment/media-actions';
import { Button } from '@/components/ui/button';
import {
  CAMERA_VIEWS,
  CAMERA_VIEW_LABELS,
  MAX_VIDEO_BYTES,
  SLOW_MOTION_MAX_FACTOR,
  SLOW_MOTION_MIN_FACTOR,
  TIMING_BASIS_LABELS,
  VIDEO_PICKER_ACCEPT,
  videoMimeTypeFor,
} from '@/lib/assessment/catalog/context';
import { TIMING_BASES } from '@/lib/assessment/types';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly percent: number }
  | { readonly kind: 'done'; readonly name: string }
  | { readonly kind: 'error'; readonly message: string };

const controlStyles = 'block w-full rounded-md border-2 border-field bg-white px-3 py-2.5';

/** Reads the clip length in the browser, without uploading anything for it. */
function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration * 1000 : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** Sends the file to the one-time signed link, reporting progress. */
function sendFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('x-upsert', 'false');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(String(request.status))));
    request.onerror = () => reject(new Error('network'));
    request.onabort = () => reject(new Error('aborted'));
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file);
    request.send(body);
  });
}

/**
 * Uploads one clip to private storage: checks type and size first, registers
 * the clip, sends the file with a progress bar, then confirms it. Uploading
 * sends nothing to any analysis service.
 */
export function ClipUploader({ assessmentId }: { readonly assessmentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [timing, setTiming] = useState<string>('real_time');

  async function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    const chosen = inputRef.current?.files?.[0];
    if (!chosen) {
      setPhase({ kind: 'error', message: 'Choose a video first.' });
      return;
    }
    const mimeType = videoMimeTypeFor(chosen);
    if (!mimeType) {
      setPhase({ kind: 'error', message: 'Upload an MP4, MOV or WebM video.' });
      return;
    }
    // Storage files the upload under the type it is sent with, so send the accepted one.
    const file = chosen.type === mimeType ? chosen : new File([chosen], chosen.name, { type: mimeType });
    if (file.size > MAX_VIDEO_BYTES) {
      setPhase({ kind: 'error', message: 'Videos can be up to 200 MB. Trim the clip to the swings or pitches and try again.' });
      return;
    }
    const factorRaw = data.get('slowdown_factor');
    const factor = timing === 'slow_motion' && typeof factorRaw === 'string' && factorRaw !== '' ? Number(factorRaw) : null;
    const label = data.get('label');
    const view = data.get('camera_view');

    setPhase({ kind: 'uploading', percent: 0 });
    const duration = await videoDuration(file);
    const started = await beginUploadAction({
      assessmentId,
      fileName: file.name,
      mimeType,
      byteSize: file.size,
      cameraView: typeof view === 'string' && view !== '' ? view : null,
      timingBasis: timing,
      slowdownFactor: factor,
      label: typeof label === 'string' && label.trim() !== '' ? label.trim() : null,
    });
    if (!started.ok) {
      setPhase({ kind: 'error', message: started.message });
      return;
    }
    try {
      await sendFile(started.uploadUrl, file, (percent) => setPhase({ kind: 'uploading', percent }));
    } catch {
      await cancelUploadAction({ mediaId: started.mediaId });
      setPhase({ kind: 'error', message: 'The upload did not finish. Check your connection and try again.' });
      return;
    }
    const completed = await completeUploadAction({ assessmentId, mediaId: started.mediaId, durationMs: duration });
    if (!completed.ok) {
      await cancelUploadAction({ mediaId: started.mediaId });
      setPhase({ kind: 'error', message: completed.message ?? 'The upload could not be confirmed.' });
      return;
    }
    form.reset();
    setTiming('real_time');
    setPhase({ kind: 'done', name: file.name });
    router.refresh();
  }

  const busy = phase.kind === 'uploading';
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void upload(event.currentTarget);
      }}
      className="space-y-5 border-2 border-rule p-5"
      data-testid="clip-uploader"
    >
      <fieldset disabled={busy} className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label htmlFor="clip-file" className="block font-semibold">
            Video file
          </label>
          <p id="clip-file-hint" className="text-sm text-slate">
            On a phone you can pick a clip from your photo library, record one, or choose a file. MP4, MOV or WebM, up to
            200 MB. Clips are stored privately and are visible only to you and the people you connect.
          </p>
          <input
            ref={inputRef}
            id="clip-file"
            name="file"
            type="file"
            required
            accept={VIDEO_PICKER_ACCEPT}
            aria-describedby="clip-file-hint"
            className="block w-full text-base file:mr-4 file:min-h-11 file:rounded-md file:border-2 file:border-navy file:bg-white file:px-4 file:font-semibold file:text-navy"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="clip-label" className="block font-semibold">
            Name (optional)
          </label>
          <input id="clip-label" name="label" maxLength={80} className={controlStyles} placeholder="e.g. Side view, swings 1–10" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="clip-view" className="block font-semibold">
            Camera view
          </label>
          <select id="clip-view" name="camera_view" className={controlStyles} defaultValue="">
            <option value="">Not recorded</option>
            {CAMERA_VIEWS.map((view) => (
              <option key={view} value={view}>
                {CAMERA_VIEW_LABELS[view]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="clip-timing" className="block font-semibold">
            Playback speed of the file
          </label>
          <p id="clip-timing-hint" className="text-sm text-slate">
            Timing measured from video depends on this. If you are not sure, choose “Not sure” and no timing will be calculated from it.
          </p>
          <select
            id="clip-timing"
            name="timing_basis"
            value={timing}
            onChange={(event) => setTiming(event.target.value)}
            aria-describedby="clip-timing-hint"
            className={controlStyles}
          >
            {TIMING_BASES.map((basis) => (
              <option key={basis} value={basis}>
                {TIMING_BASIS_LABELS[basis]}
              </option>
            ))}
          </select>
        </div>
        {timing === 'slow_motion' ? (
          <div className="space-y-1.5">
            <label htmlFor="clip-factor" className="block font-semibold">
              How many times slower it plays
            </label>
            <input
              id="clip-factor"
              name="slowdown_factor"
              type="number"
              required
              min={SLOW_MOTION_MIN_FACTOR}
              max={SLOW_MOTION_MAX_FACTOR}
              step={0.5}
              className={controlStyles}
              placeholder="e.g. 8 for 240 fps played at 30 fps"
            />
          </div>
        ) : null}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload clip'}
        </Button>
        {phase.kind === 'uploading' ? (
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <progress max={100} value={phase.percent} aria-label="Upload progress" className="h-3 flex-1" />
            <span className="text-sm font-semibold" aria-hidden="true">
              {phase.percent}%
            </span>
          </div>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="text-sm font-semibold text-success-ink">
        {phase.kind === 'done' ? `Uploaded ${phase.name}.` : ''}
      </p>
      {phase.kind === 'error' ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {phase.message}
        </p>
      ) : null}
    </form>
  );
}
