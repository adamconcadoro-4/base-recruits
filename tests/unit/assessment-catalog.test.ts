import { describe, expect, it } from 'vitest';

import { DRILLS } from '@/lib/assessment/catalog/drills';
import { METRIC_LIST, eventsFor, metric } from '@/lib/assessment/catalog/metrics';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { PROTOCOLS } from '@/lib/assessment/catalog/protocols';
import { HITTING_PILLARS, PITCHING_PILLARS, pillarsFor } from '@/lib/assessment/types';

describe('metric catalog', () => {
  it('has unique keys and versioned definitions', () => {
    const keys = METRIC_LIST.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(METRIC_LIST.every((item) => Number.isInteger(item.version) && item.version >= 1)).toBe(true);
  });

  it('covers all eight pillars with metrics from the right discipline', () => {
    for (const key of [...HITTING_PILLARS, ...PITCHING_PILLARS]) {
      const items = METRIC_LIST.filter((item) => item.pillar === key);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.discipline === PILLARS[key].discipline)).toBe(true);
      expect(pillarsFor(PILLARS[key].discipline)).toContain(key);
    }
  });

  it('gives every rubric five observable anchors and an "unable to assess" rule', () => {
    const rubrics = METRIC_LIST.filter((item) => item.scoring === 'rubric');
    expect(rubrics.length).toBe(14);
    for (const item of rubrics) {
      expect(item.rubric).not.toBeNull();
      for (const level of [1, 2, 3, 4, 5] as const) expect((item.rubric?.[level] ?? '').length).toBeGreaterThan(30);
      expect((item.rubric?.unableToAssess ?? '').length).toBeGreaterThan(20);
      expect([item.min, item.max, item.valueKind, item.granularity]).toEqual([1, 5, 'rating', 'assessment']);
    }
  });

  it('only lets targetable metrics take targets, and never invents ideal values', () => {
    for (const item of METRIC_LIST) {
      expect(item.targetKinds.length > 0).toBe(item.scoring === 'targetable');
      expect(Object.keys(item)).not.toContain('ideal');
    }
  });

  it('defines each derived metric from an existing metric in the same pillar', () => {
    for (const item of METRIC_LIST.filter((entry) => entry.derived)) {
      const base = metric(item.derived?.from ?? '');
      expect(base?.pillar).toBe(item.pillar);
      expect(item.evidence).toEqual([]);
    }
  });

  it('requires a device for every sensor measurement and never for observations', () => {
    for (const item of METRIC_LIST) {
      if (item.evidence.includes('sensor_measurement')) expect(item.requiresDevice).toBe(true);
      if (item.evidence.includes('observation')) expect(item.requiresDevice).toBe(false);
    }
  });

  it('uses Film Room events from the metric’s own discipline for video timing', () => {
    for (const item of METRIC_LIST.filter((entry) => entry.markers)) {
      expect(eventsFor(item.discipline)).toContain(item.markers?.start);
      expect(eventsFor(item.discipline)).toContain(item.markers?.end);
      expect(item.evidence).toEqual(['video_estimate']);
    }
  });

  it('never describes a metric as measuring injury risk or arm load', () => {
    for (const item of METRIC_LIST) {
      const text = `${item.name} ${item.explanation}`.toLowerCase();
      expect(/injury risk score|elbow torque value|stuff\+/.test(text)).toBe(false);
    }
  });
});

describe('protocols', () => {
  it('reference catalog metrics of their own discipline, with required metrics in every pillar', () => {
    for (const item of PROTOCOLS) {
      for (const entry of item.metrics) {
        expect(metric(entry.key)?.discipline).toBe(item.discipline);
        expect(entry.weight).toBeGreaterThan(0);
      }
      for (const pillarKey of pillarsFor(item.discipline)) {
        const required = item.metrics.filter((entry) => entry.required && metric(entry.key)?.pillar === pillarKey);
        expect(required.length).toBeGreaterThan(0);
      }
      expect(item.mode).not.toBe('lab');
    }
  });

  it('never require a derived metric', () => {
    for (const item of PROTOCOLS) {
      expect(item.metrics.filter((entry) => entry.required && metric(entry.key)?.derived)).toEqual([]);
    }
  });
});

const STARTER = DRILLS.filter((item) => !item.workbook);

describe('drill library', () => {
  it('has at least 12 original starter drills, balanced across hitting and pitching, and unique keys', () => {
    expect(STARTER.length).toBeGreaterThanOrEqual(12);
    const hitting = STARTER.filter((item) => item.discipline === 'hitting').length;
    const pitching = STARTER.filter((item) => item.discipline === 'pitching').length;
    expect(Math.abs(hitting - pitching)).toBeLessThanOrEqual(1);
    expect(new Set(DRILLS.map((item) => item.key)).size).toBe(DRILLS.length);
  });

  it('fills every field of a starter drill and links it to findings in its own discipline', () => {
    for (const item of STARTER) {
      for (const text of [item.name, item.purpose, item.setup, item.dosage, item.regression, item.progression, item.completion, item.reassessment]) {
        expect(text.length).toBeGreaterThan(5);
      }
      expect(item.steps.length).toBeGreaterThan(1);
      expect(item.cues.length).toBeGreaterThan(0);
      expect(item.findings.length).toBeGreaterThan(0);
      for (const key of item.findings) expect(metric(key)?.discipline).toBe(item.discipline);
      for (const pillarKey of item.pillars) expect(PILLARS[pillarKey].discipline).toBe(item.discipline);
    }
  });

  it('never tells a pitcher to add throws or raise intensity', () => {
    for (const item of DRILLS.filter((entry) => entry.discipline === 'pitching')) {
      const text = `${item.dosage} ${item.progression} ${item.steps.join(' ')}`.toLowerCase();
      expect(/throw harder|max effort|increase (your )?(pitch count|volume)|add throws to/.test(text)).toBe(false);
      expect(/plan|no added pitches|dry|no throwing/.test(item.dosage.toLowerCase())).toBe(true);
    }
  });

  it('links no demonstration video it does not have', () => {
    for (const item of DRILLS) expect(JSON.stringify(item)).not.toMatch(/https?:\/\//);
  });
});
