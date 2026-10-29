/**
 * Assessment context options. Mirrors the CHECK constraints on
 * public.assessments (a contract test keeps them identical).
 */

import type { DeviceKind, Discipline, PitchType, TimingBasis } from '@/lib/assessment/types';

export const COMPETITION_LEVELS = [
  'youth',
  'high_school',
  'travel',
  'junior_college',
  'four_year_college',
  'adult',
  'other',
] as const;
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];

export const COMPETITION_LEVEL_LABELS: Readonly<Record<CompetitionLevel, string>> = {
  youth: 'Youth (middle school and younger)',
  high_school: 'High school',
  travel: 'Travel or showcase',
  junior_college: 'Junior college',
  four_year_college: 'Four-year college',
  adult: 'Adult amateur',
  other: 'Other',
};

export const BATTING_SIDES = ['right', 'left', 'switch'] as const;
export type BattingSide = (typeof BATTING_SIDES)[number];
export const THROWING_HANDS = ['right', 'left'] as const;
export type ThrowingHand = (typeof THROWING_HANDS)[number];

export const HITTING_DRILLS = ['tee', 'front_toss', 'overhand_bp', 'machine', 'live_bp', 'game'] as const;
export const PITCHING_DRILLS = ['flat_ground', 'bullpen', 'live_bp', 'game'] as const;
export const DRILL_TYPES = ['tee', 'front_toss', 'overhand_bp', 'machine', 'live_bp', 'game', 'flat_ground', 'bullpen'] as const;
export type DrillType = (typeof DRILL_TYPES)[number];

export const DRILL_TYPE_LABELS: Readonly<Record<DrillType, string>> = {
  tee: 'Tee',
  front_toss: 'Front toss',
  overhand_bp: 'Overhand batting practice',
  machine: 'Pitching machine',
  live_bp: 'Live batting practice',
  game: 'Game',
  flat_ground: 'Flat-ground throwing',
  bullpen: 'Bullpen',
};

export function drillTypesFor(discipline: Discipline): readonly DrillType[] {
  return discipline === 'hitting' ? HITTING_DRILLS : PITCHING_DRILLS;
}

export const CAMERA_VIEWS = ['side_facing', 'side_behind', 'front_on', 'rear', 'overhead', 'other'] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];

export const CAMERA_VIEW_LABELS: Readonly<Record<CameraView, string>> = {
  side_facing: 'Side view, camera facing the athlete’s chest',
  side_behind: 'Side view, camera facing the athlete’s back',
  front_on: 'Front view (camera in front of the athlete)',
  rear: 'Rear view (camera behind the athlete)',
  overhead: 'Overhead',
  other: 'Other',
};

export const ENVIRONMENTS = ['indoor', 'outdoor'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const PITCH_TYPE_LABELS: Readonly<Record<PitchType, string>> = {
  four_seam: 'Four-seam fastball',
  two_seam: 'Two-seam fastball',
  sinker: 'Sinker',
  cutter: 'Cutter',
  slider: 'Slider',
  sweeper: 'Sweeper',
  curveball: 'Curveball',
  changeup: 'Changeup',
  splitter: 'Splitter',
  knuckleball: 'Knuckleball',
  other: 'Other pitch',
};

export const DEVICE_KIND_LABELS: Readonly<Record<DeviceKind, string>> = {
  radar: 'Radar',
  ball_tracking: 'Ball or pitch tracking',
  bat_sensor: 'Bat sensor or bat tracking',
  motion_capture: 'Motion capture',
  force_plate: 'Force plate',
  other: 'Other device',
};

export const TIMING_BASIS_LABELS: Readonly<Record<TimingBasis, string>> = {
  real_time: 'Plays at real speed',
  slow_motion: 'Slow motion (known factor)',
  unknown: 'Not sure',
};

/** Age bands derived from the date of birth on the assessment date (the date of birth itself is never copied). */
export const AGE_BANDS = ['13_14', '15_16', '17_18', '19_22', '23_plus', 'unknown'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const AGE_BAND_LABELS: Readonly<Record<AgeBand, string>> = {
  '13_14': '13–14',
  '15_16': '15–16',
  '17_18': '17–18',
  '19_22': '19–22',
  '23_plus': '23 and older',
  unknown: 'Not recorded',
};

export function ageBand(years: number | null): AgeBand {
  if (years === null || !Number.isFinite(years) || years < 13) return 'unknown';
  if (years <= 14) return '13_14';
  if (years <= 16) return '15_16';
  if (years <= 18) return '17_18';
  if (years <= 22) return '19_22';
  return '23_plus';
}

/** Video files the Film Room accepts. Base Recruits does not transcode. */
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export type VideoMimeType = (typeof VIDEO_MIME_TYPES)[number];
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * What the clip picker offers. "video/*" is what makes phones show the photo
 * library (Photos on iPhone, the gallery on Android) next to the camera and
 * files; the extensions help desktop file dialogs. There is no `capture`
 * attribute, because that would open the camera only.
 */
export const VIDEO_PICKER_ACCEPT = 'video/*,.mp4,.m4v,.mov,.webm';

const VIDEO_EXTENSION_TYPES: Readonly<Record<string, VideoMimeType>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
};

/**
 * The accepted type of a chosen video, or null if it is not one we accept.
 * Browsers sometimes report no type, or "video/x-m4v", for clips that are
 * plain MP4 or MOV (some Android galleries, Windows), so the file name's
 * extension decides when the reported type is missing or unfamiliar.
 */
export function videoMimeTypeFor(file: { readonly name: string; readonly type: string }): VideoMimeType | null {
  const reported = file.type.toLowerCase();
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(reported)) return reported as VideoMimeType;
  if (reported === 'video/x-m4v') return 'video/mp4';
  if (reported !== '' && !reported.startsWith('video/') && reported !== 'application/octet-stream') return null;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? (VIDEO_EXTENSION_TYPES[extension] ?? null) : null;
}
export const SLOW_MOTION_MIN_FACTOR = 2;
export const SLOW_MOTION_MAX_FACTOR = 32;
