import 'server-only';

import { cache } from 'react';

import { ARTIFACT_BUCKET } from '@/lib/seamstate/server/worker';
import type { CaptureSetting, ClipVerdict, EvidenceGrade, FailureKind, HittingPillar, JobState } from '@/lib/seamstate/types';
import { createClient } from '@/lib/supabase/server';

/**
 * SeamState reads for the signed-in person. Row-level security decides what
 * is visible (people who can work on the athlete's assessments); nothing here
 * uses the server's storage key.
 */

export interface SeamstateSwitches {
  readonly enabled: boolean;
  readonly dailyLimit: number;
  readonly monthlyLimit: number;
  readonly usedToday: number;
  /** Administrators only. */
  readonly usedThisMonth: number | null;
  /** Clips of athletes under 18 can be analyzed (off until counsel's review, decision L12). */
  readonly minorsEnabled: boolean;
  /** True once the site's privacy wording describes what SeamState sends (F36); while false SeamState stays off. */
  readonly outsideAnalysisDisclosed: boolean;
}

export const getSeamstateSwitches = cache(async (): Promise<SeamstateSwitches | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('seamstate_switches');
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        enabled: boolean;
        daily_limit: number;
        monthly_limit: number;
        used_today: number;
        used_this_month: number | null;
        minors_enabled: boolean;
        outside_analysis_disclosed: boolean;
      }
    | null
    | undefined;
  if (error || !row) return null;
  return {
    enabled: Boolean(row.enabled),
    dailyLimit: row.daily_limit,
    monthlyLimit: row.monthly_limit,
    usedToday: row.used_today,
    usedThisMonth: row.used_this_month,
    minorsEnabled: Boolean(row.minors_enabled),
    outsideAnalysisDisclosed: Boolean(row.outside_analysis_disclosed),
  };
});

export type SeamstatePermission = 'not_open_to_minors' | 'allowed' | 'waiting_for_guardian' | 'not_allowed' | 'unknown';
const PERMISSIONS: readonly string[] = ['not_open_to_minors', 'allowed', 'waiting_for_guardian', 'not_allowed'];

export const getSeamstatePermission = cache(async (athleteId: string): Promise<SeamstatePermission> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('seamstate_permission', { p_athlete_id: athleteId });
  return !error && typeof data === 'string' && PERMISSIONS.includes(data) ? (data as SeamstatePermission) : 'unknown';
});

