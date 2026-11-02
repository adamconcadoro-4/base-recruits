import { describe, expect, it } from 'vitest';

import { requireProtocol } from '@/lib/assessment/catalog/protocols';
import {
  NAMED_DEVICES,
  choiceForStored,
  deviceFromChoice,
  deviceModelFor,
  recogniseDevice,
} from '@/lib/assessment/catalog/devices';
import { parseCsv, suggestMapping, validateRows } from '@/lib/assessment/csv';

const ASSESSMENT = '11111111-2222-3333-4444-555555555555';
const hittingKeys = requireProtocol('hitting-instrumented', 1).metrics.map((item) => item.key);

describe('named devices (F52)', () => {
  it('lists the four devices players asked for, each under its own kind', () => {
    expect(NAMED_DEVICES.map((device) => `${device.label}:${device.kind}`)).toEqual([
      'Rapsodo:ball_tracking',
      'TrackMan:ball_tracking',
      'Blast Motion:bat_sensor',
      'Diamond Kinetics:bat_sensor',
    ]);
  });

  it('recognises a named device only under its own kind', () => {
    expect(deviceModelFor('bat_sensor', 'Blast sensor')).toBe('blast_motion');
    expect(deviceModelFor('ball_tracking', 'Blast sensor')).toBeNull();
    expect(deviceModelFor('bat_sensor', 'DK SwingTracker')).toBe('diamond_kinetics');
    expect(deviceModelFor('bat_sensor', 'Darkhorse')).toBeNull();
    expect(deviceModelFor('radar', 'Pocket radar')).toBeNull();
    expect(recogniseDevice('trackman b1')?.model).toBe('trackman');
  });

  it('turns a picker choice into the stored kind and name', () => {
    expect(deviceFromChoice('rapsodo', 'ignored')).toEqual({ ok: true, kind: 'ball_tracking', label: 'Rapsodo', model: 'rapsodo' });
    expect(deviceFromChoice('other:radar', ' Pocket radar ')).toEqual({ ok: true, kind: 'radar', label: 'Pocket radar', model: null });
    expect(deviceFromChoice('other:radar', '')).toMatchObject({ ok: false });
    expect(deviceFromChoice('', null)).toMatchObject({ ok: false });
    expect(deviceFromChoice('made-up', null)).toMatchObject({ ok: false });
  });

  it('prefills the picker from what was stored last', () => {
    expect(choiceForStored('bat_sensor', 'Blast Motion')).toEqual({ choice: 'blast_motion', otherName: '' });
    expect(choiceForStored('radar', 'Pocket radar')).toEqual({ choice: 'other:radar', otherName: 'Pocket radar' });
    expect(choiceForStored(null, null)).toEqual({ choice: '', otherName: '' });
  });
});

describe('file imports with named devices', () => {
  const header = 'rep,metric,value,unit,acquisition,device_kind,device';
  const run = (lines: string[]) => {
    const [head, ...rows] = parseCsv([header, ...lines].join('\n'));
    return validateRows(rows, suggestMapping(head ?? []), { assessmentId: ASSESSMENT, discipline: 'hitting', metricKeys: hittingKeys });
  };

  it('fills in the kind and one name for a named device', () => {
    const outcome = run(['1,hit_bat_speed_mph,70,mph,sensor_measurement,,blast', '2,hit_bat_speed_mph,71,mph,sensor_measurement,bat_sensor,Blast Motion sensor']);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.accepted.map((row) => `${row.device_kind}|${row.device_label}`)).toEqual(['bat_sensor|Blast Motion', 'bat_sensor|Blast Motion']);
  });

  it('says when a named device is given the wrong kind', () => {
    const outcome = run(['1,hit_exit_velocity_mph,88,mph,sensor_measurement,radar,Rapsodo']);
    expect(outcome.accepted).toEqual([]);
    expect(outcome.rejected[0]?.reasons).toContain('Rapsodo is a ball tracker; use device_kind ball_tracking.');
  });

  it('leaves other devices as typed', () => {
    const outcome = run(['1,hit_exit_velocity_mph,88,mph,sensor_measurement,radar,Pocket radar']);
    expect(outcome.accepted[0]).toMatchObject({ device_kind: 'radar', device_label: 'Pocket radar' });
  });
});
