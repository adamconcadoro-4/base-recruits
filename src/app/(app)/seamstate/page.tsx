import type { Metadata } from 'next';
import Link from 'next/link';

import { ClipSwingAnalysis, SwingAnalysisIntro } from '@/app/(app)/seamstate/swing-analysis';
import { ClipUploader } from '@/app/(app)/assessment/[id]/clip-uploader';
import { removeMediaAction } from '@/app/(app)/assessment/media-actions';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateTime } from '@/components/assessment/result-format';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { CAMERA_VIEW_LABELS, type CameraView } from '@/lib/assessment/catalog/context';
import { athleteContext, type SearchParams } from '@/lib/assessment/server/page-context';
import { getMediaForAssessment, getSeamstateHolderId, getSwitches, getVideoOpen } from '@/lib/assessment/server/queries';
import { getAccount } from '@/lib/auth/account';
import { JOB_STATE_LABELS } from '@/lib/seamstate/jobs';
import { seamstateReadiness } from '@/lib/seamstate/server/config';
import {
  getLatestJobsForClips,
  getOwnSeamstateGrantId,
  getSeamstatePermission,
  getSeamstateSwitches,
  listSeamstateReports,
} from '@/lib/seamstate/server/queries';
import { CAPTURE_SETTING_LABELS } from '@/lib/seamstate/types';

export const metadata: Metadata = { title: 'SeamState' };

const PROMISE = 'Upload a swing clip. See what is working. Know what to practice next.';

export default async function SeamstatePage({ searchParams }: { readonly searchParams: SearchParams }) {
  const [account, context] = await Promise.all([getAccount(), athleteContext(searchParams)]);
  const { options, selected, failed } = context;

  if (!selected) {
    return (
      <>
        <PageTitle title="SeamState">{PROMISE}</PageTitle>
        {failed ? (
          <Notice tone="error">Your athletes didn&apos;t load. Refresh the page to try again.</Notice>
        ) : account.roles.includes('parent') ? (
          <Notice title="Nothing shared with you yet">Your athlete can share with you from their Assessment connections page.</Notice>
        ) : (
          <Notice title="SeamState is for hitters, their families and their development coaches">
            Create an athlete account to get swing reports on your own clips.
          </Notice>
        )}
      </>
    );
  }

  const athleteId = selected.athlete_id;
  const [assessmentSwitches, switches, videoOpen, permission, grantId, holderId, reports] = await Promise.all([
    getSwitches(),
    getSeamstateSwitches(),
    getVideoOpen(athleteId),
    getSeamstatePermission(athleteId),
    selected.relation === 'athlete' ? getOwnSeamstateGrantId() : Promise.resolve(null),
    getSeamstateHolderId(athleteId),
    listSeamstateReports(athleteId),
  ]);
  const clips = holderId ? (await getMediaForAssessment(holderId)).filter((clip) => clip.status === 'uploaded') : [];
  const jobs = await getLatestJobsForClips(clips.map((clip) => clip.id));

  const on = Boolean(assessmentSwitches?.enabled && assessmentSwitches.video_enabled && switches?.enabled);
  const available = on && seamstateReadiness().ready;
  const canRequest = available && videoOpen && permission === 'allowed';

  return (
    <>
      <PageTitle title="SeamState">{PROMISE}</PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/seamstate" />

        <div className="max-w-3xl space-y-3">
          <p>
            SeamState is separate from an Assessment. An Assessment is a full evaluation with scores, coach ratings and a drill plan.
            SeamState looks at one clip and gives you a swing report. You don’t need to start an assessment to use it.
          </p>
          <ol className="list-decimal space-y-1 pl-6">
            <li>Allow SeamState (once).</li>
            <li>Upload a clip of a few swings, filmed from the side.</li>
            <li>Tell us how it was filmed and ask for a report.</li>
          </ol>
          <p className="text-sm text-slate">
            Video is stored privately, and you can delete a clip at any time. Nothing is sent to an outside analysis service unless you
            ask for a SeamState swing analysis. Then our own video service reads that clip, and only still frames, cropped to the
            hitter and without a name, go to our AI provider.
          </p>
          {switches ? (
            <p className="text-sm text-slate">
              Each person can ask for up to {switches.dailyLimit} reports a day and {switches.personMonthlyLimit} in 30 days. You have used{' '}
              {switches.usedToday} today and {switches.usedLast30Days} in the last 30 days.
            </p>
          ) : null}
        </div>

        {!on ? (
          <Notice tone="attention" title="SeamState isn’t open yet">
            Reports can’t be requested right now. Past reports below can still be opened.
          </Notice>
        ) : !videoOpen ? (
          <Notice tone="attention" title="SeamState is for hitters 18 and older">
            {selected.relation === 'athlete'
              ? 'Clips can be added once you are 18, or if your date of birth is missing, once it is recorded on your account.'
              : 'Clips can be added once this athlete is 18.'}
          </Notice>
        ) : (
          <>
            <SwingAnalysisIntro available={available} permission={permission} relation={selected.relation} grantId={grantId} />
            <DashboardSection id="upload" title="Upload a clip">
              <ClipUploader seamstateAthleteId={athleteId} />
            </DashboardSection>
          </>
        )}

        {clips.length > 0 ? (
          <DashboardSection id="clips" title="Your SeamState clips">
            <ul className="space-y-4">
              {clips.map((clip) => (
                <li key={clip.id} className="space-y-4 border-2 border-rule p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{clip.label ?? clip.original_name ?? 'Clip'}</p>
                      <p className="text-sm text-slate">
                        {clip.camera_view ? CAMERA_VIEW_LABELS[clip.camera_view as CameraView] : 'View not recorded'} · added{' '}
                        {formatDateTime(clip.created_at)}
                      </p>
                    </div>
                    <Link href={`/assessment/film?clip=${clip.id}`} className="font-semibold text-royal-ink underline">
                      Watch in Film Room
                    </Link>
                  </div>
                  <ClipSwingAnalysis
                    mediaId={clip.id}
                    job={jobs.get(clip.id)}
                    canRequest={canRequest}
                    defaultSide={null}
                    defaultView={clip.camera_view}
                  />
                  <ActionForm
                    action={removeMediaAction}
                    fields={{ assessmentId: holderId ?? '', mediaId: clip.id }}
                    submitLabel="Remove clip and delete file"
                    pendingLabel="Removing…"
                    variant="danger"
                    size="sm"
                    confirm="Remove this clip and permanently delete the video file? Its SeamState reports are removed too."
                  />
                </li>
              ))}
            </ul>
          </DashboardSection>
        ) : null}

        <DashboardSection id="reports" title="SeamState reports">
          {reports.failed ? <Notice tone="error">Some reports didn&apos;t load. Refresh to try again.</Notice> : null}
          {reports.data.length === 0 ? (
            <p className="text-slate">No reports yet.</p>
          ) : (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {reports.data.map((report) => (
                <li key={report.jobId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="font-semibold">{report.clipName ?? 'Clip'}</span>{' '}
                    <span className="text-slate">
                      · {CAPTURE_SETTING_LABELS[report.setting]} · {formatDateTime(report.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusChip tone={report.state === 'complete' ? 'positive' : report.state === 'failed' ? 'blocked' : 'neutral'}>
                      {JOB_STATE_LABELS[report.state]}
                    </StatusChip>
                    {report.state === 'complete' || report.state === 'partial' ? (
                      <Link href={`/seamstate/report/${report.jobId}`} className="font-semibold text-royal-ink underline">
                        Open report
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      </div>
    </>
  );
}
