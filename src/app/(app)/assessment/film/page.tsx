import type { Metadata } from 'next';
import Link from 'next/link';

import { FilmRoom, type FilmClip } from '@/app/(app)/assessment/film/film-room';
import { PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { Notice } from '@/components/ui/notice';
import { CAMERA_VIEW_LABELS, PITCH_TYPE_LABELS, TIMING_BASIS_LABELS } from '@/lib/assessment/catalog/context';
import { EVENT_LABELS, eventsFor, requireMetric } from '@/lib/assessment/catalog/metrics';
import { requireProtocol } from '@/lib/assessment/catalog/protocols';
import { athleteContext, athleteQuery, single, type SearchParams } from '@/lib/assessment/server/page-context';
import {
  getAnnotations,
  getAssessment,
  getMedia,
  getMediaForAthlete,
  getObservations,
  getRepetitions,
  isUuid,
  playbackUrl,
  type MediaRow,
} from '@/lib/assessment/server/queries';
import { getAccount } from '@/lib/auth/account';

export const metadata: Metadata = { title: 'Film Room' };

function timingNote(media: MediaRow): string {
  if (media.timing_basis === 'slow_motion') return `slow motion, ${media.slowdown_factor ?? '?'}× slower`;
  return TIMING_BASIS_LABELS[media.timing_basis].toLowerCase();
}

async function loadClip(media: MediaRow): Promise<FilmClip | null> {
  const [url, annotations] = await Promise.all([playbackUrl(media.storage_path), getAnnotations(media.id)]);
  if (!url) return null;
  return {
    id: media.id,
    label: media.label ?? media.original_name ?? 'Clip',
    url,
    timingNote: timingNote(media),
    slowdownFactor: media.slowdown_factor === null ? null : Number(media.slowdown_factor),
    timingKnown: media.timing_basis !== 'unknown',
    annotations,
  };
}

export default async function FilmRoomPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const [{ options, selected, query }, account] = await Promise.all([athleteContext(searchParams), getAccount()]);
  const clipId = single(query.clip);
  const compareId = single(query.compare);
  const startText = single(query.t);
  const startMs = startText && /^\d{1,7}$/.test(startText) ? Number(startText) : null;

  const requestedClip = isUuid(clipId) ? await getMedia(clipId) : null;
  const athleteId = requestedClip?.athlete_id ?? selected?.athlete_id ?? null;
  const library = athleteId ? await getMediaForAthlete(athleteId) : [];
  const clipAthlete = options.find((option) => option.athlete_id === athleteId) ?? selected;

  if (!clipAthlete) {
    return (
      <>
        <PageTitle title="Film Room" />
        <Notice>There is no athlete to show yet.</Notice>
      </>
    );
  }

  const media = requestedClip && requestedClip.status === 'uploaded' ? requestedClip : null;
  let player = null;
  if (media) {
    const [assessment, repetitions, observations, clip, compareMedia] = await Promise.all([
      getAssessment(media.assessment_id),
      getRepetitions(media.assessment_id),
      getObservations(media.assessment_id),
      loadClip(media),
      isUuid(compareId) && compareId !== media.id ? getMedia(compareId) : Promise.resolve(null),
    ]);
    const compare = compareMedia && compareMedia.status === 'uploaded' ? await loadClip(compareMedia) : null;
    if (assessment && clip) {
      const protocolDefinition = requireProtocol(assessment.protocol_key, assessment.protocol_version);
      const intervalMetrics = protocolDefinition.metrics
        .map((item) => requireMetric(item.key))
        .filter((metric) => metric.markers)
        .map((metric) => ({
          key: metric.key,
          name: metric.name,
          start: metric.markers?.start ?? '',
          end: metric.markers?.end ?? '',
          recorded: observations.filter((o) => o.metric_key === metric.key && o.repetition_id).map((o) => o.repetition_id as string),
        }));
      player = (
        <FilmRoom
          key={`${media.id}:${compare?.id ?? ''}`}
          clip={clip}
          compare={compare}
          startMs={startMs}
          assessmentId={assessment.id}
          editable={assessment.status !== 'published'}
          viewerId={account.userId ?? ''}
          repetitions={repetitions
            .filter((rep) => rep.status === 'valid')
            .map((rep) => ({
              id: rep.id,
              seq: rep.seq,
              label: `#${rep.seq}${rep.pitch_type ? ` ${PITCH_TYPE_LABELS[rep.pitch_type]}` : ''}`,
            }))}
          eventTypes={eventsFor(assessment.discipline).map((key) => ({ key, label: EVENT_LABELS[key] }))}
          intervalMetrics={intervalMetrics}
        />
      );
    }
  }

  const q = athleteQuery(clipAthlete, '&');
  return (
    <>
      <PageTitle title="Film Room">
        Step through clips frame by frame, mark key moments, draw on a frame and compare two clips side by side. Clips stay private.
      </PageTitle>
      <div className="space-y-10">
        <AthletePicker options={options} selected={clipAthlete} action="/assessment/film" />
        {clipId && !media ? <Notice tone="attention">That clip isn&apos;t available. Choose one below.</Notice> : null}
        {media && !player ? <Notice tone="error">The clip couldn&apos;t be loaded. Refresh to try again.</Notice> : null}
        {player}
        <section aria-labelledby="library" className="space-y-3">
          <h2 id="library" className="text-3xl text-navy">
            Clips
          </h2>
          {library.length === 0 ? (
            <p className="text-slate">No clips yet. Upload clips from an assessment&apos;s Clips step.</p>
          ) : (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {library.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="font-semibold">{item.label ?? item.original_name ?? 'Clip'}</span>
                    <span className="text-sm text-slate">
                      {' '}
                      · {item.camera_view ? CAMERA_VIEW_LABELS[item.camera_view as keyof typeof CAMERA_VIEW_LABELS] : 'view not recorded'} ·{' '}
                      {formatDateOnly(item.created_at)}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-4">
                    <Link href={`/assessment/film?clip=${item.id}${q}`} className="font-semibold text-royal-ink underline" aria-current={item.id === media?.id ? 'true' : undefined}>
                      {item.id === media?.id ? 'Open (showing)' : 'Open'}
                    </Link>
                    {media && item.id !== media.id ? (
                      <Link href={`/assessment/film?clip=${media.id}&compare=${item.id}${q}`} className="font-semibold text-royal-ink underline">
                        Compare side by side
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
