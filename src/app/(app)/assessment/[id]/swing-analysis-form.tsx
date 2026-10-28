'use client';

import { useActionState, useState } from 'react';

import { requestSwingAnalysisAction } from '@/app/(app)/assessment/seamstate-actions';
import { SelectField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { CAMERA_VIEWS, CAMERA_VIEW_LABELS, PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import { PITCH_TYPES } from '@/lib/assessment/types';
import { IDLE, type ActionState } from '@/lib/forms/action-state';
import { ASSIGNMENT_LABELS } from '@/lib/seamstate/labels';
import { CAPTURE_SETTINGS, CAPTURE_SETTING_LABELS, type CaptureSetting } from '@/lib/seamstate/types';
import { cn } from '@/lib/utils/cn';

const ZONES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function ZoneOptions() {
  return (
    <>
      <option value="">Not sure</option>
      {ZONES.map((zone) => (
        <option key={zone} value={zone}>
          Zone {zone}
        </option>
      ))}
    </>
  );
}

function AssignmentOptions() {
  return (
    <>
      <option value="">Not sure</option>
      {Object.entries(ASSIGNMENT_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </>
  );
}

function PitchOptions() {
  return (
    <>
      <option value="">Not sure</option>
      {PITCH_TYPES.map((pitch) => (
        <option key={pitch} value={pitch}>
          {PITCH_TYPE_LABELS[pitch]}
        </option>
      ))}
    </>
  );
}

/**
 * The swing details SeamState needs for one clip. Only the chosen setting's
 * questions are shown; everything past the setting, batting side and camera
 * view is optional.
 */
export function SwingAnalysisForm({
  assessmentId,
  mediaId,
  requestKey,
  defaultSide,
  defaultView,
}: {
  readonly assessmentId: string;
  readonly mediaId: string;
  /** Made on the server for this page view, so a double submit is one request. */
  readonly requestKey: string;
  readonly defaultSide: 'right' | 'left' | null;
  readonly defaultView: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(requestSwingAnalysisAction, IDLE);
  const [setting, setSetting] = useState<CaptureSetting | ''>('');
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `${name}-${mediaId}`;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField
          id={id('setting')}
          name="setting"
          label="Setting"
          required
          value={setting}
          onChange={(event) => setSetting(event.target.value as CaptureSetting | '')}
          error={errors.setting}
        >
          <option value="">Choose…</option>
          {CAPTURE_SETTINGS.map((value) => (
            <option key={value} value={value}>
              {CAPTURE_SETTING_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <SelectField id={id('side')} name="batting_side" label="Bats" required defaultValue={defaultSide ?? ''} error={errors.batting_side}>
          <option value="">Choose…</option>
          <option value="right">Right-handed</option>
          <option value="left">Left-handed</option>
        </SelectField>
        <SelectField id={id('view')} name="camera_view" label="Camera view" required defaultValue={defaultView ?? ''} error={errors.camera_view}>
          <option value="">Choose…</option>
          {CAMERA_VIEWS.map((view) => (
            <option key={view} value={view}>
              {CAMERA_VIEW_LABELS[view]}
            </option>
          ))}
        </SelectField>
      </div>

      {setting === 'tee' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField id={id('tee-zone')} name="tee_zone" label="Where the tee was" hint="Zones 1 to 9, as in 9-Zone Hitting." error={errors.tee_zone}>
            <ZoneOptions />
          </SelectField>
        </div>
      ) : null}
      {setting === 'front_toss' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField id={id('ft-announced')} name="ft_announced" label="Was the location called before each toss?">
            <option value="">Not sure</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </SelectField>
          <SelectField id={id('ft-zone')} name="ft_zone" label="Intended zone" error={errors.ft_zone}>
            <ZoneOptions />
          </SelectField>
          <SelectField id={id('ft-assignment')} name="ft_assignment" label="Swing assignment">
            <AssignmentOptions />
          </SelectField>
        </div>
      ) : null}
      {setting === 'overhand_bp' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField id={id('bp-delivery')} name="bp_delivery" label="Who threw" required error={errors.bp_delivery}>
            <option value="">Choose…</option>
            <option value="coach_bp">Coach batting practice</option>
            <option value="live_pitcher">A live pitcher</option>
          </SelectField>
          <SelectField id={id('bp-mix')} name="bp_pitch_mix" label="Pitches thrown">
            <option value="unknown">Not sure</option>
            <option value="known">One known pitch type</option>
            <option value="mixed">A mix of pitches</option>
          </SelectField>
          <SelectField id={id('bp-pitch')} name="bp_pitch_type" label="Pitch type (if one)">
            <PitchOptions />
          </SelectField>
          <SelectField id={id('bp-assignment')} name="bp_assignment" label="Swing assignment">
            <AssignmentOptions />
          </SelectField>
        </div>
      ) : null}
      {setting === 'machine' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            id={id('machine-setting')}
            name="machine_setting"
            label="Machine setting, as shown on the machine"
            hint="Kept as you typed it. It is not treated as a measured speed."
            maxLength={40}
            error={errors.machine_setting}
          />
          <SelectField id={id('machine-placement')} name="machine_placement" label="Pitch location">
            <option value="unknown">Not sure</option>
            <option value="fixed">The same spot every pitch</option>
            <option value="variable">It moved around</option>
          </SelectField>
          <SelectField id={id('machine-pitch')} name="machine_pitch_type" label="Pitch type">
            <PitchOptions />
          </SelectField>
        </div>
      ) : null}

      <details>
        <summary className="cursor-pointer font-semibold text-royal-ink underline">Add optional details</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <TextField id={id('task')} name="task" label="What the hitter was working on" maxLength={80} error={errors.task} />
          <TextField
            id={id('devices')}
            name="devices"
            label="Devices running (if any)"
            hint="Separate with commas. Nothing is read from them."
            error={errors.devices}
          />
          <TextField id={id('limitations')} name="limitations" label="Anything about the filming" maxLength={200} error={errors.limitations} />
        </div>
      </details>

      <div className="flex flex-col items-start gap-2">
        <SubmitButton pendingLabel="Requesting…">Analyze this swing</SubmitButton>
      </div>
      {state.message ? (
        <p role={state.status === 'error' ? 'alert' : 'status'} className={cn('text-sm font-semibold', state.status === 'error' ? 'text-danger' : 'text-success-ink')}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
