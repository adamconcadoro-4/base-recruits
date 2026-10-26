import Link from 'next/link';

import {
  addRepetitionsAction,
  deleteRepetitionAction,
  recordRepetitionValuesAction,
  setRepetitionStatusAction,
  updateRepetitionAction,
} from '@/app/(app)/assessment/actions';
import { ObservationReview } from '@/app/(app)/assessment/[id]/observation-review';
import { ActionForm } from '@/components/assessment/action-form';
import { SelectField, TextField } from '@/components/ui/field';
import { StatusChip } from '@/components/ui/status-chip';
import { DEVICE_KIND_LABELS, PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import { requireMetric, type MetricDefinition } from '@/lib/assessment/catalog/metrics';
import type { ProtocolDefinition } from '@/lib/assessment/catalog/protocols';
import { EVIDENCE_LABELS } from '@/lib/assessment/labels';
import {
  getMediaForAssessment,
  getObservations,
  getRepetitions,
  type AssessmentRow,
  type MediaRow,
  type ObservationRow,
  type RepetitionRow,
} from '@/lib/assessment/server/queries';
import { DEVICE_KINDS, PITCH_TYPES } from '@/lib/assessment/types';
import { UNIT_LABELS } from '@/lib/assessment/units';

const smallControl = 'block min-h-10 w-full rounded-md border-2 border-field bg-white px-2';

export async function RepetitionsStep({
  row,
  definition,
  isCoach,
}: {
  readonly row: AssessmentRow;
  readonly definition: ProtocolDefinition;
  readonly isCoach: boolean;
}) {
  const [repetitions, observations, clips] = await Promise.all([
    getRepetitions(row.id),
    getObservations(row.id),
    getMediaForAssessment(row.id),
  ]);
  const pitching = row.discipline === 'pitching';
  const unit = pitching ? 'pitch' : 'swing';
  const valid = repetitions.filter((rep) => rep.status === 'valid');
  const metrics = definition.metrics.map((item) => requireMetric(item.key));
  const entryMetrics = metrics.filter((metric) => metric.granularity === 'repetition' && !metric.derived);
  const derived = metrics.filter((metric) => metric.derived);
  const uploaded = clips.filter((clip) => clip.status === 'uploaded');

  return (
    <div className="space-y-12">
      <section aria-labelledby="reps-heading" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 id="reps-heading" className="text-2xl text-navy">
            {pitching ? 'Pitches' : 'Swings'}
          </h3>
          <p className="font-semibold">
            {valid.length} valid of {repetitions.length} · goal {row.rep_goal}
          </p>
        </div>
        <p className="max-w-3xl text-slate">
          Each {unit} gets a number. Exclude one (with a reason) instead of deleting it if it was a mis-hit drill, a camera problem
          or anything that makes it unrepresentative — the reason stays with the report.
        </p>
        <ActionForm action={addRepetitionsAction} fields={{ assessmentId: row.id }} submitLabel={pitching ? 'Add pitches' : 'Add swings'} variant="secondary" inline>
          <TextField
            id="add-count"
            name="count"
            type="number"
            min={1}
            max={50}
            required
            defaultValue={repetitions.length === 0 ? row.rep_goal : 1}
            label="How many"
            className="w-32"
          />
          {pitching ? (
            <SelectField id="add-pitch-type" name="pitch_type" label="Pitch type" defaultValue="four_seam" className="w-56">
              {PITCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PITCH_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
          ) : null}
        </ActionForm>
        {repetitions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left">
              <caption className="sr-only">{pitching ? 'Pitches' : 'Swings'} in this assessment</caption>
              <thead>
                <tr className="border-b-2 border-rule text-sm text-slate">
                  <th scope="col" className="py-2 pr-3">#</th>
                  <th scope="col" className="py-2 pr-3">Details</th>
                  <th scope="col" className="py-2 pr-3">Status</th>
                  <th scope="col" className="py-2">Exclude, count again or delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {repetitions.map((rep) => (
                  <RepetitionRowView key={rep.id} assessmentId={row.id} rep={rep} pitching={pitching} clips={uploaded} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="values-heading" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 id="values-heading" className="text-2xl text-navy">
            Measurements and charted outcomes
          </h3>
          <Link href={`/assessment/${row.id}/import`} className="font-semibold text-royal-ink underline">
            Import a CSV file instead
          </Link>
        </div>
        <p className="max-w-3xl text-slate">
          Enter what you have, {unit} by {unit}. Leave a box empty if it wasn&apos;t measured — missing values are never counted as
          zero. Measured values need the device that produced them.
        </p>
        {valid.length === 0 ? (
          <p className="text-slate">Add {pitching ? 'pitches' : 'swings'} above first.</p>
        ) : (
          <div className="space-y-6">
            {entryMetrics.map((metric) => (
              <MetricEntry
                key={metric.key}
                assessmentId={row.id}
                metric={metric}
                repetitions={valid}
                observations={observations.filter((observation) => observation.metric_key === metric.key)}
                allRepetitions={repetitions}
                isCoach={isCoach}
              />
            ))}
          </div>
        )}
        {derived.length > 0 ? (
          <p className="text-sm text-slate">
            Calculated automatically from the values above: {derived.map((metric) => metric.name).join(', ')}.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function RepetitionRowView({
  assessmentId,
  rep,
  pitching,
  clips,
}: {
  readonly assessmentId: string;
  readonly rep: RepetitionRow;
  readonly pitching: boolean;
  readonly clips: readonly MediaRow[];
}) {
  return (
    <tr className="align-top">
      <th scope="row" className="py-3 pr-3 text-lg">
        {rep.seq}
      </th>
      <td className="py-3 pr-3">
        <ActionForm
          action={updateRepetitionAction}
          fields={{ assessmentId, repetitionId: rep.id }}
          submitLabel="Save"
          size="sm"
          variant="secondary"
          inline
        >
          {pitching ? (
            <div className="w-40 space-y-1">
              <label htmlFor={`pt-${rep.id}`} className="block text-sm font-semibold">
                Pitch type
              </label>
              <select id={`pt-${rep.id}`} name="pitch_type" defaultValue={rep.pitch_type ?? ''} className={smallControl}>
                <option value="">Not set</option>
                {PITCH_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PITCH_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {clips.length > 0 ? (
            <>
              <div className="w-44 space-y-1">
                <label htmlFor={`clip-${rep.id}`} className="block text-sm font-semibold">
                  Clip
                </label>
                <select id={`clip-${rep.id}`} name="media_id" defaultValue={rep.media_id ?? ''} className={smallControl}>
                  <option value="">None</option>
                  {clips.map((clip) => (
                    <option key={clip.id} value={clip.id}>
                      {clip.label ?? clip.original_name ?? 'Clip'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24 space-y-1">
                <label htmlFor={`time-${rep.id}`} className="block text-sm font-semibold">
                  At (sec)
                </label>
                <input
                  id={`time-${rep.id}`}
                  name="clip_time_s"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={rep.clip_time_ms === null ? '' : rep.clip_time_ms / 1000}
                  className={smallControl}
                />
              </div>
            </>
          ) : null}
          <div className="w-48 space-y-1">
            <label htmlFor={`note-${rep.id}`} className="block text-sm font-semibold">
              Note
            </label>
            <input id={`note-${rep.id}`} name="note" maxLength={300} defaultValue={rep.note ?? ''} className={smallControl} />
          </div>
        </ActionForm>
      </td>
      <td className="py-3 pr-3">
        {rep.status === 'valid' ? (
          <StatusChip tone="neutral">Counts</StatusChip>
        ) : (
          <div className="space-y-1">
            <StatusChip tone="attention">Excluded</StatusChip>
            <p className="text-sm">{rep.exclusion_reason}</p>
          </div>
        )}
      </td>
      <td className="space-y-3 py-3">
        {rep.status === 'valid' ? (
          <ActionForm
            action={setRepetitionStatusAction}
            fields={{ assessmentId, repetitionId: rep.id, status: 'excluded' }}
            submitLabel="Exclude"
            size="sm"
            variant="secondary"
            inline
          >
            <div className="space-y-1">
              <label htmlFor={`why-${rep.id}`} className="block text-sm font-semibold">
                Reason
              </label>
              <input id={`why-${rep.id}`} name="reason" required minLength={3} maxLength={200} className={`${smallControl} w-48`} />
            </div>
          </ActionForm>
        ) : (
          <ActionForm
            action={setRepetitionStatusAction}
            fields={{ assessmentId, repetitionId: rep.id, status: 'valid' }}
            submitLabel="Count again"
            size="sm"
            variant="secondary"
          />
        )}
        <ActionForm
          action={deleteRepetitionAction}
          fields={{ assessmentId, repetitionId: rep.id }}
          submitLabel="Delete"
          size="sm"
          variant="quiet"
          confirm="Delete this repetition? Only repetitions without recorded values can be deleted."
        />
      </td>
    </tr>
  );
}

function MetricEntry({
  assessmentId,
  metric,
  repetitions,
  observations,
  allRepetitions,
  isCoach,
}: {
  readonly assessmentId: string;
  readonly metric: MetricDefinition;
  readonly repetitions: readonly RepetitionRow[];
  readonly observations: readonly ObservationRow[];
  readonly allRepetitions: readonly RepetitionRow[];
  readonly isCoach: boolean;
}) {
  const byRep = new Map(observations.filter((o) => o.repetition_id).map((o) => [o.repetition_id as string, o]));
  const lastDevice = observations.find((o) => o.device_label);
  const needsDevice = metric.requiresDevice;
  const boolean = metric.valueKind === 'boolean';
  const recorded = observations.filter((o) => o.value !== null).length;
  return (
    <details className="border-2 border-rule">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4">
        <span className="font-semibold">{metric.name}</span>
        <span className="text-sm text-slate">
          {recorded} recorded · {boolean ? 'yes or no' : UNIT_LABELS[metric.unit]} · needs {metric.minValidCount}
        </span>
      </summary>
      <div className="space-y-5 border-t-2 border-rule p-4">
        <p className="max-w-3xl text-sm">{metric.explanation}</p>
        {metric.markers ? (
          <p className="text-sm text-slate">
            Best measured by marking two moments on each {metric.discipline === 'hitting' ? 'swing' : 'pitch'} in the Film Room. You
            can also type a value you estimated from video.
          </p>
        ) : null}
        <ActionForm
          action={recordRepetitionValuesAction}
          fields={{ assessmentId, metric: metric.key }}
          submitLabel={`Save ${metric.name.toLowerCase()}`}
          size="sm"
          testId={`entry-${metric.key}`}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {metric.evidence.length > 1 ? (
              <SelectField id={`ev-${metric.key}`} name="evidence" label="Evidence" defaultValue={metric.evidence[0]}>
                {metric.evidence.map((category) => (
                  <option key={category} value={category}>
                    {category === 'observation' ? (isCoach ? 'Coach observation' : 'Self-assessed observation') : EVIDENCE_LABELS[category]}
                  </option>
                ))}
              </SelectField>
            ) : (
              <input type="hidden" name="evidence" value={metric.evidence[0]} />
            )}
            {needsDevice ? (
              <>
                <SelectField
                  id={`dk-${metric.key}`}
                  name="device_kind"
                  label="Device kind"
                  required
                  defaultValue={lastDevice?.device_kind ?? ''}
                >
                  <option value="">Choose</option>
                  {DEVICE_KINDS.filter((kind) => kind !== 'motion_capture' && kind !== 'force_plate').map((kind) => (
                    <option key={kind} value={kind}>
                      {DEVICE_KIND_LABELS[kind]}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  id={`dl-${metric.key}`}
                  name="device_label"
                  label="Device name or model"
                  required
                  maxLength={80}
                  defaultValue={lastDevice?.device_label ?? ''}
                />
              </>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {repetitions.map((rep) => {
              const existing = byRep.get(rep.id);
              const current =
                existing && existing.value !== null ? (boolean ? (existing.value === 1 ? 'yes' : 'no') : String(existing.value)) : '';
              const disabled = metric.perPitchType && !rep.pitch_type;
              return (
                <div key={rep.id} className="space-y-1">
                  <input type="hidden" name={`seq:${rep.id}`} value={rep.seq} />
                  <label htmlFor={`v-${metric.key}-${rep.id}`} className="block text-sm font-semibold">
                    #{rep.seq}
                    {rep.pitch_type ? <span className="font-normal text-slate"> {PITCH_TYPE_LABELS[rep.pitch_type]}</span> : null}
                  </label>
                  {boolean ? (
                    <select id={`v-${metric.key}-${rep.id}`} name={`rep:${rep.id}`} defaultValue={current} className={smallControl} disabled={disabled}>
                      <option value="">—</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <input
                      id={`v-${metric.key}-${rep.id}`}
                      name={`rep:${rep.id}`}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      min={metric.min ?? undefined}
                      max={metric.max ?? undefined}
                      defaultValue={current}
                      disabled={disabled}
                      className={smallControl}
                    />
                  )}
                  {disabled ? <span className="block text-xs text-slate">Set the pitch type first</span> : null}
                </div>
              );
            })}
          </div>
        </ActionForm>
        <div className="space-y-2">
          <h4 className="font-semibold">Recorded values</h4>
          <ObservationReview
            assessmentId={assessmentId}
            observations={observations}
            repetitions={allRepetitions}
            isCoach={isCoach}
            editable
          />
        </div>
      </div>
    </details>
  );
}
