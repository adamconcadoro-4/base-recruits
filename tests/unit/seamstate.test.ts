import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { drill } from '@/lib/assessment/catalog/drills';
import { metric } from '@/lib/assessment/catalog/metrics';
import { comparableCaptures, parseCaptureContext } from '@/lib/seamstate/capture';
import { MECHANICS, requireMechanic } from '@/lib/seamstate/catalog/mechanics';
import { DRILL_CATALOG_COACH_REVIEWED, suggestDrills } from '@/lib/seamstate/drill-rules';
import { mechanicEligibility } from '@/lib/seamstate/eligibility';
import { acceptsCallback, backoffBeforeAttempt, canTransition, failureMessage } from '@/lib/seamstate/jobs';
import { poseIndexFor, posePointFor } from '@/lib/seamstate/landmarks';
import { captureFps, parseEvidencePacket, type EvidencePacket, type SwingSummary } from '@/lib/seamstate/packet';
import { modelOutputJsonSchema, type ModelFinding } from '@/lib/seamstate/schema';
import { BODY_ROLES, type BodyRole, type CameraView } from '@/lib/seamstate/types';
import { validateInterpretation, type ValidatedFinding } from '@/lib/seamstate/validate';

// ---------------------------------------------------------------- fixtures (synthetic, no athlete data)

const MEDIA_ID = '11111111-1111-4111-8111-111111111111';

function fullVisibility(value = 0.95): Partial<Record<BodyRole, number>> {
  return Object.fromEntries(BODY_ROLES.map((role) => [role, value]));
}

function swing(index: number, extra: Partial<SwingSummary> = {}): SwingSummary {
  const start = (index - 1) * 4000;
  const at = (offset: number) => ({ frameIndex: Math.round(((start + offset) * 60) / 1000), timeMs: start + offset, intervalMs: null, method: 'pose_rule' as const });
  return {
    index,
    startMs: start,
    endMs: start + 3000,
    assessable: true,
    reason: null,
    events: {
      setup: at(0),
      load_start: at(500),
      stride_start: at(900),
      foot_contact: at(1400),
      swing_start: at(1450),
      contact: at(1600),
      finish: at(2400),
    },
    visibility: fullVisibility(),
    trackedFraction: 1,
    ...extra,
  };
}

interface PacketOptions {
  readonly swings?: number;
  readonly view?: CameraView;
  readonly setting?: Record<string, unknown>;
  readonly fps?: number | null;
  readonly timingBasis?: 'real_time' | 'slow_motion' | 'unknown';
  readonly slowdownFactor?: number | null;
  readonly releaseVisible?: boolean;
  readonly swingOverrides?: Readonly<Record<number, Partial<SwingSummary>>>;
}

function packet(options: PacketOptions = {}): EvidencePacket {
  const count = options.swings ?? 1;
  const swings = Array.from({ length: count }, (_, i) => swing(i + 1, options.swingOverrides?.[i + 1]));
  const frames = swings.flatMap((item) =>
    Object.entries(item.events).map(([event, value], j) => ({
      frameId: `f${String(item.index * 100 + j).padStart(6, '0')}`,
      frameIndex: value.frameIndex,
      timeMs: value.timeMs,
      swingIndex: item.index,
      event: event as keyof SwingSummary['events'],
      tracking: 'tracked' as const,
    })),
  );
  return parseEvidencePacket({
    mediaId: MEDIA_ID,
    durationMs: count * 4000,
    frameCount: count * 240,
    timing: {
      measuredFps: options.fps === undefined ? 60 : options.fps,
      timingBasis: options.timingBasis ?? 'real_time',
      slowdownFactor: options.slowdownFactor ?? null,
      variableFrameRate: false,
    },
    capture: {
      battingSide: 'right',
      cameraView: options.view ?? 'side_facing',
      setting: options.setting ?? { setting: 'tee' },
    },
    swings,
    frames,
    releaseVisible: options.releaseVisible ?? false,
  });
}

