import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ClipsStep } from '@/app/(app)/assessment/[id]/clips-step';
import { DetailsForm } from '@/app/(app)/assessment/[id]/details-form';
import { PublishStep } from '@/app/(app)/assessment/[id]/publish-step';
import { RatingsStep } from '@/app/(app)/assessment/[id]/ratings-step';
import { RepetitionsStep } from '@/app/(app)/assessment/[id]/repetitions-step';
import { ResultsStep } from '@/app/(app)/assessment/[id]/results-step';
import { athleteOptionLabel } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { AssessmentStatusChip, protocolTitle } from '@/components/assessment/summaries';
import { Notice } from '@/components/ui/notice';
import { requireProtocol } from '@/lib/assessment/catalog/protocols';
import { single, type SearchParams } from '@/lib/assessment/server/page-context';
import { getAssessment, getSwitches, listAthletes } from '@/lib/assessment/server/queries';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = { title: 'Assessment workspace' };

const STEP_KEYS = ['details', 'clips', 'reps', 'ratings', 'results', 'publish'] as const;
type StepKey = (typeof STEP_KEYS)[number];

function stepLabel(step: StepKey, discipline: 'hitting' | 'pitching'): string {
  switch (step) {
    case 'details':
      return 'Details';
    case 'clips':
      return 'Clips';
    case 'reps':
      return discipline === 'hitting' ? 'Swings and measurements' : 'Pitches and measurements';
    case 'ratings':
      return 'Ratings';
    case 'results':
      return 'Results preview';
    case 'publish':
      return 'Review and publish';
  }
}

export default async function AssessmentWorkspacePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [row, athletes, switches] = await Promise.all([getAssessment(id), listAthletes(), getSwitches()]);
  if (!row) notFound();
  const athlete = athletes.data.find((option) => option.athlete_id === row.athlete_id);
  if (!athlete) notFound();

  const definition = requireProtocol(row.protocol_key, row.protocol_version);
  const published = row.status === 'published';
  const requested = single(query.step);
  const step: StepKey = published
    ? 'publish'
    : (STEP_KEYS as readonly string[]).includes(requested ?? '')
      ? (requested as StepKey)
      : 'details';
  const isCoach = athlete.relation === 'development_coach';

  return (
    <>
      <div className="mb-8 space-y-3">
        <h1 className="text-5xl text-navy">
          {row.discipline === 'hitting' ? 'Hitting' : 'Pitching'} assessment
        </h1>
        <p className="text-lg text-slate">
          {formatDateOnly(row.assessment_date)} · {protocolTitle(row)} · {athleteOptionLabel(athlete)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AssessmentStatusChip status={row.status} />
          {row.current_revision_id ? (
            <Link href={`/assessment/${row.id}/report`} className="font-semibold text-royal-ink underline">
              {published ? 'Open the published report' : 'Open the last published report'}
            </Link>
          ) : null}
        </div>
        {row.last_reopen_reason && !published ? (
          <Notice tone="attention" title="Reopened for corrections">
            {row.last_reopen_reason} The published report stays as it was until you publish a new revision.
          </Notice>
        ) : null}
      </div>

      {!published ? (
        <nav aria-label="Assessment steps" className="mb-8">
          <ol className="flex flex-wrap gap-2">
            {STEP_KEYS.map((key, index) => (
              <li key={key}>
                <Link
                  href={`/assessment/${row.id}?step=${key}`}
                  aria-current={key === step ? 'step' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-md border-2 px-3 font-semibold no-underline',
                    key === step ? 'border-royal-ink bg-ice text-navy' : 'border-rule text-slate hover:border-navy hover:text-navy',
                  )}
                >
                  <span aria-hidden="true">{index + 1}.</span> {stepLabel(key, row.discipline)}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <section aria-labelledby="step-title" className="space-y-6">
        <h2 id="step-title" className="text-3xl text-navy">
          {published ? 'Published' : stepLabel(step, row.discipline)}
        </h2>
        {step === 'details' ? (
          <DetailsForm
            assessmentId={row.id}
            discipline={row.discipline}
            version={row.draft_version}
            date={row.assessment_date}
            defaults={{
              competition_level: row.competition_level,
              bats: row.bats,
              throws: row.throws,
              drill_type: row.drill_type,
              equipment: row.equipment,
              bat_details: row.bat_details,
              camera_views: row.camera_views,
              environment: row.environment,
              surface: row.surface,
              capture_limitations: row.capture_limitations,
              notes: row.notes,
              rep_goal: row.rep_goal,
            }}
          />
        ) : step === 'clips' ? (
          <ClipsStep row={row} videoEnabled={Boolean(switches?.video_enabled)} relation={athlete.relation} />
        ) : step === 'reps' ? (
          <RepetitionsStep row={row} definition={definition} isCoach={isCoach} />
        ) : step === 'ratings' ? (
          <RatingsStep row={row} definition={definition} isCoach={isCoach} />
        ) : step === 'results' ? (
          <ResultsStep row={row} definition={definition} isCoach={isCoach} />
        ) : (
          <PublishStep row={row} isCoach={isCoach} />
        )}
      </section>

      {!published && step !== 'publish' ? (
        <p className="mt-10">
          <Link
            href={`/assessment/${row.id}?step=${STEP_KEYS[STEP_KEYS.indexOf(step) + 1] ?? 'publish'}`}
            className="font-semibold text-royal-ink underline"
          >
            Next: {stepLabel(STEP_KEYS[STEP_KEYS.indexOf(step) + 1] ?? 'publish', row.discipline)}
          </Link>
        </p>
      ) : null}
    </>
  );
}
