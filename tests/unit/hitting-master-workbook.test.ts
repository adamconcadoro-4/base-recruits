import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { drillGroups } from '@/lib/assessment/catalog/drill-groups';
import { DRILLS, drill, drillsFor, worksOn } from '@/lib/assessment/catalog/drills';
import { FLAWS } from '@/lib/assessment/catalog/flaws';
import { MASTER_FLAW_DRILLS } from '@/lib/assessment/catalog/master-flaw-links';
import { MASTER_DRILLS, MEDICINE_BALL_DRILLS, RECOGNITION_DRILLS } from '@/lib/assessment/catalog/master-drills';
import { metric } from '@/lib/assessment/catalog/metrics';
import {
  focusAssignments,
  focusProblem,
  PROGRESSION_STAGES,
  sessionTemplate,
  sessionTitle,
  STAGE_IDS,
  templateAssignments,
} from '@/lib/assessment/catalog/session-templates';
import { workbookDrillKey } from '@/lib/assessment/catalog/workbook-drills';
import { HITTING_WORKBOOK } from '@/lib/assessment/hitting-workbook/content';
import { MASTER_CATEGORIES, MASTER_WORKBOOK, MASTER_WORKBOOK_COACH_REVIEWED, withMasterNames } from '@/lib/assessment/hitting-workbook/master';
import { suggestPlan } from '@/lib/assessment/recommendations';
import type { MetricResult } from '@/lib/assessment/results';
import { SAMPLE_REPORT } from '@/lib/assessment/sample';

const ids = Array.from({ length: 69 }, (_, i) => `MW${String(i + 1).padStart(2, '0')}`);