/** Frame id of `event` in swing `index` in the fixture above. */
function frameOf(p: EvidencePacket, index: number, event: string): string {
  const found = p.frames.find((frame) => frame.swingIndex === index && frame.event === event);
  if (!found) throw new Error(`no frame for ${event} in swing ${index}`);
  return found.frameId;
}

function finding(extra: Partial<ModelFinding> & Pick<ModelFinding, 'mechanicKey' | 'category' | 'swingIndexes' | 'evidenceFrameIds'>): ModelFinding {
  return {
    observation: 'The head stays close to where it started from setup to contact.',
    interpretation: null,
    suggestedExperiment: null,
    reassessment: null,
    limitations: [],
    alternativeExplanations: [],
    cue: null,
    ...extra,
  };
}

/** Every swing hits the ball, shown by its contact frame, unless the test says otherwise. */
function allContact(p: EvidencePacket) {
  return p.swings.map((item) => ({ swing: item.index, contact: 'bat_hits_ball' as const, evidenceFrameIds: [frameOf(p, item.index, 'contact')], note: 'The ball is gone from the tee after the swing.' }));
}

function validated(raw: object, p: EvidencePacket) {
  const result = validateInterpretation({ swingContact: allContact(p), ...raw }, p);
  if (!result.ok) throw new Error(`malformed: ${result.issues.join('; ')}`);
  return result;
}

// ---------------------------------------------------------------- catalog

describe('SeamState mechanic catalog', () => {
  it('links every mechanic to existing Assessment metrics and at least one library drill', () => {
    for (const item of MECHANICS) {
      expect(item.relatedMetrics.length, item.key).toBeGreaterThan(0);
      for (const key of item.relatedMetrics) expect(metric(key), `${item.key} → ${key}`).toBeDefined();
      const asAdjustment = { mechanicKey: item.key, category: 'adjustment', cue: null } as unknown as ValidatedFinding;
      expect(suggestDrills(asAdjustment, ['partner', 'video']).length, item.key).toBeGreaterThan(0);
    }
  });

  it('has unique keys, at least one view and no bat or ball measurements', () => {
    const keys = MECHANICS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of MECHANICS) {
      expect(item.views.length).toBeGreaterThan(0);
      expect(item.sources).not.toContain('sensor_measured');
      expect(item.evaluation).toBe('not_evaluated');
    }
    expect(keys.some((key) => /bat|barrel_path|exit|launch|velocity/.test(key))).toBe(false);
  });

  it('produces a JSON schema for structured output', () => {
    const schema = modelOutputJsonSchema();
    expect(schema.type).toBe('object');
    expect(JSON.stringify(schema)).not.toContain('confidence');
  });
});

// ---------------------------------------------------------------- landmarks and capture context

describe('hitter-relative landmarks', () => {
  it('maps the lead side from the confirmed batting side', () => {
    expect(posePointFor('lead_ankle', 'right')).toBe('left_ankle');
    expect(posePointFor('lead_ankle', 'left')).toBe('right_ankle');
    expect(posePointFor('rear_foot', 'right')).toBe('right_foot_index');
    expect(poseIndexFor('head', 'left')).toBe(0);
    expect(poseIndexFor('lead_wrist', 'right')).toBe(15);
  });
});

