/**
 * Contract tests for 9-Zone Hitting: the imported workbook content and the
 * value lists in TypeScript must match the database exactly. Runs when
 * DATABASE_URL points at a migrated database (`npm run test:contract`);
 * skipped otherwise. The seed-in-migration check runs always.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PITCH_TYPES, SOURCE_KINDS } from '@/lib/assessment/types';
import { ZONE_CONTENT } from '@/lib/assessment/zones/content';
import {
  ASSIGNMENT_KINDS,
  CONTACT_OUTCOMES,
  DELIVERY_SOURCES,
  EVENT_KINDS,
  EVIDENCE_METHODS,
  PITCH_CLASSES,
  PITCH_LOCATIONS,
  RESPONSES,
  ROUND_RESPONSES,
  STAGE_DECISIONS,
  ZONE_SIDES,
} from '@/lib/assessment/zones/types';

const DATABASE_URL = process.env.DATABASE_URL;
const PSQL = process.env.PSQL ?? 'psql';
const MIGRATION = fileURLToPath(new URL('../../supabase/migrations/20261027000100_zone_hitting.sql', import.meta.url));

function rows<T>(sql: string): T[] {
  const output = execFileSync(
    PSQL,
    [DATABASE_URL ?? '', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as T[];
}

function checkValues(constraint: string): string[] {
  const [row] = rows<{ def: string }>(`select pg_get_constraintdef(c.oid) as def from pg_constraint c where c.conname = '${constraint}'`);
  if (!row) throw new Error(`constraint ${constraint} not found`);
  return [...row.def.matchAll(/'([^']+)'::text/g)].map((match) => match[1] as string).sort();
}

const sorted = (values: readonly string[]) => [...values].sort();
const byKey = <T extends { key: string }>(items: readonly T[]) => [...items].sort((a, b) => (a.key < b.key ? -1 : 1));

describe('9-Zone content: the migration seeds exactly what the app shows', () => {
  it('matches content-v1.json', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const match = /\$zone\$([\s\S]*?)\$zone\$::jsonb/.exec(sql);
    expect(match).not.toBeNull();
    const seeded = JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>;
    expect(seeded.version).toBe(ZONE_CONTENT.version);
    expect(seeded.source).toEqual({ file: ZONE_CONTENT.source.file, sha256: ZONE_CONTENT.source.sha256 });
    for (const key of ['zones', 'drills', 'stages', 'pairings', 'constraints'] as const) {
      expect(seeded[key]).toEqual(ZONE_CONTENT[key]);
    }
  });
});

describe.skipIf(!DATABASE_URL)('9-Zone Hitting: database and TypeScript agree', () => {
  it('zones', () => {
    const db = rows<Record<string, unknown>>(
      `select zone, location, placement, depth_cue, target_lane, cue, desired_result, common_misses, source_row
         from public.zone_definitions order by zone`,
    );
    expect(db).toEqual(
      ZONE_CONTENT.zones.map((zone) => ({
        zone: zone.zone,
        location: zone.location,
        placement: zone.placement,
        depth_cue: zone.depthCue,
        target_lane: zone.targetLane,
        cue: zone.cue,
        desired_result: zone.desiredResult,
        common_misses: zone.commonMisses,
        source_row: zone.sourceRow,
      })),
    );
  });

  it('drills', () => {
    const db = rows<Record<string, unknown>>(
      `select key, version, source_id, zone, name, level, setup, suggested_volume, execution, depth_cue, target_lane, cue,
              track, watch_for, source_sheet, source_row
         from public.zone_drills where active order by key collate "C", version`,
    );
    expect(db).toEqual(
      byKey(ZONE_CONTENT.drills).map((drill) => ({
        key: drill.key,
        version: drill.version,
        source_id: drill.sourceId,
        zone: drill.zone,
        name: drill.name,
        level: drill.level,
        setup: drill.setup,
        suggested_volume: drill.suggestedVolume,
        execution: drill.execution,
        depth_cue: drill.depthCue,
        target_lane: drill.targetLane,
        cue: drill.cue,
        track: drill.track,
        watch_for: drill.watchFor,
        source_sheet: drill.sourceSheet,
        source_row: drill.sourceRow,
      })),
    );
  });

  it('stages, pairings and constraints', () => {
    expect(
      rows(`select stage, name, source, new_demand, suggested_volume, instructions, measures, next_step, source_row
              from public.zone_stages order by stage`),
    ).toEqual(
      ZONE_CONTENT.stages.map((stage) => ({
        stage: stage.stage,
        name: stage.name,
        source: stage.source,
        new_demand: stage.newDemand,
        suggested_volume: stage.suggestedVolume,
        instructions: stage.instructions,
        measures: stage.measures,
        next_step: stage.nextStep,
        source_row: stage.sourceRow,
      })),
    );
    expect(rows('select key, zones, name, purpose, source_row from public.zone_pairings order by key collate "C"')).toEqual(
      byKey(ZONE_CONTENT.pairings).map((pairing) => ({
        key: pairing.key,
        zones: [...pairing.zones],
        name: pairing.name,
        purpose: pairing.purpose,
        source_row: pairing.sourceRow,
      })),
    );
    expect(
      rows(`select key, category, name, delivery_setup, hitter_assignment, measure, volume_note, source_row
              from public.zone_constraints order by key collate "C"`),
    ).toEqual(
      byKey(ZONE_CONTENT.constraints).map((item) => ({
        key: item.key,
        category: item.category,
        name: item.name,
        delivery_setup: item.deliverySetup,
        hitter_assignment: item.hitterAssignment,
        measure: item.measure,
        volume_note: item.volumeNote,
        source_row: item.sourceRow,
      })),
    );
  });

  it('value lists', () => {
    expect(checkValues('zone_events_location')).toEqual(sorted(PITCH_LOCATIONS));
    expect(checkValues('zone_events_kind')).toEqual(sorted(EVENT_KINDS));
    expect(checkValues('zone_events_side')).toEqual(sorted(ZONE_SIDES));
    expect(checkValues('zone_sessions_side')).toEqual(sorted(ZONE_SIDES));
    expect(checkValues('zone_sessions_delivery')).toEqual(sorted(DELIVERY_SOURCES));
    expect(checkValues('zone_rounds_delivery')).toEqual(sorted(DELIVERY_SOURCES));
    expect(checkValues('zone_assignments_kind')).toEqual(sorted(ASSIGNMENT_KINDS));
    expect(checkValues('zone_events_response')).toEqual(sorted(RESPONSES));
    expect(checkValues('zone_events_contact')).toEqual(sorted(CONTACT_OUTCOMES));
    expect(checkValues('zone_events_class')).toEqual(sorted(PITCH_CLASSES));
    expect(checkValues('zone_events_recognition')).toEqual(sorted(PITCH_CLASSES));
    expect(checkValues('zone_rounds_response')).toEqual(sorted(ROUND_RESPONSES));
    expect(checkValues('zone_progress_decision')).toEqual(sorted(STAGE_DECISIONS));
    expect(checkValues('zone_sessions_decision')).toEqual(sorted(STAGE_DECISIONS.filter((value) => value !== 'set')));
    expect(checkValues('zone_events_evidence')).toEqual(sorted(EVIDENCE_METHODS));
    expect(checkValues('zone_events_pitch_type')).toEqual(sorted(PITCH_TYPES));
    expect(checkValues('zone_events_source')).toEqual(sorted(SOURCE_KINDS));
  });
});
