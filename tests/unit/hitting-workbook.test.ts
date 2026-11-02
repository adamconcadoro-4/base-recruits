import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DRILLS, drill, drillsFor, worksOn } from '@/lib/assessment/catalog/drills';
import { DECISION_FLAWS, FLAW_WORKFLOW, FLAWS, METRIC_FLAWS, flawsForMetric, metricsForFlaw, type FlawId } from '@/lib/assessment/catalog/flaws';
import { metric } from '@/lib/assessment/catalog/metrics';
import { HOME_MENU, HOME_SAFETY, HOME_SESSIONS, HOME_STEPS, PARENT_LANGUAGE } from '@/lib/assessment/catalog/home-practice';
import {
  isSessionTemplateId,
  SESSION_TEMPLATE_IDS,
  sessionTemplate,
  templateAssignments,
  WORKBOOK_SESSIONS as SESSION_TEMPLATES,
} from '@/lib/assessment/catalog/session-templates';
import { HELD_BACK_REHEARSALS, WORKBOOK_DRILLS, workbookDrillKey } from '@/lib/assessment/catalog/workbook-drills';
import { HITTING_WORKBOOK, siteText, withWorkbookNames, workbookName } from '@/lib/assessment/hitting-workbook/content';
import { COUNT_SOURCE_LABELS, describeCounts, formatTotal, practiceCountsProblem, summarizeCounts } from '@/lib/assessment/practice-counts';
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
    expect(HITTING_WORKBOOK.sessions).toHaveLength(8);
    expect(HITTING_WORKBOOK.warmupRoutines).toHaveLength(6);
    expect(HITTING_WORKBOOK.warmupActivities).toHaveLength(14);
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
      expect(new Set(flaw.drills).size).toBe(flaw.drills.length);
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

describe('session templates', () => {
  it('offers the five sessions built only from library drills', () => {
    expect(SESSION_TEMPLATES.map((item) => item.id)).toEqual(['S2', 'S3', 'S5', 'S6', 'S7']);
    expect(HITTING_WORKBOOK.sessions.map((item) => item.sourceId)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
    // Left out: S1 uses a youth game, S4 and S8 medicine-ball work.
    for (const id of ['S1', 'S4', 'S8']) expect(sessionTemplate(id)).toBeUndefined();
  });

  it('keeps every block, its minutes and its order, with ids spelled out', () => {
    for (const item of SESSION_TEMPLATES) {
      const source = HITTING_WORKBOOK.sessions.find((entry) => entry.sourceId === item.id);
      expect(item.blocks.map((entry) => [entry.label, entry.minutes])).toEqual(source?.blocks.map((entry) => [entry.label, entry.minutes]));
      expect(item.totalMinutes).toBe(source?.blocks.reduce((sum, entry) => sum + entry.minutes, 0));
      expect(item.kind).toBe('session');
      for (const entry of item.blocks) {
        expect(entry.activity).not.toMatch(/\b(?:WR\d|WU\d{2}|[HRMG]\d{2})\b(?! ?\))/);
        expect(entry.activity).not.toMatch(/Readiness Log|Video Log/);
      }
      expect(item.blocks[0]?.warmup).not.toBeNull();
    }
    expect(sessionTemplate('S2')?.totalMinutes).toBe(30);
  });

  it('starts a plan with each session drill once, in order, active in the library', () => {
    const open = new Set(drillsFor('hitting').map((item) => item.key));
    expect(sessionTemplate('S2')?.drills.map((item) => item.key)).toEqual(['hit-h01', 'hit-r01', 'hit-h15', 'hit-h11', 'hit-h22', 'hit-h24']);
    for (const item of SESSION_TEMPLATES) {
      const assignments = templateAssignments(item);
      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments.length).toBeLessThanOrEqual(8);
      for (const entry of assignments) {
        expect(open.has(entry.drill.key)).toBe(true);
        expect(entry.dosage.length).toBeLessThanOrEqual(200);
        expect(entry.reason.length).toBeGreaterThanOrEqual(3);
        expect(entry.reason).toMatch(new RegExp(`^From session ${item.id} `));
        expect(entry.reason).not.toMatch(/\.\.$/);
      }
    }
  });

  it('spells out each warm-up routine as named activities', () => {
    const warmup = sessionTemplate('S2')?.blocks[0]?.warmup;
    expect(warmup?.name).toBe('Standard Hitting Warm-Up');
    expect(warmup?.steps.length).toBe(10);
    for (const step of warmup?.steps ?? []) expect(step.activities.length).toBeGreaterThan(0);
    expect(warmup?.steps[3]?.activities.map((item) => item.sourceId)).toEqual(['WU04', 'WU05']);
  });

  it('matches the session ids the database accepts', () => {
    const sql = readFileSync('supabase/migrations/20261102000300_hitting_master_workbook.sql', 'utf8');
    const listed = SESSION_TEMPLATE_IDS.map((id) => `'${id}'`).join(', ');
    expect(sql).toContain(`session_template in (${listed})`);
    expect(sql).toContain(`v_template not in (${listed})`);
    expect(isSessionTemplateId('S2')).toBe(true);
    expect(isSessionTemplateId('ST6')).toBe(true);
    expect(isSessionTemplateId('S4')).toBe(false);
  });
});