describe('capture context', () => {
  it('needs only setting, batting side and view; everything else is optional', () => {
    const context = parseCaptureContext({ battingSide: 'left', cameraView: 'side_facing', setting: { setting: 'tee' } });
    expect(context.setting).toEqual({ setting: 'tee', teeZone: null });
    expect(context.protocolVersion).toBe('seamstate-capture-v1');
  });

  it('keeps a machine setting as typed text, never a number', () => {
    const context = parseCaptureContext({
      battingSide: 'right',
      cameraView: 'side_facing',
      setting: { setting: 'machine', machineSettingAsEntered: '70 on the dial' },
    });
    expect(context.setting.setting === 'machine' && context.setting.machineSettingAsEntered).toBe('70 on the dial');
  });

  it('requires coach BP versus live pitcher for overhand, and refuses switch as a clip side', () => {
    expect(() => parseCaptureContext({ battingSide: 'right', cameraView: 'side_facing', setting: { setting: 'overhand_bp' } })).toThrow();
    expect(() => parseCaptureContext({ battingSide: 'switch', cameraView: 'side_facing', setting: { setting: 'tee' } })).toThrow();
  });

  it('never treats different settings, views or deliveries as one trend', () => {
    const tee = parseCaptureContext({ battingSide: 'right', cameraView: 'side_facing', setting: { setting: 'tee' } });
    const machine = parseCaptureContext({ battingSide: 'right', cameraView: 'front_on', setting: { setting: 'machine' } });
    expect(comparableCaptures(tee, machine)).toEqual({ comparable: false, differences: ['different setting', 'different camera view'] });
    const coach = parseCaptureContext({ battingSide: 'right', cameraView: 'side_facing', setting: { setting: 'overhand_bp', delivery: 'coach_bp' } });
    const live = parseCaptureContext({ battingSide: 'right', cameraView: 'side_facing', setting: { setting: 'overhand_bp', delivery: 'live_pitcher' } });
    expect(comparableCaptures(coach, live).differences).toEqual(['coach BP compared with a live pitcher']);
    expect(comparableCaptures(tee, tee).comparable).toBe(true);
  });
});

describe('evidence packet', () => {
  it('accepts the packet the worker builds (shared fixture from worker/tests)', () => {
    const fixture = JSON.parse(readFileSync(join(__dirname, '../../worker/tests/fixtures/synthetic_packet.json'), 'utf8')) as unknown;
    const parsed = parseEvidencePacket(fixture);
    expect(parsed.swings).toHaveLength(1);
    expect(parsed.frames.every((frame) => frame.swingIndex === 1)).toBe(true);
    expect(mechanicEligibility(requireMechanic('foot_contact_to_swing'), parsed).timingClaims).toBe('milliseconds');
    expect(mechanicEligibility(requireMechanic('head_movement'), parsed).status).not.toBe('unavailable');
  });

  it('refuses a tee clip that claims a visible release', () => {
    expect(() => packet({ releaseVisible: true })).toThrow();
  });

  it('knows real capture rate only for real-time or known slow motion', () => {
    expect(captureFps({ measuredFps: 30, timingBasis: 'real_time', slowdownFactor: null, variableFrameRate: false })).toBe(30);
    expect(captureFps({ measuredFps: 30, timingBasis: 'slow_motion', slowdownFactor: 8, variableFrameRate: false })).toBe(240);
    expect(captureFps({ measuredFps: 30, timingBasis: 'slow_motion', slowdownFactor: null, variableFrameRate: false })).toBeNull();
    expect(captureFps({ measuredFps: 30, timingBasis: 'unknown', slowdownFactor: null, variableFrameRate: false })).toBeNull();
  });
});

// ---------------------------------------------------------------- eligibility

