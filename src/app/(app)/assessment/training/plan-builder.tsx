import { createPlanAction } from '@/app/(app)/assessment/plan-actions';
import { ActionForm } from '@/components/assessment/action-form';
import { DrillDetails } from '@/components/assessment/drill-details';
import { formatDateOnly } from '@/components/assessment/result-format';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { DRILL_REQUIREMENTS, DRILL_REQUIREMENT_LABELS, drillsFor, type DrillRequirement } from '@/lib/assessment/catalog/drills';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { findingsFrom, MAX_FOCUS_AREAS, suggestPlan, type Finding } from '@/lib/assessment/recommendations';
import type { RevisionRow } from '@/lib/assessment/server/queries';

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const focusValue = (finding: Finding) => `${finding.metricKey}|${finding.pitchType ?? ''}`;

/**
 * Builds a plan from one published report. Suggestions come from the
 * report's scored findings by fixed rules (no language model); the person
 * chooses what to keep, edits dosages, and can add other drills.
 */
export function PlanBuilder({
  revision,
  athleteId,
  unavailable,
  isCoach,
}: {
  readonly revision: RevisionRow;
  readonly athleteId: string;
  readonly unavailable: readonly DrillRequirement[];
  readonly isCoach: boolean;
}) {
  const snapshot = revision.snapshot;
  if (!snapshot) return <Notice tone="error">This report could not be read.</Notice>;
  const available = Object.fromEntries(DRILL_REQUIREMENTS.map((item) => [item, !unavailable.includes(item)])) as Record<DrillRequirement, boolean>;
  const suggestion = suggestPlan(revision.discipline, snapshot.results.metrics, { available });
  const findings: Finding[] = [];
  for (const finding of findingsFrom(snapshot.results.metrics)) {
    if (!findings.some((item) => item.metricKey === finding.metricKey)) findings.push(finding);
  }
  const suggestedKeys = new Set(suggestion.suggestions.map((item) => item.drill.key));
  const otherDrills = drillsFor(revision.discipline).filter((drill) => !suggestedKeys.has(drill.key));
  const today = new Date().toISOString().slice(0, 10);
  const discipline = revision.discipline === 'hitting' ? 'Hitting' : 'Pitching';

  return (
    <div className="space-y-8">
      <p className="max-w-3xl">
        From the {discipline.toLowerCase()} report of {formatDateOnly(snapshot.assessment.assessment_date)} (
        {revision.review_kind === 'coach_reviewed' ? 'coach-reviewed' : 'self-assessed'}). Suggestions follow fixed rules: the
        lowest-scoring results with enough evidence, spread across pillars, at most {MAX_FOCUS_AREAS} focus areas and two drills
        each.
      </p>

      <form method="get" action="/assessment/training" className="space-y-3 border-2 border-rule p-4">
        <input type="hidden" name="athlete" value={athleteId} />
        <input type="hidden" name="from" value={revision.id} />
        <fieldset className="space-y-2">
          <legend className="font-semibold">What isn&apos;t available right now?</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {DRILL_REQUIREMENTS.map((item) => (
              <label key={item} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="without" value={item} defaultChecked={unavailable.includes(item)} className="size-5" />
                {DRILL_REQUIREMENT_LABELS[item]}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="min-h-11 rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy hover:bg-ice">
          Update suggestions
        </button>
      </form>

      <ActionForm
        action={createPlanAction}
        fields={{ athleteId, revisionId: revision.id }}
        submitLabel="Create the plan"
        pendingLabel="Creating…"
        testId="plan-builder"
      >
        <div className="grid gap-5 md:grid-cols-3">
          <TextField
            id="plan-title"
            name="title"
            label="Plan name"
            required
            minLength={3}
            maxLength={120}
            defaultValue={`${discipline} block from ${formatDateOnly(snapshot.assessment.assessment_date)}`}
          />
          <TextField id="plan-start" name="start_on" type="date" label="Start" required defaultValue={today} />
          <TextField
            id="plan-review"
            name="review_on"
            type="date"
            label="Review and reassess on"
            required
            defaultValue={addDays(today, 42)}
            hint="Six weeks is a common block length; choose what fits the season."
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-2xl text-navy">Focus areas (up to {MAX_FOCUS_AREAS})</legend>
          {findings.length === 0 ? (
            <Notice>
              This report has no scored result low enough to name a priority. You can still choose drills below — for example to
              keep what is working.
            </Notice>
          ) : (
            findings.map((finding) => (
              <label key={focusValue(finding)} className="flex gap-3 border-2 border-rule p-3 has-[:checked]:border-royal-ink has-[:checked]:bg-ice">
                <input
                  type="checkbox"
                  name="focus"
                  value={focusValue(finding)}
                  defaultChecked={suggestion.focus.some((item) => item.metricKey === finding.metricKey)}
                  className="mt-1 size-5 shrink-0"
                />
                <input type="hidden" name={`summary:${focusValue(finding)}`} value={finding.summary} />
                <span>
                  <span className="block font-semibold">
                    {PILLARS[finding.pillar].name} · {finding.severity === 'priority' ? 'Priority' : 'Watch'}
                  </span>
                  <span className="block text-sm">{finding.summary}</span>
                </span>
              </label>
            ))
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-2xl text-navy">Drills (one to eight)</legend>
          {suggestion.suggestions.map((item) => {
            const value = `${item.drill.key}@${item.drill.version}`;
            return (
              <div key={value} className="space-y-3 border-2 border-rule p-4">
                <label className="flex gap-3">
                  <input type="checkbox" name="drill" value={value} defaultChecked className="mt-1 size-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">{item.drill.name}</span>
                    <span className="block text-sm">{item.reason}</span>
                  </span>
                </label>
                <input type="hidden" name={`reason:${value}`} value={item.reason.slice(0, 600)} />
                <input type="hidden" name={`focus:${value}`} value={item.finding.metricKey} />
                <TextField id={`dosage-${item.drill.key}`} name={`dosage:${value}`} label="Dosage" maxLength={200} required defaultValue={item.drill.dosage} />
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">How to do it</summary>
                  <div className="mt-2">
                    <DrillDetails drill={item.drill} />
                  </div>
                </details>
              </div>
            );
          })}
          {otherDrills.length > 0 ? (
            <details className="border-2 border-dashed border-rule p-4">
              <summary className="cursor-pointer font-semibold text-royal-ink underline">Add other drills from the library</summary>
              <div className="mt-4 space-y-4">
                {otherDrills.map((drill) => {
                  const value = `${drill.key}@${drill.version}`;
                  return (
                    <div key={value} className="space-y-3 border-t border-rule pt-4">
                      <label className="flex gap-3">
                        <input type="checkbox" name="drill" value={value} className="mt-1 size-5 shrink-0" />
                        <span>
                          <span className="block font-semibold">{drill.name}</span>
                          <span className="block text-sm">{drill.purpose}</span>
                        </span>
                      </label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <TextField
                          id={`reason-${drill.key}`}
                          name={`reason:${value}`}
                          label="Why this drill"
                          maxLength={600}
                          defaultValue={`Chosen ${isCoach ? 'by the development coach' : 'by the athlete'} to work on ${drill.pillars.map((key) => PILLARS[key].name).join(' and ')}.`}
                        />
                        <TextField id={`dosage-${drill.key}`} name={`dosage:${value}`} label="Dosage" maxLength={200} defaultValue={drill.dosage} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </fieldset>
        <p className="text-sm text-slate">
          {isCoach
            ? 'Plans you create are approved by you as the development coach.'
            : 'Plans you create are self-directed until a development coach approves them.'}{' '}
          Pitching drills never add throws: count them inside the pitcher&apos;s existing throwing plan.
        </p>
      </ActionForm>
    </div>
  );
}
