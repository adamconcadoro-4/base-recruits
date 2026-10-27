import { randomUUID } from 'node:crypto';

import Link from 'next/link';

import { JobRefresher } from '@/app/(app)/assessment/[id]/job-refresher';
import { SwingAnalysisForm } from '@/app/(app)/assessment/[id]/swing-analysis-form';
import {
  allowSwingAnalysisAction,
  cancelSwingAnalysisAction,
  stopSwingAnalysisPermissionAction,
} from '@/app/(app)/assessment/seamstate-actions';
import { ActionForm } from '@/components/assessment/action-form';
import { Notice } from '@/components/ui/notice';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import type { AssessmentRelation } from '@/lib/assessment/types';
import { CONSENT_SCOPES } from '@/lib/consent/scopes';
import { failureMessage, isTerminal, JOB_STATE_LABELS } from '@/lib/seamstate/jobs';
import { failureReason } from '@/lib/seamstate/labels';
import type { ClipJob, SeamstatePermission } from '@/lib/seamstate/server/queries';
import type { JobState } from '@/lib/seamstate/types';

const STATE_TONES: Readonly<Record<JobState, ChipTone>> = {
  queued: 'progress',
  preprocessing: 'progress',
  analyzing: 'progress',
  needs_input: 'attention',
  complete: 'positive',
  partial: 'attention',
  failed: 'blocked',
  cancelled: 'neutral',
};

/** Permission for SeamState, shown once above the clips. */
export function SwingAnalysisIntro({
  assessmentId,
  available,
  permission,
  relation,
  grantId,
}: {
  readonly assessmentId: string;
  readonly available: boolean;
  readonly permission: SeamstatePermission;
  readonly relation: AssessmentRelation;
  /** The athlete's own SeamState permission, when the athlete is the one viewing. */
  readonly grantId: string | null;
}) {
  const scope = CONSENT_SCOPES.seamstate_analysis;
  return (
    <section aria-labelledby="seamstate-title" className="max-w-3xl space-y-3 border-2 border-rule p-5">
      <h3 id="seamstate-title" className="text-2xl text-navy">
        SeamState swing analysis
      </h3>
      <p>Record your swing. Understand what is working. Know what to practice next.</p>
      {!available ? (
        <p className="text-slate">Swing analysis isn’t available yet. You can still upload clips and mark them in the Film Room.</p>
      ) : permission === 'not_open_to_minors' ? (
        <p className="text-slate">
          Swing analysis is open to hitters 18 and older for now. You can still upload clips and mark them in the Film Room.
        </p>
      ) : permission === 'allowed' ? (
        <p className="text-sm text-slate">
          Permission is on. Choose a clip below and tell us how it was filmed. Each report is a provisional AI assessment until a
          development coach reviews it.
        </p>
      ) : permission === 'waiting_for_guardian' ? (
        <Notice tone="attention" title="Waiting for a parent or guardian">
          A linked parent or legal guardian needs to approve SeamState analysis from their Base Recruits account before any clip is
          analyzed.
        </Notice>
      ) : permission === 'not_allowed' && relation === 'athlete' ? (
        <div className="space-y-3">
          <p>{scope.description}</p>
          <p className="text-sm text-slate">
            Nothing is sent until you ask for an analysis of a specific clip. If you are under 18, a linked parent or legal guardian must
            approve this too. You can turn it off at any time.
          </p>
          <ActionForm action={allowSwingAnalysisAction} fields={{ assessmentId }} submitLabel="Allow SeamState analysis" variant="secondary" size="sm" />
        </div>
      ) : permission === 'not_allowed' ? (
        <p className="text-slate">The athlete needs to allow SeamState analysis from their own account before a clip can be analyzed.</p>
      ) : (
        <p className="text-slate">We couldn’t load the permission for swing analysis. Refresh the page to try again.</p>
      )}
      {grantId && (permission === 'allowed' || permission === 'waiting_for_guardian') ? (
        <ActionForm
          action={stopSwingAnalysisPermissionAction}
          fields={{ assessmentId, grantId }}
          submitLabel="Turn off SeamState analysis"
          pendingLabel="Turning off…"
          variant="secondary"
          size="sm"
          confirm="Turn off SeamState analysis? Nothing more is sent, and any analysis under way is cancelled. Finished reports stay."
        />
      ) : null}
    </section>
  );
}

/** Analysis status, the report link and the request form for one uploaded hitting clip. */
export function ClipSwingAnalysis({
  assessmentId,
  mediaId,
  job,
  canRequest,
  defaultSide,
  defaultView,
}: {
  readonly assessmentId: string;
  readonly mediaId: string;
  readonly job: ClipJob | undefined;
  /** SeamState is available and the athlete has allowed it. */
  readonly canRequest: boolean;
  readonly defaultSide: 'right' | 'left' | null;
  readonly defaultView: string | null;
}) {
  if (!job && !canRequest) return null;
  const finished = job ? isTerminal(job.state) : true;
  const form = canRequest ? (
    <SwingAnalysisForm assessmentId={assessmentId} mediaId={mediaId} requestKey={randomUUID()} defaultSide={defaultSide} defaultView={defaultView} />
  ) : null;

  return (
    <div className="space-y-4 border-t-2 border-rule pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Swing analysis</p>
        {job ? <StatusChip tone={STATE_TONES[job.state]}>{JOB_STATE_LABELS[job.state]}</StatusChip> : null}
      </div>
      {job && !finished ? (
        <>
          {job.state !== 'needs_input' ? <JobRefresher /> : null}
          {job.state === 'needs_input' ? (
            <p>More than one person is in this video, so we can’t tell which one is the hitter. Cancel, then film again with only the hitter in the frame.</p>
          ) : (
            <p className="text-sm text-slate">This usually takes a few minutes. You can leave this page; the result is saved here.</p>
          )}
          <ActionForm
            action={cancelSwingAnalysisAction}
            fields={{ assessmentId, jobId: job.id }}
            submitLabel="Cancel analysis"
            pendingLabel="Cancelling…"
            variant="secondary"
            size="sm"
          />
        </>
      ) : null}
      {job && (job.state === 'complete' || job.state === 'partial') ? (
        <Link href={`/assessment/${assessmentId}/swing/${job.id}`} className="font-semibold text-royal-ink underline">
          Open the swing report
        </Link>
      ) : null}
      {job?.state === 'failed' && job.failureKind ? (
        <p>
          {failureMessage(job.failureKind)} {failureReason(job.failureKind, job.failureCode) ?? ''}
        </p>
      ) : null}
      {finished && form ? (
        job ? (
          <details>
            <summary className="cursor-pointer font-semibold text-royal-ink underline">Analyze this clip again</summary>
            <div className="mt-4">{form}</div>
          </details>
        ) : (
          form
        )
      ) : null}
    </div>
  );
}
