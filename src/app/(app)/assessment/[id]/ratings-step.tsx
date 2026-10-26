import { recordObservationAction } from '@/app/(app)/assessment/actions';
import { ObservationReview } from '@/app/(app)/assessment/[id]/observation-review';
import { ActionForm } from '@/components/assessment/action-form';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import type { ProtocolDefinition } from '@/lib/assessment/catalog/protocols';
import { getObservations, type AssessmentRow } from '@/lib/assessment/server/queries';
import { pillarsFor } from '@/lib/assessment/types';

const RATINGS = [1, 2, 3, 4, 5] as const;

export async function RatingsStep({
  row,
  definition,
  isCoach,
}: {
  readonly row: AssessmentRow;
  readonly definition: ProtocolDefinition;
  readonly isCoach: boolean;
}) {
  const observations = await getObservations(row.id);
  const mySource = isCoach ? 'development_coach' : 'self';
  const rubricKeys = new Set(definition.metrics.map((item) => item.key).filter((key) => requireMetric(key).scoring === 'rubric'));

  return (
    <div className="space-y-10">
      <div className="max-w-3xl space-y-2">
        <p>
          Rate the whole set of valid {row.discipline === 'hitting' ? 'swings' : 'pitches'}, not your best one. Read the anchor for
          each number and choose the one that fits. If the video doesn&apos;t let you see it, choose “Unable to assess” and say why —
          it is left out of the score instead of counting against anyone.
        </p>
        <p className="text-sm text-slate">
          {isCoach
            ? 'Your ratings are recorded as coach observations.'
            : 'Your ratings are recorded as self-assessed observations. If you have a development coach, their ratings are used instead where both exist.'}
        </p>
      </div>
      {pillarsFor(row.discipline).map((pillarKey) => {
        const keys = [...rubricKeys].filter((key) => requireMetric(key).pillar === pillarKey);
        if (keys.length === 0) return null;
        return (
          <section key={pillarKey} aria-labelledby={`rate-${pillarKey}`} className="space-y-6">
            <h3 id={`rate-${pillarKey}`} className="text-2xl text-navy">
              {PILLARS[pillarKey].name}
            </h3>
            {keys.map((key) => {
              const metric = requireMetric(key);
              const rubric = metric.rubric;
              if (!rubric) return null;
              const recorded = observations.filter((observation) => observation.metric_key === key);
              const mine = recorded.find((observation) => observation.source_kind === mySource);
              const current = mine ? (mine.quality_state === 'unable_to_assess' ? 'unable' : String(mine.value)) : '';
              return (
                <div key={key} className="space-y-4 border-2 border-rule p-5">
                  <div>
                    <h4 className="text-xl font-semibold">{metric.name}</h4>
                    <p className="mt-1 max-w-3xl text-sm">{metric.explanation}</p>
                  </div>
                  <ActionForm
                    action={recordObservationAction}
                    fields={{ assessmentId: row.id, metric: key, evidence: 'observation' }}
                    submitLabel="Save rating"
                    size="sm"
                    testId={`rating-${key}`}
                  >
                    <fieldset className="space-y-2">
                      <legend className="sr-only">{metric.name} rating</legend>
                      {RATINGS.map((rating) => (
                        <label key={rating} className="flex gap-3 rounded-md border-2 border-transparent p-2 has-[:checked]:border-royal-ink has-[:checked]:bg-ice">
                          <input
                            type="radio"
                            name="value"
                            value={rating}
                            defaultChecked={current === String(rating)}
                            required
                            className="mt-1 size-5 shrink-0"
                          />
                          <span>
                            <span className="font-semibold">{rating}</span> — {rubric[rating]}
                          </span>
                        </label>
                      ))}
                      <label className="flex gap-3 rounded-md border-2 border-transparent p-2 has-[:checked]:border-royal-ink has-[:checked]:bg-ice">
                        <input type="radio" name="value" value="unable" defaultChecked={current === 'unable'} className="mt-1 size-5 shrink-0" />
                        <span>
                          <span className="font-semibold">Unable to assess</span> — {rubric.unableToAssess}
                        </span>
                      </label>
                    </fieldset>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <label htmlFor={`why-${key}`} className="block text-sm font-semibold">
                          Why it couldn&apos;t be assessed (only if you chose that)
                        </label>
                        <input
                          id={`why-${key}`}
                          name="reason"
                          maxLength={300}
                          defaultValue={mine?.quality_reason ?? ''}
                          className="block min-h-10 w-full rounded-md border-2 border-field px-2"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`note-${key}`} className="block text-sm font-semibold">
                          Note (optional)
                        </label>
                        <input
                          id={`note-${key}`}
                          name="note"
                          maxLength={500}
                          defaultValue={mine?.note ?? ''}
                          className="block min-h-10 w-full rounded-md border-2 border-field px-2"
                        />
                      </div>
                    </div>
                  </ActionForm>
                  {recorded.length > 0 ? (
                    <div className="space-y-2">
                      <h5 className="font-semibold">Recorded ratings</h5>
                      <ObservationReview assessmentId={row.id} observations={recorded} repetitions={[]} isCoach={isCoach} editable />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
