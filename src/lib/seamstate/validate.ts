/**
 * Output verification for SeamState interpretations (docs/seamstate.md §5).
 *
 * The model's response is untrusted. Every finding must name a catalog
 * mechanic the clip is eligible for, reference frames that exist in the
 * evidence packet and belong to the swings it talks about, and stay inside
 * the claim limits below. Anything else is removed with a reason code.
 * A limited truthful report is preferred to a complete-looking invented one.
 *
 * Text checks are deliberately strict word patterns: a rejected sound
 * finding costs less than a published unsupported one.
 */

import { MECHANICS, mechanic as findMechanic, type MechanicDefinition } from '@/lib/seamstate/catalog/mechanics';
import { mechanicEligibility, type MechanicEligibility } from '@/lib/seamstate/eligibility';
import { gradeEvidence } from '@/lib/seamstate/evidence-grade';
import type { EvidencePacket } from '@/lib/seamstate/packet';
import { modelOutputSchema, type ModelFinding, type SwingContact } from '@/lib/seamstate/schema';
import { SUBSTANTIVE_CATEGORIES, type EvidenceGrade, type FindingCategory } from '@/lib/seamstate/types';

/** At most this many adjustments are marked as priorities in one report. */
export const MAX_PRIORITIES = 3;

export const REJECTION_CODES = [
  'unknown_mechanic',
  'not_eligible',
  'no_evidence',
  'evidence_not_found',
  'evidence_other_swing',
  'evidence_untracked',
  'swing_not_assessable',
  'swing_without_contact',
  'pattern_from_too_few_swings',
  'numeric_claim',
  'measured_speed_claim',
  'pitch_decision_without_pitch',
  'timing_without_release',
  'three_d_or_force_claim',
  'medical_or_recruiting_claim',
  'contradiction',
  'duplicate',
  'strength_without_support',
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export interface ValidatedFinding {
  readonly mechanicKey: string;
  readonly mechanicVersion: number;
  readonly pillar: MechanicDefinition['pillar'];
  readonly category: FindingCategory;
  readonly swingIndexes: readonly number[];
  readonly observation: string;
  readonly interpretation: string | null;
  readonly suggestedExperiment: string | null;
  readonly reassessment: string | null;
  readonly evidenceFrameIds: readonly string[];
  readonly limitations: readonly string[];
  readonly alternativeExplanations: readonly string[];
  readonly cue: string | null;
  /** Assessable swings the mechanic could be judged on, and how many this finding covers. */
  readonly eligibleSwingCount: number;
  readonly observedSwingCount: number;
  readonly evidenceGrade: EvidenceGrade;
  readonly evidenceGradeReasons: readonly string[];
  readonly priority: boolean;
}

export interface RejectedFinding {
  readonly index: number;
  readonly mechanicKey: string;
  readonly code: RejectionCode;
}

export interface UnableToAssess {
  readonly mechanicKey: string;
  readonly reasons: readonly string[];
  readonly retakeTips: readonly string[];
  readonly viewRequest: string | null;
}

/** The model's contact call for one reviewed swing, and whether the swing counts. */
export interface SwingContactCheck {
  readonly swing: number;
  readonly contact: SwingContact;
  readonly counted: boolean;
  readonly evidenceFrameIds: readonly string[];
  readonly note: string;
}

export const NO_CONTACT_REASON = 'No contact with the ball was seen in this swing, so it does not count.';

export type ValidationResult =
  | { readonly ok: false; readonly error: 'malformed_output'; readonly issues: readonly string[] }
  | {
      readonly ok: true;
      readonly findings: readonly ValidatedFinding[];
      readonly rejected: readonly RejectedFinding[];
      readonly unableToAssess: readonly UnableToAssess[];
      readonly eligibility: readonly MechanicEligibility[];
      readonly swingContact: readonly SwingContactCheck[];
    };

const PATTERN_WORDS = /\b(consistent(ly)?|every swing|each swing|all (of )?(the |your )?swings|always|repeated(ly)?|pattern|tends? to|habit(ually)?|every time|routinely)\b/i;
const NUMBER_WITH_UNIT =
  /\d+(\.\d+)?\s*(mph|km\/h|kph|ms\b|milliseconds?|seconds?|secs?\b|°|degrees?|deg\b|rpm|%|percent|inch(es)?|in\.|feet|foot|ft\b|cm\b|centimet|met(er|re)s?\b|lbs?\b|pounds|newtons?|\bN\b)/i;
const SPEED_WORDS = /\b(bat speed|swing speed|hand speed|exit velo(city)?|exit speed|launch angle|attack angle|spray angle|batted[- ]ball speed|pitch (speed|velocity)|spin rate|how hard (he|she|they|you) hit)\b/i;
const PITCH_DECISION_WORDS = /\b(pitch recognition|recogni[sz](e|ed|es|ing) the pitch|chas(e|ed|es|ing)|swing decision|plate discipline|pitch selection|strike zone judg(e)?ment|took a strike|timing (of|against|on) the pitch|on time (for|with) the pitch|early on the pitch|late on the pitch)\b/i;
const BALL_TIMING_WORDS = /\b(on time|early|late|timing (of|against|on|with) the (pitch|ball|toss|feed)|release)\b/i;
const THREE_D_FORCE_WORDS =
  /\b(torque|ground[- ]reaction|ground force|force plate|kinetic|joint (load|stress)|3-?d\b|three[- ]dimensional|rotational velocity|angular velocity|hip[- ]shoulder separation of|energy transfer|power output|grip pressure|eye tracking|eyes? (on|stay|stayed|track))\b/i;
const MEDICAL_RECRUITING_WORDS =
  /\b(injur(y|ies|e|ed)|risk of|strain|pain|medical|diagnos|rehab|scholarship|recruit(ed|ing|able|ability)?|d-?(i|1|ii|2|iii|3)\b|division (i|1|ii|2|iii|3)|college[- ](ready|level)|pro[- ]level|professional[- ]level|mlb|draft(ed)?|elite level)\b/i;

function findingText(finding: ModelFinding): string {
  return [finding.observation, finding.interpretation, finding.suggestedExperiment, finding.reassessment, finding.cue, ...finding.limitations, ...finding.alternativeExplanations]
    .filter((part): part is string => typeof part === 'string')
    .join(' \n ');
}

function claimCheck(finding: ModelFinding, packet: EvidencePacket, eligibility: MechanicEligibility, definition: MechanicDefinition): RejectionCode | null {
  const words = findingText(finding);
  if (MEDICAL_RECRUITING_WORDS.test(words)) return 'medical_or_recruiting_claim';
  if (SPEED_WORDS.test(words)) return 'measured_speed_claim';
  if (NUMBER_WITH_UNIT.test(words)) return 'numeric_claim';
  if (THREE_D_FORCE_WORDS.test(words)) return 'three_d_or_force_claim';
  const setting = packet.capture.setting.setting;
  if (setting === 'tee' && PITCH_DECISION_WORDS.test(words)) return 'pitch_decision_without_pitch';
  if (setting !== 'tee' && !packet.releaseVisible && BALL_TIMING_WORDS.test(words)) return 'timing_without_release';
  if (PATTERN_WORDS.test(words) && (!eligibility.patternAllowed || finding.swingIndexes.length < definition.minSwings.pattern)) {
    return 'pattern_from_too_few_swings';
  }
  return null;
}

function evidenceCheck(finding: ModelFinding, packet: EvidencePacket, eligibility: MechanicEligibility): RejectionCode | null {
  if (finding.swingIndexes.length === 0 || finding.evidenceFrameIds.length === 0) return 'no_evidence';
  for (const index of finding.swingIndexes) {
    if (!eligibility.eligibleSwings.includes(index)) return 'swing_not_assessable';
  }
  for (const frameId of finding.evidenceFrameIds) {
    const frame = packet.frames.find((item) => item.frameId === frameId);
    if (!frame) return 'evidence_not_found';
    if (frame.swingIndex === null || !finding.swingIndexes.includes(frame.swingIndex)) return 'evidence_other_swing';
    if (frame.tracking === 'lost') return 'evidence_untracked';
  }
  return null;
}

function overlaps(a: readonly number[], b: readonly number[]): boolean {
  return a.some((value) => b.includes(value));
}

const GRADE_ORDER: Readonly<Record<EvidenceGrade, number>> = { strong: 0, moderate: 1, limited: 2, insufficient: 3 };

/**
 * Validate a raw model response against the packet it was given.
 * `raw` may be anything: a malformed response returns `ok: false` so the
 * caller can retry once or save a partial result.
 */
export function validateInterpretation(raw: unknown, packet: EvidencePacket): ValidationResult {
  const parsed = modelOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'malformed_output', issues: parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }

  // A swing counts only when the bat visibly hits the ball, shown by frames of that swing. A practice
  // swing, a miss, an unclear call or a swing the model did not report is set aside before anything else.
  const reported = new Map(parsed.data.swingContact.map((item) => [item.swing, item] as const));
  const swingContact: SwingContactCheck[] = packet.swings
    .filter((swing) => swing.assessable)
    .map((swing) => {
      const item = reported.get(swing.index);
      const evidenceFrameIds = [...new Set(item?.evidenceFrameIds ?? [])].filter((frameId) =>
        packet.frames.some((frame) => frame.frameId === frameId && frame.swingIndex === swing.index),
      );
      const contact = item?.contact ?? 'unclear';
      return { swing: swing.index, contact, counted: contact === 'bat_hits_ball' && evidenceFrameIds.length > 0, evidenceFrameIds, note: item?.note ?? 'Not reported.' };
    });
  const withoutContact = new Set(swingContact.filter((item) => !item.counted).map((item) => item.swing));
  const counted: EvidencePacket = {
    ...packet,
    swings: packet.swings.map((swing) => (withoutContact.has(swing.index) ? { ...swing, assessable: false, reason: NO_CONTACT_REASON } : swing)),
  };

  const eligibilityByKey = new Map(MECHANICS.map((definition) => [definition.key, mechanicEligibility(definition, counted)] as const));
  const eligibilityFor = (definition: MechanicDefinition): MechanicEligibility => {
    const result = eligibilityByKey.get(definition.key);
    if (!result) throw new Error(`No eligibility for ${definition.key}`);
    return result;
  };

  const rejected: RejectedFinding[] = [];
  const kept: (ValidatedFinding & { readonly sourceIndex: number })[] = [];
  const unableKeys = new Set<string>();

  parsed.data.findings.forEach((finding, index) => {
    const reject = (code: RejectionCode) => rejected.push({ index, mechanicKey: finding.mechanicKey, code });
    const definition = findMechanic(finding.mechanicKey);
    if (!definition) return reject('unknown_mechanic');
    const eligibility = eligibilityFor(definition);
    if (finding.category === 'unable_to_assess') {
      unableKeys.add(definition.key);
      return;
    }
    if (finding.swingIndexes.some((swing) => withoutContact.has(swing))) return reject('swing_without_contact');
    if (eligibility.status === 'unavailable') return reject('not_eligible');
    const swingIndexes = [...new Set(finding.swingIndexes)].sort((a, b) => a - b);
    const normalized = { ...finding, swingIndexes, evidenceFrameIds: [...new Set(finding.evidenceFrameIds)] };
    const evidenceProblem = evidenceCheck(normalized, counted, eligibility);
    if (evidenceProblem) return reject(evidenceProblem);
    const claimProblem = claimCheck(normalized, counted, eligibility, definition);
    if (claimProblem) return reject(claimProblem);

    const grade = gradeEvidence(definition, eligibility, counted, swingIndexes);
    if (grade.grade === 'insufficient') return reject('no_evidence');
    // A strength needs real support: not detecting a problem in weak footage is not a strength.
    if (normalized.category === 'strength' && grade.grade === 'limited') return reject('strength_without_support');

    const isAdjustment = normalized.category === 'adjustment';
    kept.push({
      sourceIndex: index,
      mechanicKey: definition.key,
      mechanicVersion: definition.version,
      pillar: definition.pillar,
      category: normalized.category,
      swingIndexes,
      observation: normalized.observation,
      interpretation: normalized.interpretation,
      suggestedExperiment: isAdjustment ? normalized.suggestedExperiment : null,
      reassessment: normalized.reassessment,
      evidenceFrameIds: normalized.evidenceFrameIds,
      limitations: normalized.limitations,
      alternativeExplanations: normalized.alternativeExplanations,
      cue: isAdjustment ? normalized.cue : null,
      eligibleSwingCount: eligibility.eligibleSwings.length,
      observedSwingCount: swingIndexes.length,
      evidenceGrade: grade.grade,
      evidenceGradeReasons: grade.reasons,
      priority: false,
    });
  });

  // Duplicates and contradictions: the same mechanic on overlapping swings.
  type Kept = (typeof kept)[number];
  const survivors: Kept[] = [];
  const contradicted = new Set<Kept>();
  for (const finding of kept) {
    const duplicate = survivors.find((other) => other.mechanicKey === finding.mechanicKey && other.category === finding.category && overlaps(other.swingIndexes, finding.swingIndexes));
    if (duplicate) {
      rejected.push({ index: finding.sourceIndex, mechanicKey: finding.mechanicKey, code: 'duplicate' });
      continue;
    }
    survivors.push(finding);
  }
  for (const finding of survivors) {
    if (finding.category !== 'strength' && finding.category !== 'adjustment') continue;
    const opposite = finding.category === 'strength' ? 'adjustment' : 'strength';
    if (survivors.some((other) => other.mechanicKey === finding.mechanicKey && other.category === opposite && overlaps(other.swingIndexes, finding.swingIndexes))) {
      contradicted.add(finding);
    }
  }
  for (const finding of contradicted) {
    rejected.push({ index: finding.sourceIndex, mechanicKey: finding.mechanicKey, code: 'contradiction' });
    unableKeys.add(finding.mechanicKey);
  }
  const accepted = survivors.filter((finding) => !contradicted.has(finding));

  // Priorities: up to three adjustments, best-supported first. The rest stay visible as possible adjustments.
  const adjustments = accepted
    .filter((finding) => finding.category === 'adjustment')
    .sort((a, b) => GRADE_ORDER[a.evidenceGrade] - GRADE_ORDER[b.evidenceGrade] || b.observedSwingCount - a.observedSwingCount);
  const priorityKeys = new Set(adjustments.slice(0, MAX_PRIORITIES));
  const findings: ValidatedFinding[] = accepted.map((finding) => {
    const { sourceIndex: _sourceIndex, ...rest } = finding;
    return { ...rest, priority: priorityKeys.has(finding) };
  });

  // Mechanics with no accepted finding that the clip cannot support, or that the model or the
  // contradiction check set aside, are reported as unable to assess, with reasons and retake tips.
  const coveredKeys = new Set(findings.filter((finding) => SUBSTANTIVE_CATEGORIES.includes(finding.category)).map((finding) => finding.mechanicKey));
  for (const item of parsed.data.unableToAssess) unableKeys.add(item.mechanicKey);
  const unableToAssess: UnableToAssess[] = [];
  for (const definition of MECHANICS) {
    const key = definition.key;
    const eligibility = eligibilityFor(definition);
    if (coveredKeys.has(key) || (eligibility.status !== 'unavailable' && !unableKeys.has(key))) continue;
    const noContactAtAll = withoutContact.size > 0 && swingContact.every((item) => !item.counted);
    unableToAssess.push({
      mechanicKey: key,
      reasons: noContactAtAll
        ? ['No swing in this clip showed the bat hitting the ball.']
        : eligibility.reasons.length > 0 ? eligibility.reasons : ['Not enough visible evidence in this clip.'],
      retakeTips: eligibility.retakeTips,
      viewRequest: eligibility.viewRequest,
    });
  }

  return { ok: true, findings, rejected, unableToAssess, eligibility: [...eligibilityByKey.values()], swingContact };
}
