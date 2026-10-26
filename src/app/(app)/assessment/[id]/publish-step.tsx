import Link from 'next/link';

import {
  createReassessmentAction,
  deleteAssessmentAction,
  publishAction,
  reopenAction,
  setAssessmentStatusAction,
  setBaselineAction,
  setReassessmentDateAction,
} from '@/app/(app)/assessment/actions';
import { ActionForm } from '@/components/assessment/action-form';
import { formatDateOnly, formatDateTime } from '@/components/assessment/result-format';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { REVIEW_LABELS } from '@/lib/assessment/labels';
import { getRevisions, listAssessments, previewReport, type AssessmentRow } from '@/lib/assessment/server/queries';

export async function PublishStep({ row, isCoach }: { readonly row: AssessmentRow; readonly isCoach: boolean }) {
  const published = row.status === 'published';
  const [revisions, assessments, preview] = await Promise.all([
    getRevisions(row.id),
    listAssessments(row.athlete_id),
    published ? Promise.resolve(null) : previewReport(row.id),
  ]);
  const baselineChoices = assessments.data.filter(
    (other) => other.id !== row.id && other.discipline === row.discipline && other.status === 'published',
  );
  const today = new Date().toISOString().slice(0, 10);
  const current = revisions.find((revision) => revision.status === 'current');
  const completePillars = preview?.results.pillars.filter((pillar) => pillar.status === 'complete').length ?? 0;
  const incomplete = preview?.results.pillars.filter((pillar) => pillar.status === 'incomplete').length ?? 0;

  return (
    <div className="space-y-12">
      {!published ? (
        <>
          <section aria-labelledby="review-heading" className="space-y-4">
            <h3 id="review-heading" className="text-2xl text-navy">
              Review
            </h3>
            {row.status === 'draft' && !isCoach ? (
              <ActionForm
                action={setAssessmentStatusAction}
                fields={{ assessmentId: row.id, status: 'ready_for_review' }}
                submitLabel="Ask my development coach to review"
                variant="secondary"
              >
                <p className="max-w-3xl text-slate">
                  If you have a development coach connected, they&apos;ll see this assessment is ready. A coach-reviewed report uses
                  their ratings and review; you can also publish it yourself as a self-assessment.
                </p>
              </ActionForm>
            ) : null}
            {isCoach && row.status !== 'reviewed' ? (
              <ActionForm
                action={setAssessmentStatusAction}
                fields={{ assessmentId: row.id, status: 'reviewed' }}
                submitLabel="Mark reviewed"
                variant="secondary"
              >
                <p className="max-w-3xl text-slate">
                  Confirms you have checked the clips, values and ratings. Publishing as the development coach makes it a
                  coach-reviewed report.
                </p>
              </ActionForm>
            ) : null}
            {row.status !== 'draft' ? (
              <ActionForm
                action={setAssessmentStatusAction}
                fields={{ assessmentId: row.id, status: 'draft' }}
                submitLabel="Move back to draft"
                variant="quiet"
              />
            ) : null}
          </section>

          <section aria-labelledby="publish-heading" className="space-y-4">
            <h3 id="publish-heading" className="text-2xl text-navy">
              Publish the report
            </h3>
            {preview ? (
              <p>
                {completePillars} of {preview.results.pillars.length} pillars have a complete score
                {incomplete > 0 ? `; ${incomplete} still need required evidence and will show as incomplete` : ''}.{' '}
                <Link href={`/assessment/${row.id}?step=results`} className="font-semibold text-royal-ink underline">
                  Check the preview
                </Link>
                .
              </p>
            ) : null}
            <ActionForm action={publishAction} fields={{ assessmentId: row.id }} submitLabel="Publish report" pendingLabel="Publishing…" testId="publish-form">
              <p className="max-w-3xl text-slate">
                {isCoach
                  ? 'You are publishing as the athlete’s development coach, so this will be a coach-reviewed report.'
                  : 'You are publishing a self-assessment report. It will say so on every page.'}{' '}
                The report is frozen when published. Corrections later make a new revision; earlier revisions stay in the history.
              </p>
              <TextAreaField id="publish-note" name="note" label="Note on the report (optional)" maxLength={500} className="max-w-2xl" />
            </ActionForm>
          </section>

          {!row.current_revision_id ? (
            <section aria-labelledby="delete-heading" className="space-y-3">
              <h3 id="delete-heading" className="text-2xl text-navy">
                Delete this draft
              </h3>
              <ActionForm
                action={deleteAssessmentAction}
                fields={{ assessmentId: row.id }}
                submitLabel="Delete draft and its clips"
                pendingLabel="Deleting…"
                variant="danger"
                confirm="Delete this draft, its values and its clips? Video files are deleted permanently."
              />
            </section>
          ) : null}
        </>
      ) : (
        <>
          <Notice tone="success" title="Published">
            {current ? `${REVIEW_LABELS[current.review_kind]}, revision ${current.revision}, published ${formatDateTime(current.published_at)}.` : null}{' '}
            <Link href={`/assessment/${row.id}/report`} className="font-semibold text-royal-ink underline">
              Open the report
            </Link>
          </Notice>

          <section aria-labelledby="next-heading" className="space-y-4">
            <h3 id="next-heading" className="text-2xl text-navy">
              What to work on next
            </h3>
            {current ? (
              <p>
                <Link
                  href={`/assessment/training?from=${current.id}&athlete=${row.athlete_id}`}
                  className="font-semibold text-royal-ink underline"
                >
                  Build a training plan from this report
                </Link>{' '}
                — up to three focus areas, with drills chosen from the findings.
              </p>
            ) : null}
          </section>

          <section id="reassess" aria-labelledby="reassess-heading" className="space-y-6">
            <h3 id="reassess-heading" className="text-2xl text-navy">
              Reassessment
            </h3>
            <ActionForm action={setReassessmentDateAction} fields={{ assessmentId: row.id }} submitLabel="Save date" variant="secondary" inline>
              <TextField
                id="due-on"
                name="due_on"
                type="date"
                min={row.assessment_date}
                defaultValue={row.reassessment_due_on ?? ''}
                label="Reassess on"
                hint="Usually at the end of a training block."
              />
            </ActionForm>
            <ActionForm action={createReassessmentAction} fields={{ assessmentId: row.id }} submitLabel="Start the reassessment" inline>
              <TextField
                id="reassess-date"
                name="assessment_date"
                type="date"
                required
                min={row.assessment_date}
                max={today}
                defaultValue={today}
                label="Reassessment date"
                hint="Uses the same protocol and copies the capture details so the results can be compared."
              />
            </ActionForm>
          </section>

          <section aria-labelledby="baseline-heading" className="space-y-4">
            <h3 id="baseline-heading" className="text-2xl text-navy">
              Personal baseline
            </h3>
            <p className="max-w-3xl text-slate">
              Compare this assessment with an earlier one of yours. Only results captured the same way are compared.
            </p>
            {baselineChoices.length > 0 ? (
              <ActionForm action={setBaselineAction} fields={{ assessmentId: row.id }} submitLabel="Save baseline" variant="secondary" inline>
                <SelectField id="baseline" name="baselineId" label="Baseline" defaultValue={row.baseline_assessment_id ?? ''}>
                  <option value="">No baseline</option>
                  {baselineChoices.map((other) => (
                    <option key={other.id} value={other.id}>
                      {formatDateOnly(other.assessment_date)}
                    </option>
                  ))}
                </SelectField>
              </ActionForm>
            ) : (
              <p className="text-sm text-slate">There is no other published {row.discipline} assessment to use yet.</p>
            )}
          </section>

          <section aria-labelledby="reopen-heading" className="space-y-4">
            <h3 id="reopen-heading" className="text-2xl text-navy">
              Correct something
            </h3>
            <ActionForm action={reopenAction} fields={{ assessmentId: row.id }} submitLabel="Reopen for corrections" variant="secondary">
              <TextField
                id="reopen-reason"
                name="reason"
                required
                minLength={3}
                maxLength={300}
                label="What needs correcting"
                hint="Kept with the assessment. The published report stays visible as it is until you publish a new revision."
                className="max-w-2xl"
              />
            </ActionForm>
          </section>
        </>
      )}

      {revisions.length > 0 ? (
        <section aria-labelledby="history-heading" className="space-y-3">
          <h3 id="history-heading" className="text-2xl text-navy">
            Report history
          </h3>
          <ul className="divide-y divide-rule border-y border-rule">
            {revisions.map((revision) => (
              <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  Revision {revision.revision} · {REVIEW_LABELS[revision.review_kind]} · {formatDateTime(revision.published_at)}
                  {revision.status === 'superseded' ? ' · replaced by a later revision' : ' · current'}
                </span>
                <Link href={`/assessment/${row.id}/report?revision=${revision.id}`} className="font-semibold text-royal-ink underline">
                  View
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
