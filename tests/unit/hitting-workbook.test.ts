import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DRILLS, drill, drillsFor, worksOn } from '@/lib/assessment/catalog/drills';
import { DECISION_FLAWS, FLAW_WORKFLOW, FLAWS, METRIC_FLAWS, flawsForMetric, metricsForFlaw, type FlawId } from '@/lib/assessment/catalog/flaws';
import { metric } from '@/lib/assessment/catalog/metrics';
import { HELD_BACK_REHEARSALS, WORKBOOK_DRILLS, workbookDrillKey } from '@/lib/assessment/catalog/workbook-drills';
import { HITTING_WORKBOOK, siteText, withWorkbookNames, workbookName } from '@/lib/assessment/hitting-workbook/content';
import { suggestPlan } from '@/lib/assessment/recommendations';
import type { MetricResult } from '@/lib/assessment/results';
import { SAMPLE_REPORT } from '@/lib/assessment/sample';

describe('hitting workbook content', () => {
  it('is the stored workbook, with the expected records', () => {
    const file = readFileSync('data/hitting-workbook/Baseball_Hitting_Development_Workbook.xlsx');
    expect(HITTING_WORKBOOK.source.sha256).toBe(createHash('sha256').update(file).digest('hex'));
    expect(HITTING_WORKBOOK.version).toBe('hitting-wb-v1');
    expect(HITTING_WORKBOOK.drills.map((item) => item.sourceId)).toEqual(Array.from({ length: 40 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`));
    expect(HITTING_WORKBOOK.rehearsals).toHaveLength(7);
    expect(HITTING_WORKBOOK.flaws).toHaveLength(18);
    expect(FLAW_WORKFLOW.map((item) => item.label)).toEqual(['Observe', 'Hypothesis', 'Test', 'Retest', 'Decide']);
  });

  it('carries no web links and keeps its source rows', () => {
    const text = JSON.stringify(HITTING_WORKBOOK);
    expect(text).not.toMatch(/https?:\/\/|www\./i);
    for (const item of [...HITTING_WORKBOOK.drills, ...HITTING_WORKBOOK.rehearsals, ...HITTING_WORKBOOK.flaws]) {
      expect(item.sourceRow).toBeGreaterThan(5);
      expect(item.sourceSheet.length).toBeGreaterThan(0);
    }
  });

  it('spells out workbook ids as drill names, once', () => {
    expect(withWorkbookNames('H27; H32.')).toBe('Mixed-Location Read Toss (H27); Single-Zone Hunt (H32).');
    expect(withWorkbookNames('H08 Inside-Outside Tee Switch; H23 Inside-Lane Front Toss.')).toBe(
      'Inside-Outside Tee Switch (H08); Inside-Lane Front Toss (H23).',
    );
    expect(withWorkbookNames('Alternate with H19.')).toBe(`Alternate with ${workbookName('H19')} (H19).`);
    expect(withWorkbookNames('No ids here.')).toBe('No ids here.');
  });

  it('does not point site readers at the workbook’s own log sheets', () => {
    expect(siteText('Score 10 swings on landing before and after (Video Log).')).toBe(
      'Score 10 swings on landing before and after (your video notes).',
    );
    for (const item of [...FLAWS, ...FLAW_WORKFLOW]) expect(JSON.stringify(item)).not.toMatch(/Video Log/);
    for (const item of WORKBOOK_DRILLS) expect(JSON.stringify(item)).not.toMatch(/Video Log/);
  });
});

describe('workbook drills in the drill library', () => {
  const byId = (sourceId: string) => drill(workbookDrillKey(sourceId));

  it('adds all 40 hitting drills and every rehearsal except the held-back band drill', () => {
    expect(WORKBOOK_DRILLS).toHaveLength(46);
    for (const item of HITTING_WORKBOOK.drills) expect(byId(item.sourceId)?.name).toBe(item.name);
    expect(HELD_BACK_REHEARSALS).toEqual(['R04']);
    expect(byId('R04')).toBeUndefined();
    for (const item of WORKBOOK_DRILLS) {
      expect(item.key).toMatch(/^hit-[hr]\d{2}$/);
      expect(item.discipline).toBe('hitting');
      expect(item.version).toBe(1);
      expect(DRILLS.filter((entry) => entry.key === item.key)).toHaveLength(1);
    }
  });

  it('fills the written instructions and keeps the workbook’s coaching detail', () => {
    for (const item of WORKBOOK_DRILLS) {
      for (const text of [item.name, item.purpose, item.setup, item.dosage, item.reassessment]) expect(text.length).toBeGreaterThan(5);
      expect(item.steps.length).toBeGreaterThan(0);
      expect(item.cues.length).toBe(1);
      expect(item.equipment.length).toBeGreaterThan(0);
      expect(item.workbook?.sourceRow).toBeGreaterThan(5);
    }
    for (const item of WORKBOOK_DRILLS.filter((entry) => entry.workbook?.kind === 'drill')) {
      for (const text of [item.regression, item.progression, item.completion, item.workbook?.mistake, item.workbook?.safety]) {
        expect((text ?? '').length).toBeGreaterThan(5);
      }
    }
  });

  it('links drills only to hitting measures, with matching pillars', () => {
    for (const item of WORKBOOK_DRILLS) {
      for (const key of item.findings) expect(metric(key)?.discipline).toBe('hitting');
      expect([...item.pillars].sort()).toEqual([...new Set(item.findings.map((key) => metric(key)?.pillar))].sort());
    }
  });

  it('treats pitch-selection drills as swing decisions the assessment does not score', () => {
    for (const item of WORKBOOK_DRILLS.filter((entry) => entry.workbook?.section.startsWith('D '))) {
      expect(item.findings).toEqual([]);
      expect(item.reassessment).toMatch(/not scored in the assessment/);
      expect(worksOn(item)).toMatch(/^Swing decisions/);
    }
    for (const item of WORKBOOK_DRILLS.filter((entry) => /^[ABC] /.test(entry.workbook?.section ?? ''))) {
      expect(item.findings.length).toBeGreaterThan(0);
    }
  });

  it('needs a partner for every toss and live drill', () => {
    for (const item of HITTING_WORKBOOK.drills) {
      const needsPartner = item.section.startsWith('C ') || item.section.startsWith('D ');
      expect(byId(item.sourceId)?.requires.includes('partner')).toBe(needsPartner);
    }
  });
});

describe('replaced starter drills', () => {
  const replaced = DRILLS.filter((item) => item.replacedBy);

  it('switches off exactly five starter drills, each pointing at active workbook drills', () => {
    expect(replaced.map((item) => item.key).sort()).toEqual(
      ['hit-contact-point-map', 'hit-front-toss-tempo', 'hit-line-drive-rounds', 'hit-rhythm-load-tee', 'hit-stride-line'].sort(),
    );
    for (const item of replaced) {
      for (const key of item.replacedBy ?? []) {
        expect(drill(key)?.workbook).toBeDefined();
        expect(drill(key)?.replacedBy).toBeUndefined();
      }
    }
  });

  it('keeps them findable for older plans but out of new plans', () => {
    for (const item of replaced) {
      expect(drill(item.key, item.version)).toBeDefined();
      expect(drillsFor('hitting').some((entry) => entry.key === item.key)).toBe(false);
    }
  });
});

describe('swing-flaw guide', () => {
  it('links only hitting measures to known flaws, most direct first', () => {
    for (const [key, flaws] of Object.entries(METRIC_FLAWS)) {
      expect(metric(key)?.discipline).toBe('hitting');
      expect(flaws.length).toBeGreaterThan(0);
      expect(flawsForMetric(key).map((item) => item.sourceId)).toEqual(flaws);
    }
    expect(flawsForMetric('hit_bat_speed_mph')).toEqual([]);
  });

  it('reaches every flaw from a measure except the two decision flaws', () => {
    for (const flaw of FLAWS) {
      const linked = metricsForFlaw(flaw.sourceId as FlawId);
      if (DECISION_FLAWS.includes(flaw.sourceId as FlawId)) expect(linked).toEqual([]);
      else expect(linked.length).toBeGreaterThan(0);
    }
  });

  it('names only drills that are in the library and open to new plans', () => {
    const open = new Set(drillsFor('hitting').map((item) => item.key));
    for (const flaw of FLAWS) {
      expect(flaw.drills.length).toBeGreaterThan(0);
      for (const id of flaw.drills) expect(open.has(workbookDrillKey(id))).toBe(true);
      for (const text of [flaw.whatYouSee, flaw.checks, flaw.cue, flaw.avoid, flaw.progressMarker, flaw.retest]) expect(text.length).toBeGreaterThan(5);
    }
  });
});

describe('flaw-guided suggestions', () => {
  const base = SAMPLE_REPORT.results.metrics.find((item) => item.metric_key === 'hit_barrel_delivery_consistency') as MetricResult;
  const weakBarrel: MetricResult = { ...base, value: 2, score: 25 };
  const metrics = SAMPLE_REPORT.results.metrics.map((item) => (item.metric_key === base.metric_key ? weakBarrel : item));

  it('takes one drill from each possible flaw in turn, with the cause to check and its retest', () => {
    const plan = suggestPlan('hitting', metrics, { priorityMetrics: ['hit_barrel_delivery_consistency'] });
    const barrel = plan.suggestions.filter((item) => item.finding.metricKey === 'hit_barrel_delivery_consistency');
    // T03 (casting) lists H12 first; T04 (hands drop) lists H13 first.
    expect(barrel.map((item) => [item.drill.key, item.flaw?.sourceId])).toEqual([
      ['hit-h12', 'T03'],
      ['hit-h13', 'T04'],
    ]);
    for (const item of barrel) {
      expect(item.reason).toMatch(/^Suggested because /);
      expect(item.reason).toContain(`One possible cause is "${item.flaw?.issue}"`);
      expect(item.reason).toContain('To tell causes apart:');
      expect(item.evaluation.startsWith(item.flaw?.retest ?? '?')).toBe(true);
      expect(item.drill.findings).toContain('hit_barrel_delivery_consistency');
    }
  });

  it('skips flaw drills that need something missing and never suggests a replaced drill', () => {
    const plan = suggestPlan('hitting', metrics, { priorityMetrics: ['hit_fc_to_contact_ms'], available: { partner: false } });
    for (const item of plan.suggestions) {
      expect(item.drill.requires.includes('partner')).toBe(false);
      expect(item.drill.replacedBy).toBeUndefined();
    }
  });

  it('leaves pitching suggestions to the drills linked to each measure', () => {
    const plan = suggestPlan('pitching', []);
    expect(plan.suggestions).toEqual([]);
  });
});
