import { retireTargetAction, setTargetAction } from '@/app/(app)/assessment/actions';
import { ActionForm } from '@/components/assessment/action-form';
import { ReportView } from '@/components/assessment/report-view';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import type { ProtocolDefinition } from '@/lib/assessment/catalog/protocols';
import { getTargets, previewReport, type AssessmentRow } from '@/lib/assessment/server/queries';
import { PITCH_TYPES, type TargetKind } from '@/lib/assessment/types';
import { UNIT_LABELS, formatValue } from '@/lib/assessment/units';

const TARGET_KIND_LABELS: Readonly<Record<TargetKind, string>> = {
  higher_is_better: 'Higher is better',
  lower_is_better: 'Lower is better',
  target_range: 'Target range',
};

export async function ResultsStep({
  row,
  definition,
  isCoach,
}: {
  readonly row: AssessmentRow;
  readonly definition: ProtocolDefinition;
  readonly isCoach: boolean;
}) {
  const [snapshot, targets] = await Promise.all([previewReport(row.id), getTargets(row.athlete_id)]);
  const targetable = definition.metrics.map((item) => requireMetric(item.key)).filter((metric) => metric.scoring === 'targetable');
  const relevant = targets.filter((target) => targetable.some((metric) => metric.key === target.metric_key));

  return (
    <div className="space-y-12">
      <Notice title="This is a live preview">
        It is calculated from what is recorded right now and changes as you edit. Nothing here is shared until you publish, and a
        published report is frozen.
      </Notice>

      <section aria-labelledby="targets-heading" className="space-y-4 print:hidden">
        <h3 id="targets-heading" className="text-2xl text-navy">
          Coach targets
        </h3>
        <p className="max-w-3xl text-slate">
          Measured values (velocity, timing, rates) are scored only against a target the athlete&apos;s development coach sets for
          this athlete. Without a target they are described, not scored. Base Recruits does not supply universal ideal values.
        </p>
        {relevant.length > 0 ? (
          <ul className="divide-y divide-rule border-y border-rule">
            {relevant.map((target) => {
              const metric = requireMetric(target.metric_key);
              const unit = metric.aggregation === 'rate' ? 'percent' : metric.unit;
              return (
                <li key={target.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="font-semibold">{metric.name}</span>
                    {target.pitch_type ? ` (${PITCH_TYPE_LABELS[target.pitch_type]})` : ''}: {TARGET_KIND_LABELS[target.kind]} —{' '}
                    {target.kind === 'target_range'
                      ? `${formatValue(target.value_a, unit)} to ${formatValue(target.value_b, unit)}, falling to 0 over ${formatValue(target.value_c ?? 0, unit)}`
                      : `${formatValue(target.value_a, unit)} → ${formatValue(target.value_b, unit)}`}{' '}
                    <span className="text-sm text-slate">({target.source})</span>
                  </span>
                  {isCoach ? (
                    <ActionForm action={retireTargetAction} fields={{ targetId: target.id }} submitLabel="Retire" size="sm" variant="quiet" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate">No targets set.</p>
        )}
        {isCoach && targetable.length > 0 ? (
          <details className="border-2 border-rule p-4">
            <summary className="cursor-pointer font-semibold text-royal-ink underline">Set a target</summary>
            <ActionForm action={setTargetAction} fields={{ athleteId: row.athlete_id }} submitLabel="Save target" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField id="t-metric" name="metric" label="Metric" required defaultValue="">
                  <option value="">Choose</option>
                  {targetable.map((metric) => (
                    <option key={metric.key} value={metric.key}>
                      {metric.name} ({metric.aggregation === 'rate' ? 'percent' : UNIT_LABELS[metric.unit]})
                    </option>
                  ))}
                </SelectField>
                {row.discipline === 'pitching' ? (
                  <SelectField
                    id="t-pitch"
                    name="pitch_type"
                    label="Pitch type"
                    hint="Required for per-pitch metrics such as velocity and spin; leave as all pitches otherwise."
                    defaultValue=""
                  >
                    <option value="">All pitches</option>
                    {PITCH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {PITCH_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </SelectField>
                ) : null}
                <SelectField id="t-kind" name="kind" label="Kind of target" required defaultValue="higher_is_better">
                  {Object.entries(TARGET_KIND_LABELS).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  id="t-source"
                  name="source"
                  label="Why this target"
                  hint="For example: your last three bullpens, or your season goal."
                  required
                  minLength={3}
                  maxLength={200}
                />
                <TextField
                  id="t-a"
                  name="value_a"
                  type="number"
                  step="any"
                  required
                  label="First value"
                  hint="Higher is better: the value that scores 0. Lower is better: the value that scores 100. Range: the low end."
                />
                <TextField
                  id="t-b"
                  name="value_b"
                  type="number"
                  step="any"
                  required
                  label="Second value"
                  hint="Higher is better: the value that scores 100. Lower is better: the value that scores 0. Range: the high end."
                />
                <TextField
                  id="t-c"
                  name="value_c"
                  type="number"
                  step="any"
                  min={0}
                  label="Range only: distance outside the range that scores 0"
                />
              </div>
              <p className="text-sm text-slate">Rates are entered as percentages (0 to 100). The database checks that the target fits the metric.</p>
            </ActionForm>
          </details>
        ) : null}
      </section>

      {snapshot ? (
        <ReportView snapshot={snapshot} />
      ) : (
        <Notice tone="error">The preview couldn&apos;t be calculated. Refresh the page to try again.</Notice>
      )}
    </div>
  );
}
