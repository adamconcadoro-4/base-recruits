import { describe, expect, it } from 'vitest';

import { captureFromForm } from '@/lib/seamstate/capture-form';
import { failureReason, interpretationNotice, verdictReason } from '@/lib/seamstate/labels';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe('the swing details form', () => {
  it('keeps only the chosen setting’s answers', () => {
    const result = captureFromForm(
      form({ setting: 'tee', batting_side: 'left', camera_view: 'side_facing', tee_zone: '5', ft_zone: '3', machine_setting: '60' }),
    );
    expect(result.ok && result.context.setting).toEqual({ setting: 'tee', teeZone: 5 });
    expect(result.ok && result.context.battingSide).toBe('left');
  });

  it('keeps the machine setting as typed context and splits the devices', () => {
    const result = captureFromForm(
      form({
        setting: 'machine',
        batting_side: 'right',
        camera_view: 'side_behind',
        machine_setting: ' 60 on the dial ',
        machine_pitch_type: 'four_seam',
        devices: 'Blast sensor, , Rapsodo',
        task: 'Stay through the middle',
      }),
    );
    expect(result.ok && result.context.setting).toEqual({
      setting: 'machine',
      machineSettingAsEntered: '60 on the dial',
      placement: 'unknown',
      pitchType: 'four_seam',
    });
    expect(result.ok && result.context.devices).toEqual(['Blast sensor', 'Rapsodo']);
    expect(result.ok && result.context.protocolVersion).toBe('seamstate-capture-v1');
  });

  it('says which answers are missing', () => {
    const result = captureFromForm(form({ setting: 'overhand_bp' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(['batting_side', 'bp_delivery', 'camera_view']);
    }
    const front = captureFromForm(form({ setting: 'front_toss', batting_side: 'right', camera_view: 'rear', ft_zone: '12' }));
    expect(!front.ok && front.fieldErrors.ft_zone).toBe('Zones are numbered 1 to 9.');
    expect(captureFromForm(form({ batting_side: 'right', camera_view: 'rear' })).ok).toBe(false);
  });
});

describe('plain words for results', () => {
  it('turns result codes into retake advice', () => {
    expect(verdictReason('missing_feet')).toContain('feet');
    expect(verdictReason('several_people')).toContain('only the hitter');
    expect(verdictReason('anything_else')).toBe('Part of the clip could not be reviewed.');
  });

  it('never blames the swing for a service problem', () => {
    expect(interpretationNotice('interpreted')).toBeNull();
    expect(interpretationNotice('provider_error')).toContain('nothing to do with your swing');
    expect(failureReason('footage', 'clip_too_long')).toContain('two minutes');
    expect(failureReason('service', 'unknown_code')).toBeNull();
  });
});