describe('eligibility', () => {
  it('asks for another view instead of guessing', () => {
    const result = mechanicEligibility(requireMechanic('lead_knee'), packet({ view: 'front_on' }));
    expect(result.status).toBe('unavailable');
    expect(result.viewRequest).toContain('Side view, camera facing the athlete’s chest');
  });

  it('gates each mechanic on its own landmarks, with a specific retake tip', () => {
    const hiddenFeet = { visibility: { ...fullVisibility(), lead_ankle: 0.2, rear_ankle: 0.2, lead_foot: 0.1, rear_foot: 0.1 } };
    const p = packet({ swingOverrides: { 1: hiddenFeet } });
    const base = mechanicEligibility(requireMechanic('setup_base'), p);
    expect(base.status).toBe('unavailable');
    expect(base.retakeTips).toEqual(['Keep both feet visible from setup through the finish.']);
    expect(mechanicEligibility(requireMechanic('head_movement'), p).status).toBe('eligible');
  });

  it('a no-stride swing makes foot-contact timing unavailable, not a flaw', () => {
    const noStride = swing(1);
    const { foot_contact: _footContact, stride_start: _strideStart, ...events } = noStride.events;
    const p = packet({ swingOverrides: { 1: { events } } });
    const timing = mechanicEligibility(requireMechanic('foot_contact_to_swing'), p);
    expect(timing.status).toBe('unavailable');
    expect(timing.reasons).toContain('The foot contact moment could not be located.');
    expect(mechanicEligibility(requireMechanic('load_pattern'), p).status).toBe('eligible');
  });

  it('allows milliseconds only for real time at 60 fps or more', () => {
    const timing = requireMechanic('foot_contact_to_swing');
    expect(mechanicEligibility(timing, packet({ fps: 60 })).timingClaims).toBe('milliseconds');
    expect(mechanicEligibility(timing, packet({ fps: 30 })).timingClaims).toBe('order_only');
    expect(mechanicEligibility(timing, packet({ fps: 30, timingBasis: 'slow_motion', slowdownFactor: null })).timingClaims).toBe('order_only');
    expect(mechanicEligibility(timing, packet({ fps: 30 })).status).toBe('limited');
  });

  it('allows a repeated pattern only with three eligible swings', () => {
    expect(mechanicEligibility(requireMechanic('head_movement'), packet({ swings: 2 })).patternAllowed).toBe(false);
    expect(mechanicEligibility(requireMechanic('head_movement'), packet({ swings: 3 })).patternAllowed).toBe(true);
  });
});

// ---------------------------------------------------------------- validator (acceptance scenarios A–F)