describe('home practice guide', () => {
  it('imports the whole parents’ guide', () => {
    expect(HOME_STEPS).toHaveLength(8);
    expect(HOME_SAFETY).toHaveLength(9);
    expect(HOME_MENU).toHaveLength(9);
    expect(HOME_SESSIONS).toHaveLength(5);
    expect(PARENT_LANGUAGE).toHaveLength(5);
  });

  it('points families at the site, not at the workbook’s sheets', () => {
    const text = JSON.stringify([HOME_STEPS, HOME_SESSIONS, HOME_MENU.map(({ setup }) => setup)]);
    expect(text).not.toMatch(/sheet|Practice Log|Coach-Parent Plan|Context =|Video Log/);
    expect(text).not.toMatch(/\b[HR]\d{2}\b(?!\))/);
    expect(HOME_STEPS[0]?.action).toMatch(/development coach has approved/);
    expect(HOME_STEPS[6]?.action).toMatch(/Training Plan page/);
  });

  it('uses library drills under their library names', () => {
    for (const [index, item] of HOME_MENU.entries()) {
      expect(item.drill.name).toBe(HITTING_WORKBOOK.parentsGuide.menu[index]?.option);
      expect(item.drill.replacedBy).toBeUndefined();
    }
  });
});

describe('practice counts', () => {
  const blank = { swings: null, solid_contacts: null, decisions_assessed: null, decisions_correct: null, landings_assessed: null, landings_intended: null };

  it('accepts blanks and whole counts within their totals', () => {
    expect(practiceCountsProblem(blank)).toBeNull();
    expect(practiceCountsProblem({ ...blank, swings: 10, solid_contacts: 7, landings_assessed: 5 })).toBeNull();
  });

  it('refuses a made count without its total, above it, or outside 0 to 300', () => {
    expect(practiceCountsProblem({ ...blank, solid_contacts: 3 })).toMatch(/Solid contacts needs the number of swings/);
    expect(practiceCountsProblem({ ...blank, decisions_assessed: 4, decisions_correct: 5 })).toMatch(/Good decisions/);
    expect(practiceCountsProblem({ ...blank, swings: 301 })).toMatch(/0 to 300/);
    expect(practiceCountsProblem({ ...blank, swings: 2.5 })).toMatch(/whole number/);
    expect(practiceCountsProblem({ ...blank, swings: Number.NaN })).toMatch(/whole number/);
  });

  it('describes one log in words', () => {
    expect(describeCounts({ ...blank, swings: 10, solid_contacts: 7, landings_assessed: 3 })).toEqual([
      'solid contact 7 of 10 swings',
      '3 landings checked',
    ]);
    expect(describeCounts(blank)).toEqual([]);
  });

  it('keeps coach observations apart from family reports and never counts a blank as a miss', () => {
    const summary = summarizeCounts([
      { ...blank, logger_kind: 'development_coach', swings: 10, solid_contacts: 6 },
      { ...blank, logger_kind: 'self', swings: 20, solid_contacts: 15 },
      { ...blank, logger_kind: 'self', swings: 8 },
      { ...blank, logger_kind: 'self', decisions_assessed: 6, decisions_correct: 5 },
    ]);
    expect(summary.map((item) => item.measure.key)).toEqual(['contact', 'decisions']);
    expect(summary[0]?.bySource).toEqual({ development_coach: { made: 6, of: 10, rounds: 1 }, self: { made: 15, of: 20, rounds: 1 } });
    expect(formatTotal({ made: 15, of: 20, rounds: 1 }, 'swings')).toBe('15 of 20 swings (75%)');
    expect(COUNT_SOURCE_LABELS.self).toMatch(/athlete or family/);
  });
});
