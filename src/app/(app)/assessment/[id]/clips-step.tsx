import Link from 'next/link';

import { ClipUploader } from '@/app/(app)/assessment/[id]/clip-uploader';
import { removeMediaAction, updateMediaAction } from '@/app/(app)/assessment/media-actions';
import { ActionForm } from '@/components/assessment/action-form';
import { formatDateTime } from '@/components/assessment/result-format';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { CAMERA_VIEWS, CAMERA_VIEW_LABELS, TIMING_BASIS_LABELS } from '@/lib/assessment/catalog/context';
import { getMediaForAssessment, type AssessmentRow } from '@/lib/assessment/server/queries';
import { TIMING_BASES } from '@/lib/assessment/types';

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function ClipsStep({ row, videoEnabled }: { readonly row: AssessmentRow; readonly videoEnabled: boolean }) {
  const clips = await getMediaForAssessment(row.id);
  const ready = clips.filter((clip) => clip.status === 'uploaded');
  const unit = row.discipline === 'hitting' ? 'swings' : 'pitches';

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-2">
        <p>
          Film the {unit} from a steady position. Side views show timing and positions best; add a front or rear view if you
          can. Note the playback speed: timing taken from video depends on it.
        </p>
        <p className="text-sm text-slate">
          Video is stored privately. It is never sent to an outside analysis service, and you can delete a clip at any time.
        </p>
      </div>

      {videoEnabled ? (
        <ClipUploader assessmentId={row.id} />
      ) : (
        <Notice tone="attention" title="Video uploads are switched off for now">
          You can still record ratings, charted outcomes and measured values. Clips can be added once uploads open.
        </Notice>
      )}

      <div className="space-y-4">
        <h3 className="text-2xl text-navy">Clips in this assessment</h3>
        {clips.length === 0 ? (
          <p className="text-slate">No clips yet.</p>
        ) : (
          <ul className="space-y-4">
            {clips.map((clip) => (
              <li key={clip.id} className="space-y-4 border-2 border-rule p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{clip.label ?? clip.original_name ?? 'Clip'}</p>
                    <p className="text-sm text-slate">
                      {clip.camera_view ? CAMERA_VIEW_LABELS[clip.camera_view as keyof typeof CAMERA_VIEW_LABELS] : 'View not recorded'} ·{' '}
                      {TIMING_BASIS_LABELS[clip.timing_basis]}
                      {clip.slowdown_factor ? ` (${clip.slowdown_factor}× slower)` : ''} · {sizeText(clip.byte_size)} · added{' '}
                      {formatDateTime(clip.created_at)}
                    </p>
                    {clip.status === 'pending' ? (
                      <p className="mt-1 text-sm font-semibold text-attention">Upload not finished — remove it and upload again.</p>
                    ) : null}
                  </div>
                  {clip.status === 'uploaded' ? (
                    <Link href={`/assessment/film?clip=${clip.id}`} className="font-semibold text-royal-ink underline">
                      Open in Film Room
                    </Link>
                  ) : null}
                </div>
                <details>
                  <summary className="cursor-pointer font-semibold text-royal-ink underline">Edit or remove</summary>
                  <div className="mt-4 grid gap-6 lg:grid-cols-[2fr_1fr]">
                    <ActionForm
                      action={updateMediaAction}
                      fields={{ assessmentId: row.id, mediaId: clip.id }}
                      submitLabel="Save clip details"
                      variant="secondary"
                      size="sm"
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <TextField id={`label-${clip.id}`} name="label" label="Name" maxLength={80} defaultValue={clip.label ?? ''} />
                        <SelectField id={`view-${clip.id}`} name="camera_view" label="Camera view" defaultValue={clip.camera_view ?? ''}>
                          <option value="">Not recorded</option>
                          {CAMERA_VIEWS.map((view) => (
                            <option key={view} value={view}>
                              {CAMERA_VIEW_LABELS[view]}
                            </option>
                          ))}
                        </SelectField>
                        <SelectField id={`timing-${clip.id}`} name="timing_basis" label="Playback speed" defaultValue={clip.timing_basis}>
                          {TIMING_BASES.map((basis) => (
                            <option key={basis} value={basis}>
                              {TIMING_BASIS_LABELS[basis]}
                            </option>
                          ))}
                        </SelectField>
                        <TextField
                          id={`factor-${clip.id}`}
                          name="slowdown_factor"
                          type="number"
                          min={2}
                          max={32}
                          step={0.5}
                          label="Times slower (slow motion only)"
                          defaultValue={clip.slowdown_factor ?? ''}
                        />
                      </div>
                    </ActionForm>
                    <ActionForm
                      action={removeMediaAction}
                      fields={{ assessmentId: row.id, mediaId: clip.id }}
                      submitLabel="Remove clip and delete file"
                      pendingLabel="Removing…"
                      variant="danger"
                      size="sm"
                      confirm="Remove this clip and permanently delete the video file? Markers and notes on it are removed too."
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        {ready.length > 0 ? (
          <p className="text-sm text-slate">
            Mark key moments (front foot lands, contact, release) on each repetition in the Film Room to turn them into timing
            estimates.
          </p>
        ) : null}
      </div>
    </div>
  );
}