describe('interpretation validator', () => {
  it('A: keeps a footage-specific tee finding with real evidence, graded by code', () => {
    const p = packet({ swings: 3 });
    const result = validated(
      {
        findings: [
          finding({
            mechanicKey: 'head_movement',
            category: 'strength',
            swingIndexes: [1, 2, 3],
            evidenceFrameIds: [frameOf(p, 1, 'setup'), frameOf(p, 1, 'contact'), frameOf(p, 3, 'contact')],
          }),
        ],
        unableToAssess: [],
      },
      p,
    );
    expect(result.rejected).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ evidenceGrade: 'strong', eligibleSwingCount: 3, observedSwingCount: 3, pillar: 'load_timing' });
  });

  it('A: rejects pitch-decision claims on tee work', () => {
    const p = packet();
    const result = validated(
      {
        findings: [
          finding({
            mechanicKey: 'load_pattern',
            category: 'adjustment',
            swingIndexes: [1],
            evidenceFrameIds: [frameOf(p, 1, 'load_start')],
            observation: 'The load starts late, so the hitter may chase pitches.',
          }),
        ],
        unableToAssess: [],
      },
      p,
    );
    expect(result.findings).toEqual([]);
    expect(result.rejected[0]?.code).toBe('pitch_decision_without_pitch');
  });

  it('B: front toss without a visible release cannot claim timing against the ball', () => {
    const p = packet({ setting: { setting: 'front_toss' }, releaseVisible: false });
    const result = validated(
      {
        findings: [
          finding({
            mechanicKey: 'load_pattern',
            category: 'adjustment',
            swingIndexes: [1],
            evidenceFrameIds: [frameOf(p, 1, 'load_start')],
            observation: 'The hitter looks late on the toss.',
          }),
        ],
        unableToAssess: [],
      },
      p,
    );
    expect(result.rejected[0]?.code).toBe('timing_without_release');
  });

  it('D: a poor clip yields retake guidance instead of findings', () => {
    const blurred = { visibility: fullVisibility(0.2), trackedFraction: 0.5 };
    const p = packet({ swingOverrides: { 1: blurred } });
    const result = validated(
      {
        findings: [finding({ mechanicKey: 'posture_change', category: 'adjustment', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'contact')] })],
        unableToAssess: [],
      },
      p,
    );
    expect(result.findings).toEqual([]);
    expect(result.rejected[0]?.code).toBe('not_eligible');
    const posture = result.unableToAssess.find((item) => item.mechanicKey === 'posture_change');
    expect(posture?.reasons).toContain('The hitter was not tracked through the whole swing.');
    expect(posture?.retakeTips.length).toBeGreaterThan(0);
  });

  it('E: no swing means no swing findings', () => {
    const p = packet({ swingOverrides: { 1: { assessable: false, reason: 'No swing detected' } } });
    const result = validated(
      {
        findings: [finding({ mechanicKey: 'finish_support', category: 'strength', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'finish')] })],
        unableToAssess: [],
      },
      p,
    );
    expect(result.findings).toEqual([]);
    expect(result.unableToAssess.map((item) => item.mechanicKey).sort()).toEqual(MECHANICS.map((item) => item.key).sort());
  });

  it('F: a single swing is never a recurring pattern', () => {
    const p = packet();
    const result = validated(
      {
        findings: [
          finding({
            mechanicKey: 'finish_support',
            category: 'adjustment',
            swingIndexes: [1],
            evidenceFrameIds: [frameOf(p, 1, 'finish')],
            observation: 'The hitter consistently steps out after contact.',
          }),
        ],
        unableToAssess: [],
      },
      p,
    );
    expect(result.rejected[0]?.code).toBe('pattern_from_too_few_swings');
  });

  it('rejects nonexistent frames, frames from another swing and untracked frames', () => {
    const p = packet({ swings: 2 });
    const lost = { ...p, frames: p.frames.map((frame) => (frame.frameId === frameOf(p, 1, 'finish') ? { ...frame, tracking: 'lost' as const } : frame)) };
    const result = validated(
      {
        findings: [
          finding({ mechanicKey: 'head_movement', category: 'neutral', swingIndexes: [1], evidenceFrameIds: ['f999999'] }),
          finding({ mechanicKey: 'posture_change', category: 'neutral', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 2, 'contact')] }),
          finding({ mechanicKey: 'finish_support', category: 'neutral', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'finish')] }),
          finding({ mechanicKey: 'stride', category: 'neutral', swingIndexes: [1], evidenceFrameIds: [] }),
          finding({ mechanicKey: 'not_a_mechanic', category: 'neutral', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'setup')] }),
        ],
        unableToAssess: [],
      },
      lost,
    );
    expect(result.findings).toEqual([]);
    expect(result.rejected.map((item) => item.code)).toEqual(['evidence_not_found', 'evidence_other_swing', 'evidence_untracked', 'no_evidence', 'unknown_mechanic']);
  });

  it.each([
    ['numeric_claim', 'Head moves about 4 inches toward the plate.'],
    ['measured_speed_claim', 'Good bat speed through the zone.'],
    ['three_d_or_force_claim', 'The lead leg produces strong ground force.'],
    ['medical_or_recruiting_claim', 'This move could lead to injury.'],
    ['medical_or_recruiting_claim', 'A college-ready swing.'],
  ])('rejects %s', (code, observation) => {
    const p = packet();
    const result = validated(
      { findings: [finding({ mechanicKey: 'lead_knee', category: 'neutral', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'contact')], observation })], unableToAssess: [] },
      p,
    );
    expect(result.rejected[0]?.code).toBe(code);
  });

  it('allows "observed in 3 of 4 swings" style counts without units', () => {
    const p = packet({ swings: 4 });
    const result = validated(
      {
        findings: [
          finding({
            mechanicKey: 'finish_support',
            category: 'adjustment',
            swingIndexes: [1, 2, 4],
            evidenceFrameIds: [frameOf(p, 1, 'finish'), frameOf(p, 2, 'finish'), frameOf(p, 4, 'finish')],
            observation: 'The back foot steps out after contact in 3 of 4 swings, a repeated pattern in this clip.',
            cue: 'Hold the finish for a count of three',
          }),
        ],
        unableToAssess: [],
      },
      p,
    );
    expect(result.rejected).toEqual([]);
    expect(result.findings[0]).toMatchObject({ observedSwingCount: 3, eligibleSwingCount: 4, priority: true, cue: 'Hold the finish for a count of three' });
  });

  it('sets aside contradictory and duplicate findings', () => {
    const p = packet({ swings: 3 });
    const evidence = [frameOf(p, 1, 'contact')];
    const result = validated(
      {
        findings: [
          finding({ mechanicKey: 'posture_change', category: 'strength', swingIndexes: [1], evidenceFrameIds: evidence }),
          finding({ mechanicKey: 'posture_change', category: 'adjustment', swingIndexes: [1], evidenceFrameIds: evidence }),
          finding({ mechanicKey: 'head_movement', category: 'neutral', swingIndexes: [1], evidenceFrameIds: evidence }),
          finding({ mechanicKey: 'head_movement', category: 'neutral', swingIndexes: [1], evidenceFrameIds: evidence }),
        ],
        unableToAssess: [],
      },
      p,
    );
    expect(result.findings.map((item) => item.mechanicKey)).toEqual(['head_movement']);
    expect(result.rejected.map((item) => [item.index, item.code])).toEqual([
      [3, 'duplicate'],
      [0, 'contradiction'],
      [1, 'contradiction'],
    ]);
    expect(result.unableToAssess.map((item) => item.mechanicKey)).toContain('posture_change');
  });

  it('does not call something a strength when the footage only gives limited support', () => {
    const weak = { visibility: fullVisibility(0.55), trackedFraction: 0.82 };
    const p = packet({ swingOverrides: { 1: weak } });
    const result = validated(
      { findings: [finding({ mechanicKey: 'head_movement', category: 'strength', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'contact')] })], unableToAssess: [] },
      p,
    );
    expect(result.rejected[0]?.code).toBe('strength_without_support');
  });

  it('marks at most three adjustments as priorities and strips cues from non-adjustments', () => {
    const p = packet({ swings: 3 });
    const keys = ['load_pattern', 'posture_change', 'lead_knee', 'finish_support'];
    const result = validated(
      {
        findings: [
          ...keys.map((mechanicKey) =>
            finding({ mechanicKey, category: 'adjustment', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'contact')], cue: 'Stay tall' }),
          ),
          finding({ mechanicKey: 'head_movement', category: 'strength', swingIndexes: [1, 2, 3], evidenceFrameIds: [frameOf(p, 1, 'contact')], cue: 'Ignored' }),
        ],
        unableToAssess: [],
      },
      p,
    );
    expect(result.findings.filter((item) => item.priority)).toHaveLength(3);
    expect(result.findings.find((item) => item.category === 'strength')?.cue).toBeNull();
  });

  it('counts only swings where the bat visibly hits the ball', () => {
    const p = packet({ swings: 3 });
    const neutral = (swingIndexes: number[]) =>
      finding({ mechanicKey: 'head_movement', category: 'neutral', swingIndexes, evidenceFrameIds: swingIndexes.map((index) => frameOf(p, index, 'contact')) });
    const result = validated(
      {
        swingContact: [
          { swing: 1, contact: 'bat_hits_ball', evidenceFrameIds: [frameOf(p, 1, 'finish')], note: 'The tee is empty after the swing.' },
          { swing: 2, contact: 'no_contact', evidenceFrameIds: [frameOf(p, 2, 'finish')], note: 'The ball is still on the tee: a practice swing.' },
          // Claimed, but with no frame of its own swing to show it.
          { swing: 3, contact: 'bat_hits_ball', evidenceFrameIds: [frameOf(p, 1, 'finish')], note: 'Contact.' },
        ],
        findings: [neutral([1]), neutral([2]), neutral([1, 3])],
        unableToAssess: [],
      },
      p,
    );
    expect(result.swingContact.map((item) => [item.swing, item.counted])).toEqual([[1, true], [2, false], [3, false]]);
    expect(result.findings.map((item) => item.swingIndexes)).toEqual([[1]]);
    expect(result.findings[0]?.eligibleSwingCount).toBe(1);
    expect(result.rejected.map((item) => item.code)).toEqual(['swing_without_contact', 'swing_without_contact']);
  });

  it('counts no swing the model leaves unreported or unclear', () => {
    const p = packet({ swings: 2 });
    const result = validated(
      {
        swingContact: [{ swing: 1, contact: 'unclear', evidenceFrameIds: [], note: 'The ball is out of frame.' }],
        findings: [finding({ mechanicKey: 'head_movement', category: 'neutral', swingIndexes: [1], evidenceFrameIds: [frameOf(p, 1, 'contact')] })],
        unableToAssess: [],
      },
      p,
    );
    expect(result.findings).toEqual([]);
    expect(result.swingContact.map((item) => item.counted)).toEqual([false, false]);
    expect(result.unableToAssess.find((item) => item.mechanicKey === 'head_movement')?.reasons).toEqual(['No swing in this clip showed the bat hitting the ball.']);
  });

  it('reports malformed output separately from footage problems', () => {
    const result = validateInterpretation({ findings: [{ mechanicKey: 'stride', confidence: 0.93 }] }, packet());
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------- drills (scenario I) and jobs (L and stale callbacks)

describe('drill rules', () => {
  const base = { swingIndexes: [1], cue: null } as const;
  it('I: maps an adjustment to catalog drills only, labelled as not coach-reviewed', () => {
    const suggestions = suggestDrills({ ...base, mechanicKey: 'stride', category: 'adjustment' } as unknown as ValidatedFinding, []);
    expect(suggestions.map((item) => item.drillKey)).toEqual(['hit-stride-line']);
    for (const item of suggestions) {
      expect(drill(item.drillKey, item.drillVersion)).toBeDefined();
      expect(item.dosageSource).toBe('catalog_starting_point');
      expect(item.coachReviewed).toBe(DRILL_CATALOG_COACH_REVIEWED);
    }
  });

  it('gives no drills for strengths and skips drills needing missing equipment', () => {
    expect(suggestDrills({ ...base, mechanicKey: 'stride', category: 'strength' } as unknown as ValidatedFinding, [])).toEqual([]);
    const timing = suggestDrills({ ...base, mechanicKey: 'foot_contact_to_swing', category: 'adjustment' } as unknown as ValidatedFinding, []);
    expect(timing.map((item) => item.drillKey)).not.toContain('hit-front-toss-tempo');
    const withPartner = suggestDrills({ ...base, mechanicKey: 'foot_contact_to_swing', category: 'adjustment' } as unknown as ValidatedFinding, ['partner']);
    expect(withPartner.map((item) => item.drillKey)).toContain('hit-front-toss-tempo');
  });
});

describe('analysis jobs', () => {
  it('follows the allowed transitions only', () => {
    expect(canTransition('queued', 'preprocessing')).toBe(true);
    expect(canTransition('complete', 'analyzing')).toBe(false);
    expect(canTransition('needs_input', 'queued')).toBe(true);
    expect(canTransition('analyzing', 'queued')).toBe(true);
    expect(canTransition('cancelled', 'queued')).toBe(false);
  });

  it('refuses stale, late and post-deletion callbacks', () => {
    const job = { state: 'analyzing' as const, currentAttemptId: 'attempt-2', cancelled: false, deleted: false };
    expect(acceptsCallback(job, 'attempt-2')).toBe(true);
    expect(acceptsCallback(job, 'attempt-1')).toBe(false);
    expect(acceptsCallback({ ...job, cancelled: true }, 'attempt-2')).toBe(false);
    expect(acceptsCallback({ ...job, deleted: true }, 'attempt-2')).toBe(false);
    expect(acceptsCallback({ ...job, state: 'complete' }, 'attempt-2')).toBe(false);
  });

  it('backs off between bounded attempts and never blames the swing for a service failure', () => {
    expect([1, 2, 3].map(backoffBeforeAttempt)).toEqual([0, 30_000, 60_000]);
    expect(failureMessage('service')).toContain('nothing to do with your swing');
  });
});