export interface ClipJob {
  readonly id: string;
  readonly state: JobState;
  readonly failureKind: FailureKind | null;
  readonly failureCode: string | null;
  readonly setting: CaptureSetting;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

interface JobColumns {
  readonly id: string;
  readonly state: JobState;
  readonly failure_kind: FailureKind | null;
  readonly failure_code: string | null;
  readonly created_at: string;
  readonly finished_at: string | null;
}

/** The latest analysis request for each clip. */
export async function getLatestJobsForClips(mediaIds: readonly string[]): Promise<ReadonlyMap<string, ClipJob>> {
  const latest = new Map<string, ClipJob>();
  if (mediaIds.length === 0) return latest;
  const supabase = await createClient();
  const { data } = await supabase
    .from('seamstate_captures')
    .select('media_id, setting, seamstate_jobs(id, state, failure_kind, failure_code, created_at, finished_at)')
    .in('media_id', [...mediaIds]);
  for (const capture of (data ?? []) as unknown as { media_id: string; setting: CaptureSetting; seamstate_jobs: JobColumns[] }[]) {
    for (const job of capture.seamstate_jobs ?? []) {
      const current = latest.get(capture.media_id);
      if (current && current.createdAt >= job.created_at) continue;
      latest.set(capture.media_id, {
        id: job.id,
        state: job.state,
        failureKind: job.failure_kind,
        failureCode: job.failure_code,
        setting: capture.setting,
        createdAt: job.created_at,
        finishedAt: job.finished_at,
      });
    }
  }
  return latest;
}

export interface FindingRow {
  readonly id: string;
  readonly position: number;
  readonly mechanic_key: string;
  readonly pillar: HittingPillar;
  readonly category: 'strength' | 'adjustment' | 'neutral';
  readonly priority: boolean;
  readonly swing_indexes: number[];
  readonly observation: string;
  readonly interpretation: string | null;
  readonly suggested_experiment: string | null;
  readonly reassessment: string | null;
  readonly cue: string | null;
  readonly evidence_frame_ids: string[];
  readonly limitations: string[];
  readonly alternative_explanations: string[];
  readonly eligible_swing_count: number;
  readonly observed_swing_count: number;
  readonly evidence_grade: Exclude<EvidenceGrade, 'insufficient'>;
  readonly evidence_grade_reasons: string[];
  readonly drill_suggestions: unknown;
  readonly review_state: 'provisional' | 'approved' | 'rejected';
  readonly reviewed_at: string | null;
}

export interface ReviewRow {
  readonly id: string;
  readonly finding_id: string | null;
  readonly action: 'approve' | 'reject' | 'note';
  readonly note: string | null;
  readonly reviewer_relation: 'athlete' | 'guardian' | 'development_coach';
  readonly created_at: string;
}

export interface SeamstateReport {
  readonly job: JobColumns & { readonly athlete_id: string };
  readonly capture: {
    readonly media_id: string;
    readonly assessment_id: string;
    readonly setting: CaptureSetting;
    readonly batting_side: 'right' | 'left';
    readonly camera_view: string;
    readonly setting_details: Record<string, unknown>;
    readonly task: string | null;
    readonly devices: string[];
    readonly limitations: string | null;
  };
  readonly analysis: {
    readonly id: string;
    readonly revision: number;
    readonly clip_verdict: ClipVerdict;
    readonly model_id: string | null;
    readonly packet: unknown;
    readonly result: Record<string, unknown>;
    readonly created_at: string;
  } | null;
  readonly findings: readonly FindingRow[];
  readonly reviews: readonly ReviewRow[];
  /** Signed links to the evidence stills the findings cite, by frame id. */
  readonly stills: Readonly<Record<string, string>>;
}

const STILL_LINK_SECONDS = 60 * 60;

export async function getSeamstateReport(jobId: string): Promise<SeamstateReport | null> {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from('seamstate_jobs')
    .select('id, state, failure_kind, failure_code, created_at, finished_at, athlete_id, capture_id')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return null;
  const [captureResult, analysisResult, attemptResult] = await Promise.all([
    supabase
      .from('seamstate_captures')
      .select('media_id, assessment_id, setting, batting_side, camera_view, setting_details, task, devices, limitations')
      .eq('id', (job as { capture_id: string }).capture_id)
      .maybeSingle(),
    supabase
      .from('seamstate_analyses')
      .select('id, revision, clip_verdict, model_id, packet, result, created_at')
      .eq('job_id', jobId)
      .eq('status', 'current')
      .maybeSingle(),
    supabase
      .from('seamstate_job_attempts')
      .select('id')
      .eq('job_id', jobId)
      .eq('stage', 'done')
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const capture = captureResult.data as SeamstateReport['capture'] | null;
  if (!capture) return null;
  const analysis = analysisResult.data as SeamstateReport['analysis'];
  let findings: FindingRow[] = [];
  let reviews: ReviewRow[] = [];
  const stills: Record<string, string> = {};
  if (analysis) {
    const [findingResult, reviewResult] = await Promise.all([
      supabase
        .from('seamstate_findings')
        .select(
          'id, position, mechanic_key, pillar, category, priority, swing_indexes, observation, interpretation, suggested_experiment, reassessment, cue, evidence_frame_ids, limitations, alternative_explanations, eligible_swing_count, observed_swing_count, evidence_grade, evidence_grade_reasons, drill_suggestions, review_state, reviewed_at',
        )
        .eq('analysis_id', analysis.id)
        .order('position'),
      supabase
        .from('seamstate_reviews')
        .select('id, finding_id, action, note, reviewer_relation, created_at')
        .eq('analysis_id', analysis.id)
        .order('created_at'),
    ]);
    findings = (findingResult.data ?? []) as FindingRow[];
    reviews = (reviewResult.data ?? []) as ReviewRow[];
    const attemptId = (attemptResult.data as { id: string } | null)?.id;
    const frameIds = [...new Set(findings.flatMap((finding) => finding.evidence_frame_ids))].filter((id) => /^f\d{6}$/.test(id));
    if (attemptId && frameIds.length > 0) {
      const prefix = `${job.athlete_id}/${capture.media_id}/${jobId}/${attemptId}`;
      const { data: links } = await supabase.storage
        .from(ARTIFACT_BUCKET)
        .createSignedUrls(frameIds.map((id) => `${prefix}/${id}.jpg`), STILL_LINK_SECONDS);
      for (const link of links ?? []) {
        const frameId = link.path?.split('/').pop()?.replace(/\.jpg$/, '');
        if (frameId && link.signedUrl && !link.error) stills[frameId] = link.signedUrl;
      }
    }
  }
  return { job: job as SeamstateReport['job'], capture, analysis, findings, reviews, stills };
}

/** The signed-in athlete's own open SeamState permission, if any (never another person's). */
export async function getOwnSeamstateGrantId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_consent_grants');
  if (error) return null;
  const grant = ((data ?? []) as { grant_id: string; scope: string }[]).find((row) => row.scope === 'seamstate_analysis');
  return grant?.grant_id ?? null;
}
