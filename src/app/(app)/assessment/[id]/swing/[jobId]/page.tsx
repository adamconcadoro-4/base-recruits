import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { reviewFindingAction } from '@/app/(app)/assessment/seamstate-actions';
import { ActionForm } from '@/components/assessment/action-form';
import { DrillDetails } from '@/components/assessment/drill-details';
import { formatDateTime } from '@/components/assessment/result-format';
import { SelectField, TextAreaField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { CAMERA_VIEW_LABELS, type CameraView } from '@/lib/assessment/catalog/context';
import { drill } from '@/lib/assessment/catalog/drills';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { getAssessment, listAthletes } from '@/lib/assessment/server/queries';
import { mechanic, PHONE_UNAVAILABLE } from '@/lib/seamstate/catalog/mechanics';
import type { DrillSuggestion } from '@/lib/seamstate/drill-rules';
import {
  EVENT_LABELS,
  EVIDENCE_GRADE_LABELS,
  interpretationNotice,
  RELATION_LABELS,
  swingNotCounted,
  VERDICT_LABELS,
  verdictReason,
} from '@/lib/seamstate/labels';
import { evidencePacketSchema, type EvidenceFrame } from '@/lib/seamstate/packet';
import { getSeamstateReport, type FindingRow, type ReviewRow } from '@/lib/seamstate/server/queries';
import { CAPTURE_SETTING_LABELS } from '@/lib/seamstate/types';
import type { SwingContactCheck, UnableToAssess } from '@/lib/seamstate/validate';

export const metadata: Metadata = { title: 'Swing report' };

function mechanicName(key: string): string {
  return mechanic(key)?.name ?? 'Swing feature';
}

function drillSuggestions(value: unknown): DrillSuggestion[] {
  return Array.isArray(value)
    ? value.filter((item): item is DrillSuggestion => typeof item === 'object' && item !== null && typeof (item as DrillSuggestion).drillKey === 'string')
    : [];
}

function ReviewChip({ finding }: { readonly finding: FindingRow }) {
  if (finding.review_state === 'approved') return <StatusChip tone="positive">Approved by a development coach</StatusChip>;
  if (finding.review_state === 'rejected') return <StatusChip tone="blocked">Rejected by a development coach</StatusChip>;
  return <StatusChip tone="neutral">Provisional: not yet reviewed by a coach</StatusChip>;
}

function Stills({
  ids,
  stills,
  frames,
}: {
  readonly ids: readonly string[];
  readonly stills: Readonly<Record<string, string>>;
  readonly frames: ReadonlyMap<string, EvidenceFrame>;
}) {
  return (
    <ul className="flex flex-wrap gap-3">
      {ids.map((id) => {
        const frame = frames.get(id);
        const caption = [
          frame?.swingIndex ? `Swing ${frame.swingIndex}` : null,
          frame?.event ? EVENT_LABELS[frame.event] : null,
          frame ? `${(frame.timeMs / 1000).toFixed(2)} s` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={id} className="w-40 space-y-1">
            {stills[id] ? (
              // Signed, short-lived links to private stills; not suitable for image optimization.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stills[id]} alt={`Still from the clip${caption ? `: ${caption}` : ''}`} className="w-full border-2 border-rule" />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center border-2 border-dashed border-rule p-2 text-center text-xs text-slate">
                Still not available
              </div>
            )}
            <p className="text-xs text-slate">{caption || 'Still'}</p>
          </li>
        );
      })}
    </ul>
  );
}

function FindingReviews({ reviews }: { readonly reviews: readonly ReviewRow[] }) {
  if (reviews.length === 0) return null;
  return (
    <ul className="space-y-2 border-l-4 border-rule pl-4 text-sm">
      {reviews.map((review) => (
        <li key={review.id}>
          <span className="font-semibold">
            {RELATION_LABELS[review.reviewer_relation]}
            {review.action === 'approve' ? ' approved' : review.action === 'reject' ? ' rejected' : ''}
          </span>{' '}
          <span className="text-slate">{formatDateTime(review.created_at)}</span>
          {review.note ? <p>{review.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ReviewForm({
  assessmentId,
  jobId,
  finding,
  isCoach,
  current,
}: {
  readonly assessmentId: string;
  readonly jobId: string;
  readonly finding: FindingRow;
  readonly isCoach: boolean;
  readonly current: boolean;
}) {
  if (!current) return null;
  return (
    <details className="print:hidden">
      <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">{isCoach ? 'Review this finding' : 'Add a note'}</summary>
      <ActionForm
        action={reviewFindingAction}
        fields={{ assessmentId, jobId, findingId: finding.id, ...(isCoach ? {} : { action: 'note' }) }}
        submitLabel={isCoach ? 'Save review' : 'Add note'}
        variant="secondary"
        size="sm"
        className="mt-3 max-w-xl"
      >
        {isCoach ? (
          <SelectField id={`action-${finding.id}`} name="action" label="Decision" defaultValue="approve">
            <option value="approve">Approve: this matches what I see</option>
            <option value="reject">Reject: this does not match what I see</option>
            <option value="note">Note only</option>
          </SelectField>
        ) : null}
        <TextAreaField id={`note-${finding.id}`} name="note" label={isCoach ? 'Note (needed for a note only)' : 'Note'} maxLength={1000} />
      </ActionForm>
    </details>
  );
}

function FindingCard({
  finding,
  mediaId,
  stills,
  frames,
  reviews,
  review,
}: {
  readonly finding: FindingRow;
  readonly mediaId: string;
  readonly stills: Readonly<Record<string, string>>;
  readonly frames: ReadonlyMap<string, EvidenceFrame>;
  readonly reviews: readonly ReviewRow[];
  readonly review: React.ReactNode;
}) {
  return (
    <li className="space-y-3 border-2 border-rule p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="text-xl text-navy">{mechanicName(finding.mechanic_key)}</h4>
        {finding.priority ? <StatusChip tone="progress">Priority</StatusChip> : null}
        <ReviewChip finding={finding} />
      </div>
      <p className="text-sm text-slate">
        {PILLARS[finding.pillar]?.name ?? 'Hitting'} · seen in {finding.observed_swing_count} of {finding.eligible_swing_count}{' '}
        {finding.eligible_swing_count === 1 ? 'swing' : 'swings'} that could be judged
      </p>
      <p>{finding.observation}</p>
      {finding.interpretation ? <p>{finding.interpretation}</p> : null}
      <Stills ids={finding.evidence_frame_ids} stills={stills} frames={frames} />
      {(() => {
        const cited = finding.evidence_frame_ids.map((id) => frames.get(id)).filter((frame): frame is EvidenceFrame => Boolean(frame));
        const moment = cited.find((frame) => frame.event === 'contact') ?? cited[0];
        return moment ? (
          <Link href={`/assessment/film?clip=${mediaId}&t=${Math.round(moment.timeMs)}`} className="inline-block font-semibold text-royal-ink underline print:hidden">
            Show me in the Film Room
          </Link>
        ) : null;
      })()}
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">
          {EVIDENCE_GRADE_LABELS[finding.evidence_grade]}: why, and what else it could be
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            {[...finding.evidence_grade_reasons, ...finding.limitations].map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {finding.alternative_explanations.length > 0 ? (
            <>
              <p className="font-semibold">It could also be</p>
              <ul className="list-disc space-y-1 pl-5">
                {finding.alternative_explanations.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="text-slate">The grade says how much this video supports the finding. It is not a probability that the finding is right.</p>
        </div>
      </details>
      <FindingReviews reviews={reviews} />
      {review}
    </li>
  );
}

function rank(finding: FindingRow): number {
  return (finding.review_state === 'rejected' ? 10 : 0) + (finding.priority ? 0 : 1);
}

export default async function SwingReportPage({ params }: { readonly params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params;
  const [row, athletes, report] = await Promise.all([getAssessment(id), listAthletes(), getSeamstateReport(jobId)]);
  if (!row || !report || report.capture.assessment_id !== row.id) notFound();
  const relation = athletes.data.find((option) => option.athlete_id === row.athlete_id)?.relation;
  const isCoach = relation === 'development_coach';
  const { analysis, findings, reviews, stills, capture } = report;

  const back = (
    <p className="mt-2 text-slate print:hidden">
      <Link href={`/assessment/${row.id}?step=clips`} className="font-semibold text-royal-ink underline">
        Back to the clips
      </Link>
    </p>
  );
  const heading = (
    <div className="mb-8">
      <h1 className="text-5xl text-navy">Swing report</h1>
      <p className="mt-2 text-lg text-slate">
        {CAPTURE_SETTING_LABELS[capture.setting]} · {CAMERA_VIEW_LABELS[capture.camera_view as CameraView] ?? 'Camera view'} · bats{' '}
        {capture.batting_side} · {formatDateTime(analysis?.created_at ?? report.job.created_at)}
      </p>
      {capture.task ? <p className="text-slate">Working on: {capture.task}</p> : null}
      {back}
    </div>
  );

  if (!analysis) {
    return (
      <>
        {heading}
        <Notice title="This report isn’t ready">The analysis has not finished. Its progress shows on the clips page.</Notice>
      </>
    );
  }

  const packet = evidencePacketSchema.safeParse(analysis.packet);
  const frames = new Map((packet.success ? packet.data.frames : []).map((frame) => [frame.frameId, frame]));
  const result = analysis.result as {
    interpretation?: string;
    verdictReasons?: string[];
    unableToAssess?: UnableToAssess[];
    swingContact?: SwingContactCheck[];
  };
  const reviewsFor = (findingId: string) => reviews.filter((item) => item.finding_id === findingId);
  const card = (finding: FindingRow) => (
    <FindingCard
      key={finding.id}
      finding={finding}
      mediaId={capture.media_id}
      stills={stills}
      frames={frames}
      reviews={reviewsFor(finding.id)}
      review={<ReviewForm assessmentId={row.id} jobId={jobId} finding={finding} isCoach={isCoach} current />}
    />
  );
  const sorted = [...findings].sort((a, b) => rank(a) - rank(b) || a.position - b.position);
  const strengths = sorted.filter((finding) => finding.category === 'strength');
  const adjustments = sorted.filter((finding) => finding.category === 'adjustment');
  const neutral = sorted.filter((finding) => finding.category === 'neutral');
  const practice = adjustments.filter((finding) => finding.review_state !== 'rejected').slice(0, 3);
  const unable = result.unableToAssess ?? [];
  const unreviewedDrills = practice.some((finding) => drillSuggestions(finding.drill_suggestions).some((item) => !item.coachReviewed));
  const notCounted = (result.swingContact ?? []).filter((item) => !item.counted);
  const notice = interpretationNotice(result.interpretation);
  const allApproved = findings.length > 0 && findings.every((finding) => finding.review_state === 'approved');

  return (
    <>
      {heading}
      <div className="space-y-12">
        <div className="max-w-3xl space-y-4">
          {findings.length > 0 && !allApproved ? (
            <Notice tone="attention" title="Provisional AI assessment">
              These findings come from an AI review of still frames from this clip, checked against what the video showed. Treat them as a
              starting point until a development coach reviews them. Nothing here is a measurement of speed, force or injury risk.
            </Notice>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold">Video check</p>
            <StatusChip tone={analysis.clip_verdict === 'suitable' ? 'positive' : 'attention'}>{VERDICT_LABELS[analysis.clip_verdict]}</StatusChip>
          </div>
          {(result.verdictReasons ?? []).length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {(result.verdictReasons ?? []).map((code) => (
                <li key={code}>{verdictReason(code)}</li>
              ))}
            </ul>
          ) : null}
          {notCounted.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {notCounted.map((item) => (
                <li key={item.swing}>{swingNotCounted(item.swing, item.contact)}</li>
              ))}
            </ul>
          ) : null}
          {notice ? <Notice>{notice}</Notice> : null}
        </div>

        <section aria-labelledby="effective" className="space-y-4">
          <h2 id="effective" className="text-3xl text-navy">
            What looks effective
          </h2>
          {strengths.length > 0 ? <ul className="space-y-4">{strengths.map(card)}</ul> : <p className="text-slate">Nothing was reported here for this clip.</p>}
        </section>

        <section aria-labelledby="adjustments" className="space-y-4">
          <h2 id="adjustments" className="text-3xl text-navy">
            Possible adjustments
          </h2>
          {adjustments.length > 0 ? (
            <ul className="space-y-4">{adjustments.map(card)}</ul>
          ) : (
            <p className="text-slate">No adjustments were reported for this clip.</p>
          )}
          {neutral.length > 0 ? (
            <>
              <h3 className="text-2xl text-navy">Also noted</h3>
              <ul className="space-y-4">{neutral.map(card)}</ul>
            </>
          ) : null}
        </section>

        <section aria-labelledby="practice" className="space-y-4">
          <h2 id="practice" className="text-3xl text-navy">
            Your next practice
          </h2>
          {practice.length === 0 ? (
            <p className="max-w-3xl">
              There is nothing specific to change from this clip. Film again from the same view in the same setting in a week or two to
              compare.
            </p>
          ) : (
            <>
              <p className="max-w-3xl text-sm text-slate">
                Drills come from the Base Recruits drill library.
                {unreviewedDrills ? ' Drills marked “not yet coach-reviewed” have not been reviewed by a qualified hitting coach yet.' : ''}{' '}
                Amounts are a starting point you can change.
              </p>
              <ol className="max-w-3xl space-y-6">
                {practice.map((finding) => (
                  <li key={finding.id} className="space-y-2">
                    <h3 className="text-xl text-navy">{mechanicName(finding.mechanic_key)}</h3>
                    {finding.suggested_experiment ? <p>{finding.suggested_experiment}</p> : null}
                    {finding.cue ? (
                      <p>
                        <span className="font-semibold">Cue:</span> {finding.cue}
                      </p>
                    ) : null}
                    {drillSuggestions(finding.drill_suggestions).map((suggestion) => {
                      const definition = drill(suggestion.drillKey, suggestion.drillVersion);
                      if (!definition) return null;
                      return (
                        <details key={suggestion.drillKey} className="border-2 border-rule p-4">
                          <summary className="cursor-pointer font-semibold text-royal-ink underline">
                            Drill: {definition.name} ({suggestion.dosage}){suggestion.coachReviewed ? '' : ' · not yet coach-reviewed'}
                          </summary>
                          <div className="mt-3 space-y-3">
                            <p className="text-sm text-slate">{suggestion.rationale}</p>
                            <DrillDetails drill={definition} />
                          </div>
                        </details>
                      );
                    })}
                    {finding.reassessment ? (
                      <p>
                        <span className="font-semibold">Check it again:</span> {finding.reassessment}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        <section aria-labelledby="cannot" className="max-w-3xl space-y-4">
          <h2 id="cannot" className="text-3xl text-navy">
            What this video cannot tell us
          </h2>
          {unable.length > 0 ? (
            <ul className="space-y-3">
              {unable.map((item) => (
                <li key={item.mechanicKey}>
                  <p className="font-semibold">{mechanicName(item.mechanicKey)}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {[...item.reasons, ...item.retakeTips, ...(item.viewRequest ? [item.viewRequest] : [])].map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}
          <p>A phone video cannot measure these. Each needs other equipment:</p>
          <ul className="list-disc space-y-1 pl-5">
            {PHONE_UNAVAILABLE.map((item) => (
              <li key={item.key}>
                <span className="font-semibold">{item.label}:</span> {item.needs}
              </li>
            ))}
          </ul>
        </section>

        <details className="max-w-3xl text-sm text-slate">
          <summary className="cursor-pointer font-semibold text-royal-ink underline">How this report was made</summary>
          <div className="mt-3 space-y-1">
            <p>
              Revision {analysis.revision}. Pose tracking found the swings and picked the stills; {analysis.model_id ? 'an AI model' : 'no AI model'} wrote
              the findings, and each one was checked against the stills it cites before it was saved. Findings are never edited after they are
              saved; a coach&apos;s review is added alongside.
            </p>
            {capture.limitations ? <p>Filming notes: {capture.limitations}</p> : null}
            {capture.devices.length > 0 ? <p>Devices named (nothing was read from them): {capture.devices.join(', ')}</p> : null}
          </div>
        </details>
      </div>
    </>
  );
}