// The outside organisations the workbook arrived citing, and the branded drill names it arrived with (decision F55).
const OUTSIDE = /driveline|google|mediapipe|red sox|pinkman|hitting vault|rooney|overtime athletes|ritend|sklz|kershaw|gilmore|lone ranger|youtube|gamerun|maven|https?:\/\/|www\.|\[S\d{3}/i;
const BRANDED = /palm-up punch|slot machine|hip pocket reload|brake check|pause & pounce|oppo laser|rock & rocket|step-back spark|shuffle-to-strike|count it calm|pocket-to-pop|marketing name/i;

describe('hitting master workbook content', () => {
  it('is the stored workbook, with the expected records', () => {
    const file = readFileSync('data/hitting-workbook/Baseball_Hitting_Master_Workbook.xlsx');
    expect(MASTER_WORKBOOK.source.sha256).toBe(createHash('sha256').update(file).digest('hex'));
    expect(MASTER_WORKBOOK.version).toBe('hitting-master-v1');
    expect(MASTER_WORKBOOK.drills.map((item) => item.sourceId)).toEqual(ids);
    const perCategory = MASTER_CATEGORIES.map((category) => MASTER_WORKBOOK.drills.filter((item) => item.category === category).length);
    expect(perCategory).toEqual([12, 9, 12, 12, 12, 12]);
    expect(MASTER_WORKBOOK.stages.map((item) => item.id)).toEqual([...STAGE_IDS]);
    expect(MASTER_WORKBOOK.structure.map((item) => item.block)).toEqual([
      'Preparation',
      'Baseline',
      'Rear-leg block',
      'Front-leg block',
      'Upper-body block',
      'Exit check',
      'Review',
    ]);
  });

  it('carries no outside names, links, source references or branded drill names', () => {
    const text = JSON.stringify(MASTER_WORKBOOK);
    expect(text).not.toMatch(OUTSIDE);
    expect(text).not.toMatch(BRANDED);
    const site = JSON.stringify([MASTER_DRILLS, PROGRESSION_STAGES]);
    expect(site).not.toMatch(OUTSIDE);
    expect(site).not.toMatch(BRANDED);
  });

  it('collects no readiness or health information', () => {
    // The workbook's "What to record" column asks for readiness and restrictions; it is not imported (F39, F55).
    for (const item of MASTER_WORKBOOK.structure) expect(Object.keys(item).sort()).toEqual(['block', 'dose', 'sourceRow', 'task']);
    expect(JSON.stringify(MASTER_WORKBOOK.structure)).not.toMatch(/readiness|restrictions/i);
    expect(JSON.stringify(PROGRESSION_STAGES)).not.toMatch(/Record:|readiness/i);
  });

  it('gives every drill a generic name used by no other drill in the library', () => {
    const names = DRILLS.map((item) => item.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const item of HITTING_WORKBOOK.drills) expect(names.filter((name) => name === item.name.toLowerCase())).toHaveLength(1);
  });

  it('spells out the workbook’s drill numbers as names and site ids', () => {
    expect(withMasterNames('#22 Rear-Hip Hinge Pause, or #24 if needed.')).toBe('Rear-Hip Hinge Pause (MW22), or Step-Back Tee Swings (MW24) if needed.');
    expect(withMasterNames('Use #38–40 first.')).toBe('Use MW38–MW40 first.');
    expect(withMasterNames('substitute drill 26')).toBe('substitute Rear-Leg Balance Start (MW26)');
    expect(withMasterNames('No numbers here.')).toBe('No numbers here.');
  });
});

describe('master workbook drills in the drill library', () => {
  it('adds all 69 drills beside the development workbook’s, replacing none', () => {
    expect(MASTER_DRILLS.map((item) => item.key)).toEqual(ids.map(workbookDrillKey));
    for (const item of MASTER_DRILLS) {
      expect(drill(item.key, 1)).toBe(item);
      expect(item.replacedBy).toBeUndefined();
      expect(item.workbook?.book).toBe('master');
      expect(item.workbook?.coachReviewed).toBe(MASTER_WORKBOOK_COACH_REVIEWED);
    }
    expect(DRILLS.filter((item) => item.replacedBy)).toHaveLength(5);
    expect(drillsFor('hitting').filter((item) => item.workbook?.book === 'development')).toHaveLength(46);
  });

  it('keeps the full instructions and the filming notes, with numbers spelled out', () => {
    for (const item of MASTER_DRILLS) {
      expect(item.purpose.length).toBeGreaterThan(10);
      expect(item.steps.length).toBeGreaterThanOrEqual(3);
      expect(item.equipment.length).toBeGreaterThan(0);
      expect(item.dosage.length).toBeGreaterThan(5);
      expect(item.dosage.length).toBeLessThanOrEqual(200);
      expect(item.workbook?.safety?.length).toBeGreaterThan(20);
      for (const text of Object.values(item.workbook?.filming ?? {})) expect(text.length).toBeGreaterThan(5);
      expect(JSON.stringify([item.steps, item.workbook?.filming, item.workbook?.related])).not.toMatch(/#\d/);
    }
  });

  it('links drills only to hitting measures, with matching pillars', () => {
    for (const item of MASTER_DRILLS) {
      for (const key of item.findings) expect(metric(key)?.discipline).toBe('hitting');
      expect([...item.pillars].sort()).toEqual([...new Set(item.findings.map((key) => metric(key)?.pillar))].sort());
      const unscored = MEDICINE_BALL_DRILLS.includes(item.workbook?.sourceId ?? '') || RECOGNITION_DRILLS.includes(item.workbook?.sourceId ?? '');
      expect(item.findings.length === 0).toBe(unscored);
    }
  });

  it('keeps medicine-ball and pitch-recognition drills out of automatic suggestions', () => {
    expect(MEDICINE_BALL_DRILLS).toHaveLength(13);
    for (const id of MEDICINE_BALL_DRILLS) {
      const item = drill(workbookDrillKey(id)) ;
      expect(item?.requires).toContain('coach');
      expect(item?.reassessment).toMatch(/not scored in the assessment/);
      expect(worksOn(item!)).toMatch(/^Medicine-ball movement/);
    }
    for (const id of RECOGNITION_DRILLS) {
      const item = drill(workbookDrillKey(id));
      expect(item?.requires).toContain('partner');
      expect(worksOn(item!)).toMatch(/^Swing decisions/);
    }
    const weak = SAMPLE_REPORT.results.metrics.map((item): MetricResult => ({ ...item, value: 1, score: 10, status: 'ok' }));
    const plan = suggestPlan('hitting', weak);
    for (const item of plan.suggestions) {
      expect(MEDICINE_BALL_DRILLS.map(workbookDrillKey)).not.toContain(item.drill.key);
      expect(RECOGNITION_DRILLS.map(workbookDrillKey)).not.toContain(item.drill.key);
    }
  });

  it('groups the library by workbook section and body area', () => {
    const groups = drillGroups(drillsFor('hitting'));
    const labels = groups.map((item) => item.label);
    expect(labels.filter((label) => label.startsWith('Body area: '))).toEqual(MASTER_CATEGORIES.map((category) => `Body area: ${category}`));
    expect(labels.slice(0, 5)).toEqual(['A · Tee Contact & Barrel Control', 'B · Movement Into Contact', 'C · Moving-Ball Contact & Timing', 'D · Pitch Selection, Counts & Situations', 'Rehearsals and feedback tools']);
    expect(groups.reduce((sum, item) => sum + item.drills.length, 0)).toBe(drillsFor('hitting').length);
    expect(groups.find((item) => item.label === 'Body area: Medicine ball')?.drills).toHaveLength(13);
  });
});

describe('master workbook drills in the swing-flaw guide', () => {
  it('adds known drills after each flaw’s own list, keeping its order', () => {
    for (const [index, flaw] of FLAWS.entries()) {
      const own = HITTING_WORKBOOK.flaws[index]?.drills ?? [];
      const added = MASTER_FLAW_DRILLS[flaw.sourceId as keyof typeof MASTER_FLAW_DRILLS];
      expect(flaw.drills).toEqual([...own, ...added]);
      expect(added.length).toBeGreaterThan(0);
      for (const id of added) {
        expect(ids).toContain(id);
        expect(MEDICINE_BALL_DRILLS).not.toContain(id);
      }
    }
  });

  it('does not change the drills suggested first', () => {
    const base = SAMPLE_REPORT.results.metrics.find((item) => item.metric_key === 'hit_barrel_delivery_consistency') as MetricResult;
    const metrics = SAMPLE_REPORT.results.metrics.map((item) => (item.metric_key === base.metric_key ? { ...base, value: 2, score: 25 } : item));
    const plan = suggestPlan('hitting', metrics, { priorityMetrics: ['hit_barrel_delivery_consistency'] });
    const barrel = plan.suggestions.filter((item) => item.finding.metricKey === 'hit_barrel_delivery_consistency');
    expect(barrel.map((item) => item.drill.key)).toEqual(['hit-h12', 'hit-h13']);
  });
});

describe('six-stage progression', () => {
  it('offers the six stages as plan templates, each with a rear-leg, a front-leg and an upper-body drill', () => {
    expect(PROGRESSION_STAGES.map((item) => item.id)).toEqual([...STAGE_IDS]);
    expect(sessionTitle(PROGRESSION_STAGES[0]!)).toBe('Stage 1 · Gather, Land, Deliver (about 30–40 minutes)');
    for (const item of PROGRESSION_STAGES) {
      expect(item.kind).toBe('stage');
      expect(item.totalMinutes).toBeNull();
      expect(item.blocks.map((block) => block.label)).toEqual([
        'Preparation',
        'Baseline',
        'Rear-leg block',
        'Front-leg block',
        'Upper-body block',
        'Exit check',
        'Review',
      ]);
      expect(item.drills).toHaveLength(3);
      for (const entry of item.drills) expect(entry.workbook?.book).toBe('master');
      expect(item.stage?.focusOptions.map((option) => option.slot)).toEqual(['P', 'B', 'M']);
      expect(MEDICINE_BALL_DRILLS.map(workbookDrillKey)).toContain(item.stage?.focusOptions[2]?.drill.key);
      expect(JSON.stringify(item.blocks)).not.toMatch(/#\d/);
    }
    expect(sessionTemplate('ST1')?.drills.map((item) => item.key)).toEqual(['hit-mw22', 'hit-mw13', 'hit-mw01']);
  });

  it('starts a plan with the three stage drills and offers the focus drills unticked', () => {
    const open = new Set(drillsFor('hitting').map((item) => item.key));
    for (const item of PROGRESSION_STAGES) {
      const core = templateAssignments(item);
      expect(core).toHaveLength(3);
      for (const entry of [...core, ...focusAssignments(item)]) {
        expect(open.has(entry.drill.key)).toBe(true);
        expect(entry.dosage.length).toBeLessThanOrEqual(200);
        expect(entry.reason.length).toBeLessThanOrEqual(600);
        expect(entry.reason).toMatch(new RegExp(`^From Stage ${item.stage?.number} `));
      }
      expect(focusAssignments(item)).toHaveLength(3);
    }
  });

  it('allows at most one focus drill in a stage plan', () => {
    const stage = sessionTemplate('ST1');
    const [posture, balance] = stage?.stage?.focusOptions ?? [];
    const core = stage?.drills.map((item) => item.key) ?? [];
    expect(focusProblem(stage, core)).toBeNull();
    expect(focusProblem(stage, [...core, posture!.drill.key])).toBeNull();
    expect(focusProblem(stage, [...core, posture!.drill.key, balance!.drill.key])).toMatch(/at most one/);
    expect(focusProblem(sessionTemplate('S2'), [posture!.drill.key, balance!.drill.key])).toBeNull();
  });

  it('matches the drills and focus rule the database checks', () => {
    const sql = readFileSync('supabase/migrations/20261102000300_hitting_master_workbook.sql', 'utf8');
    for (const item of MASTER_DRILLS) expect(sql).toContain(`('${item.key}', 1, 'hitting', `);
    for (const item of PROGRESSION_STAGES) {
      const keys = item.stage?.focusOptions.map((option) => `'${option.drill.key}'`).join(', ');
      expect(sql).toContain(`('${item.id}', array[${keys}])`);
    }
  });
});
