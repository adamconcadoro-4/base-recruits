/**
 * Named devices players can pick when they enter or import a measured value.
 *
 * Decision F52 (founder, 2026-11-01): device names appear only in the device
 * picker, as plain labels with no links or endorsements. Everywhere else the
 * site uses generic words ("bat sensor", "ball tracker").
 *
 * The model key is what comparison groups match on, because two makers'
 * "bat speed" are measured differently. The database derives the same key
 * from the device kind and name (private.assessment_device_model);
 * tests/contract/assessment-catalog.test.ts keeps the two in step.
 */

import type { DeviceKind } from '@/lib/assessment/types';

export const DEVICE_MODELS = ['rapsodo', 'trackman', 'blast_motion', 'diamond_kinetics'] as const;
export type DeviceModel = (typeof DEVICE_MODELS)[number];

export interface NamedDevice {
  readonly model: DeviceModel;
  /** Stored as the device name, so every entry of the same device reads the same. */
  readonly label: string;
  readonly kind: DeviceKind;
}

export const NAMED_DEVICES: readonly NamedDevice[] = [
  { model: 'rapsodo', label: 'Rapsodo', kind: 'ball_tracking' },
  { model: 'trackman', label: 'TrackMan', kind: 'ball_tracking' },
  { model: 'blast_motion', label: 'Blast Motion', kind: 'bat_sensor' },
  { model: 'diamond_kinetics', label: 'Diamond Kinetics', kind: 'bat_sensor' },
];

/** Generic picker choices for any other device; the person types its name. */
export const OTHER_DEVICE_CHOICES: ReadonlyArray<{ readonly value: string; readonly kind: DeviceKind; readonly label: string }> = [
  { value: 'other:radar', kind: 'radar', label: 'Another radar gun' },
  { value: 'other:ball_tracking', kind: 'ball_tracking', label: 'Another ball tracker' },
  { value: 'other:bat_sensor', kind: 'bat_sensor', label: 'Another bat sensor' },
  { value: 'other:other', kind: 'other', label: 'Something else' },
];

export function namedDevice(model: string): NamedDevice | undefined {
  return NAMED_DEVICES.find((device) => device.model === model);
}

/**
 * The named device a device kind and name refer to, or null. Mirrors
 * private.assessment_device_model exactly: the name must match and the kind
 * must be the device's own kind.
 */
export function deviceModelFor(kind: string | null, label: string | null): DeviceModel | null {
  if (!kind || !label) return null;
  const text = label.toLowerCase();
  if (kind === 'ball_tracking' && /rapsodo/.test(text)) return 'rapsodo';
  if (kind === 'ball_tracking' && /track\s*man/.test(text)) return 'trackman';
  if (kind === 'bat_sensor' && /blast/.test(text)) return 'blast_motion';
  if (kind === 'bat_sensor' && /(diamond\s*kinetics|swing\s*tracker|\bdk\b)/.test(text)) return 'diamond_kinetics';
  return null;
}

/** A named device recognised from a name alone (file imports), whatever kind was given. */
export function recogniseDevice(label: string | null): NamedDevice | null {
  if (!label) return null;
  for (const device of NAMED_DEVICES) {
    if (deviceModelFor(device.kind, label) === device.model) return device;
  }
  return null;
}

export type DeviceChoice =
  | { readonly ok: true; readonly kind: DeviceKind; readonly label: string; readonly model: DeviceModel | null }
  | { readonly ok: false; readonly error: string };

/** Reads the picker's value (a model key or "other:<kind>") and the typed name for "other" choices. */
export function deviceFromChoice(choice: string | null, otherName: string | null): DeviceChoice {
  if (!choice) return { ok: false, error: 'Choose the device that measured these values.' };
  const named = namedDevice(choice);
  if (named) return { ok: true, kind: named.kind, label: named.label, model: named.model };
  const other = OTHER_DEVICE_CHOICES.find((item) => item.value === choice);
  if (!other) return { ok: false, error: 'Choose a device from the list.' };
  const name = (otherName ?? '').trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: 'Type the device’s name or model (up to 80 characters).' };
  return { ok: true, kind: other.kind, label: name, model: deviceModelFor(other.kind, name) };
}

/** The picker value that reproduces a stored device, for prefilling the form. */
export function choiceForStored(kind: string | null, label: string | null): { choice: string; otherName: string } {
  const model = deviceModelFor(kind, label);
  if (model) return { choice: model, otherName: '' };
  const other = OTHER_DEVICE_CHOICES.find((item) => item.kind === kind);
  return other ? { choice: other.value, otherName: label ?? '' } : { choice: '', otherName: '' };
}
