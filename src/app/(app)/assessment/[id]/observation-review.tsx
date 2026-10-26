import { deleteObservationAction, setObservationQualityAction } from '@/app/(app)/assessment/actions';
import { ActionForm } from '@/components/assessment/action-form';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { DEVICE_KIND_LABELS } from '@/lib/assessment/catalog/context';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { ENTRY_METHOD_LABELS, EVIDENCE_LABELS, QUALITY_LABELS, SOURCE_LABELS } from '@/lib/assessment/labels';
import type { ObservationRow, RepetitionRow } from '@/lib/assessment/server/queries';
import type { QualityState } from '@/lib/assessment/types';
import { formatValue } from '@/lib/assessment/units';

const QUALITY_TONES: Readonly<Record<QualityState, ChipTone>> = {
  not_reviewed: 'neutral',
  usable: 'positive',
  limited: 'attention',
  excluded: 'blocked',
  unable_to_assess: 'neutral',
};

/**
 * The recorded values for one metric, each with its evidence and quality, and
 * the review controls this viewer may use. The database enforces who may
 * review what; the controls only mirror it.
 */
export function ObservationReview({
  assessmentId,
  observations,
  repetitions,
  isCoach,
  editable,
}: {
  readonly assessmentId: string;
  readonly observations: readonly ObservationRow[];
  readonly repetitions: readonly RepetitionRow[];
  readonly isCoach: boolean;
  readonly editable: boolean;
}) {
  if (observations.length === 0) return <p className="text-sm text-slate">Nothing recorded yet.</p>;
  const seq = new Map(repetitions.map((rep) => [rep.id, rep.seq]));
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {observations.map((observation) => {
        const definition = requireMetric(observation.metric_key);
        const mine = isCoach || observation.source_kind === 'self';
        const canReview = editable && mine && observation.quality_state !== 'unable_to_assess';
        const canRemove = editable && mine;
        return (
          <li key={observation.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {observation.repetition_id ? <span className="font-semibold">#{seq.get(observation.repetition_id) ?? '?'}</span> : null}
              <span className="font-semibold">
                {observation.quality_state === 'unable_to_assess'
                  ? 'Unable to assess'
                  : definition.valueKind === 'boolean'
                    ? observation.value === 1
                      ? 'Yes'
                      : 'No'
                    : formatValue(observation.value, definition.unit)}
              </span>
              <StatusChip tone={QUALITY_TONES[observation.quality_state]}>{QUALITY_LABELS[observation.quality_state]}</StatusChip>
              <span className="text-sm text-slate">
                {observation.evidence_category === 'observation'
                  ? `${SOURCE_LABELS[observation.source_kind]} observation`
                  : EVIDENCE_LABELS[observation.evidence_category]}{' '}
                · {ENTRY_METHOD_LABELS[observation.entry_method].toLowerCase()}
                {observation.device_kind ? ` · ${DEVICE_KIND_LABELS[observation.device_kind]}: ${observation.device_label ?? ''}` : ''}
                {observation.source_value !== null && observation.source_unit && observation.source_unit !== observation.unit
                  ? ` · from ${observation.source_value} ${observation.source_unit}`
                  : ''}
              </span>
            </div>
            {observation.quality_reason ? <p className="text-sm">Reason: {observation.quality_reason}</p> : null}
            {observation.note ? <p className="text-sm">Note: {observation.note}</p> : null}
            {canReview || canRemove ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-royal-ink underline">
                  {canReview ? 'Review or remove' : 'Remove'}
                </summary>
                <div className="mt-3 flex flex-wrap items-end gap-6">
                  {canReview ? (
                    <ActionForm
                      action={setObservationQualityAction}
                      fields={{ assessmentId, observationId: observation.id }}
                      submitLabel="Save review"
                      variant="secondary"
                      size="sm"
                      inline
                    >
                      <div className="space-y-1">
                        <label htmlFor={`quality-${observation.id}`} className="block font-semibold">
                          Quality
                        </label>
                        <select
                          id={`quality-${observation.id}`}
                          name="quality"
                          defaultValue={observation.quality_state}
                          className="block min-h-10 rounded-md border-2 border-field bg-white px-2"
                        >
                          <option value="not_reviewed">Not reviewed</option>
                          <option value="usable">Usable</option>
                          <option value="limited">Limited (counts, flagged)</option>
                          <option value="excluded">Excluded (does not count)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`reason-${observation.id}`} className="block font-semibold">
                          Reason (for limited or excluded)
                        </label>
                        <input
                          id={`reason-${observation.id}`}
                          name="reason"
                          maxLength={300}
                          defaultValue={observation.quality_reason ?? ''}
                          className="block min-h-10 w-64 rounded-md border-2 border-field px-2"
                        />
                      </div>
                    </ActionForm>
                  ) : null}
                  {canRemove ? (
                    <ActionForm
                      action={deleteObservationAction}
                      fields={{ assessmentId, observationId: observation.id }}
                      submitLabel="Remove value"
                      pendingLabel="Removing…"
                      variant="danger"
                      size="sm"
                      confirm="Remove this value? It will no longer count in the results."
                    />
                  ) : null}
                </div>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
