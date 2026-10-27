/**
 * SeamState — shared vocabulary for automated swing analysis.
 *
 * SeamState is the analysis engine inside Base Recruits Assessment
 * (docs/seamstate.md). It reuses Assessment's athletes, clips, camera views,
 * pillars and drills; this module adds only what automated analysis needs.
 * Framework-free: no React, Next.js or Supabase imports.
 */

import type { CameraView } from '@/lib/assessment/catalog/context';
import type { PillarKey } from '@/lib/assessment/types';

/** Version of the capture questions and their meaning. A change in meaning gets a new version. */
export const CAPTURE_PROTOCOL_VERSION = 'seamstate-capture-v1';
/** Version of the mechanic catalog (catalog/mechanics.ts). */
export const MECHANIC_CATALOG_VERSION = 'seamstate-mechanics-v1';
/** Version of the eligibility thresholds and evidence-grade policy (eligibility.ts, evidence-grade.ts). */
export const EVIDENCE_POLICY_VERSION = 'seamstate-evidence-v1';
/** Version of the structured interpretation contract (schema.ts). */
export const INTERPRETATION_SCHEMA_VERSION = 'seamstate-interpretation-v1';

/** The four supported hitting settings. Live BP and games are not analysed in this release. */
export const CAPTURE_SETTINGS = ['tee', 'front_toss', 'overhand_bp', 'machine'] as const;
export type CaptureSetting = (typeof CAPTURE_SETTINGS)[number];

export const CAPTURE_SETTING_LABELS: Readonly<Record<CaptureSetting, string>> = {
  tee: 'Tee',
  front_toss: 'Front toss',
  overhand_bp: 'Overhand batting practice',
  machine: 'Pitching machine',
};

/** One clip is one batting side; a switch hitter records each side separately. */
export const CLIP_BATTING_SIDES = ['right', 'left'] as const;
export type ClipBattingSide = (typeof CLIP_BATTING_SIDES)[number];

export type HittingPillar = Extract<PillarKey, 'load_timing' | 'barrel_delivery' | 'lower_body_contribution' | 'impact_output'>;

/**
 * Candidate swing events. The last five match Film Room's event markers
 * (assessment_annotations.event_type), so an accepted event becomes a marker.
 * A missing or inapplicable event (no stride) is never a flaw by itself.
 */
export const SWING_EVENTS = ['setup', 'stride_start', 'load_start', 'foot_contact', 'swing_start', 'contact', 'finish'] as const;
export type SwingEvent = (typeof SWING_EVENTS)[number];
export const FILM_ROOM_EVENTS = ['load_start', 'foot_contact', 'swing_start', 'contact', 'finish'] as const satisfies readonly SwingEvent[];

export const EVENT_METHODS = ['pose_rule', 'model', 'human'] as const;
export type EventMethod = (typeof EVENT_METHODS)[number];

/**
 * Where a quantity came from. Kept distinct everywhere it is stored or shown;
 * a phone clip alone can only ever produce the image-plane and video-estimate kinds.
 */
export const PROVENANCE_KINDS = [
  'sensor_measured',
  'video_estimate',
  'image_plane',
  'coach_observed',
  'athlete_reported',
  'unavailable',
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export const FINDING_CATEGORIES = ['strength', 'adjustment', 'neutral', 'unable_to_assess'] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
/** Categories that make a claim about the swing and therefore need evidence. */
export const SUBSTANTIVE_CATEGORIES: readonly FindingCategory[] = ['strength', 'adjustment', 'neutral'];

/** Evidence grades are reasons-backed levels from a versioned policy, never probabilities. */
export const EVIDENCE_GRADES = ['strong', 'moderate', 'limited', 'insufficient'] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

/**
 * Body landmarks by role. Roles are relative to the hitter (lead side faces
 * the pitcher), so one rule works for both batting sides; landmarks.ts maps
 * them to the pose model's left/right points.
 */
export const BODY_ROLES = [
  'head',
  'lead_shoulder',
  'rear_shoulder',
  'lead_elbow',
  'rear_elbow',
  'lead_wrist',
  'rear_wrist',
  'lead_hip',
  'rear_hip',
  'lead_knee',
  'rear_knee',
  'lead_ankle',
  'rear_ankle',
  'lead_foot',
  'rear_foot',
] as const;
export type BodyRole = (typeof BODY_ROLES)[number];

/** Analysis job states. Upload states live on the clip (assessment_media.status). */
export const JOB_STATES = [
  'queued',
  'preprocessing',
  'analyzing',
  'needs_input',
  'complete',
  'partial',
  'failed',
  'cancelled',
] as const;
export type JobState = (typeof JOB_STATES)[number];

/** Why a job failed: the service (never the athlete's fault) or the footage. */
export const FAILURE_KINDS = ['service', 'footage'] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** Overall clip result from the quality gates. */
export const CLIP_VERDICTS = ['suitable', 'limited', 'retake_recommended', 'no_swing_detected', 'subject_selection_required'] as const;
export type ClipVerdict = (typeof CLIP_VERDICTS)[number];

export type { CameraView };
