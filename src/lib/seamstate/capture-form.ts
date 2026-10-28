/**
 * Reads the SeamState request form into a capture context
 * (src/lib/seamstate/capture.ts). Only the chosen setting's answers are kept,
 * because the database refuses details that belong to another setting.
 * Framework-free, so it is tested directly.
 */

import { captureContextSchema, type CaptureContext } from '@/lib/seamstate/capture';

export type CaptureFormResult =
  | { readonly ok: true; readonly context: CaptureContext }
  | { readonly ok: false; readonly message: string; readonly fieldErrors: Readonly<Record<string, string>> };

function text(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function zone(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  return raw === null ? null : Number(raw);
}

function yesNo(formData: FormData, name: string): boolean | null {
  const raw = text(formData, name);
  return raw === 'yes' ? true : raw === 'no' ? false : null;
}

function settingFromForm(formData: FormData): Record<string, unknown> {
  const setting = text(formData, 'setting');
  switch (setting) {
    case 'tee':
      return { setting, teeZone: zone(formData, 'tee_zone') };
    case 'front_toss':
      return {
        setting,
        locationAnnounced: yesNo(formData, 'ft_announced'),
        intendedZone: zone(formData, 'ft_zone'),
        assignment: text(formData, 'ft_assignment'),
      };
    case 'overhand_bp':
      return {
        setting,
        delivery: text(formData, 'bp_delivery'),
        pitchMix: text(formData, 'bp_pitch_mix') ?? 'unknown',
        pitchType: text(formData, 'bp_pitch_type'),
        assignment: text(formData, 'bp_assignment'),
      };
    case 'machine':
      return {
        setting,
        machineSettingAsEntered: text(formData, 'machine_setting'),
        placement: text(formData, 'machine_placement') ?? 'unknown',
        pitchType: text(formData, 'machine_pitch_type'),
      };
    default:
      return { setting };
  }
}

const FIELD_FOR_PATH: Readonly<Record<string, string>> = {
  battingSide: 'batting_side',
  cameraView: 'camera_view',
  'setting.setting': 'setting',
  'setting.teeZone': 'tee_zone',
  'setting.intendedZone': 'ft_zone',
  'setting.delivery': 'bp_delivery',
  'setting.machineSettingAsEntered': 'machine_setting',
  task: 'task',
  devices: 'devices',
  limitations: 'limitations',
};

const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  batting_side: 'Choose right or left.',
  camera_view: 'Choose where the camera was.',
  setting: 'Choose tee, front toss, overhand BP or machine.',
  tee_zone: 'Zones are numbered 1 to 9.',
  ft_zone: 'Zones are numbered 1 to 9.',
  bp_delivery: 'Choose coach BP or a live pitcher.',
  machine_setting: 'Up to 40 characters.',
  task: 'Up to 80 characters.',
  devices: 'Up to five devices, 40 characters each.',
  limitations: 'Up to 200 characters.',
};

export function captureFromForm(formData: FormData): CaptureFormResult {
  const devices = (text(formData, 'devices') ?? '')
    .split(',')
    .map((device) => device.trim())
    .filter((device) => device !== '');
  const parsed = captureContextSchema.safeParse({
    battingSide: text(formData, 'batting_side'),
    cameraView: text(formData, 'camera_view'),
    setting: settingFromForm(formData),
    task: text(formData, 'task'),
    devices,
    limitations: text(formData, 'limitations'),
  });
  if (parsed.success) return { ok: true, context: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.filter((part) => typeof part === 'string').join('.');
    const name = FIELD_FOR_PATH[path] ?? FIELD_FOR_PATH[path.split('.')[0] ?? ''] ?? 'setting';
    fieldErrors[name] ??= FIELD_MESSAGES[name] ?? 'Check this answer.';
  }
  return { ok: false, message: 'Check the swing details below.', fieldErrors };
}
