import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import {
  CAMERA_VIEWS,
  CAMERA_VIEW_LABELS,
  COMPETITION_LEVELS,
  COMPETITION_LEVEL_LABELS,
  DRILL_TYPE_LABELS,
  drillTypesFor,
} from '@/lib/assessment/catalog/context';
import type { Discipline } from '@/lib/assessment/types';

export interface ContextDefaults {
  readonly competition_level?: string | null;
  readonly bats?: string | null;
  readonly throws?: string | null;
  readonly drill_type?: string | null;
  readonly equipment?: string | null;
  readonly bat_details?: string | null;
  readonly camera_views?: readonly string[];
  readonly environment?: string | null;
  readonly surface?: string | null;
  readonly capture_limitations?: string | null;
  readonly notes?: string | null;
  readonly rep_goal?: number;
}

/**
 * The capture details every assessment records. Shared by the new-assessment
 * form and the autosaving details step; no state of its own.
 */
export function ContextFields({
  discipline,
  defaults,
  disabled = false,
}: {
  readonly discipline: Discipline;
  readonly defaults: ContextDefaults;
  readonly disabled?: boolean;
}) {
  const unit = discipline === 'hitting' ? 'swings' : 'pitches';
  return (
    <fieldset disabled={disabled} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          id="rep_goal"
          name="rep_goal"
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          step={1}
          required
          label={`Goal: valid ${unit}`}
          hint={`How many valid ${unit} you plan to capture. Base Recruits suggests ${discipline === 'hitting' ? 10 : 15}; it is a protocol choice, not a research requirement.`}
          defaultValue={defaults.rep_goal ?? (discipline === 'hitting' ? 10 : 15)}
        />
        <SelectField id="drill_type" name="drill_type" label="Drill" defaultValue={defaults.drill_type ?? ''}>
          <option value="">Not recorded</option>
          {drillTypesFor(discipline).map((value) => (
            <option key={value} value={value}>
              {DRILL_TYPE_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <SelectField id="competition_level" name="competition_level" label="Competition level" defaultValue={defaults.competition_level ?? ''}>
          <option value="">Not recorded</option>
          {COMPETITION_LEVELS.map((value) => (
            <option key={value} value={value}>
              {COMPETITION_LEVEL_LABELS[value]}
            </option>
          ))}
        </SelectField>
        {discipline === 'hitting' ? (
          <SelectField id="bats" name="bats" label="Bats" defaultValue={defaults.bats ?? ''}>
            <option value="">Not recorded</option>
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="switch">Switch</option>
          </SelectField>
        ) : null}
        <SelectField id="throws" name="throws" label="Throws" defaultValue={defaults.throws ?? ''}>
          <option value="">Not recorded</option>
          <option value="right">Right</option>
          <option value="left">Left</option>
        </SelectField>
        <SelectField id="environment" name="environment" label="Environment" defaultValue={defaults.environment ?? ''}>
          <option value="">Not recorded</option>
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
        </SelectField>
        <TextField
          id="surface"
          name="surface"
          label="Surface or setting"
          hint="For example: cage turf, game mound, flat ground."
          maxLength={80}
          defaultValue={defaults.surface ?? ''}
        />
        <TextField
          id="equipment"
          name="equipment"
          label="Equipment"
          hint="Radar, tracking device, machine, ball type — whatever was used."
          maxLength={200}
          defaultValue={defaults.equipment ?? ''}
        />
        {discipline === 'hitting' ? (
          <TextField
            id="bat_details"
            name="bat_details"
            label="Bat"
            hint="Length, weight and type, if you know them."
            maxLength={120}
            defaultValue={defaults.bat_details ?? ''}
          />
        ) : null}
      </div>
      <fieldset className="space-y-2">
        <legend className="font-semibold">Camera views</legend>
        <p className="text-sm text-slate">Choose every angle you filmed. Video estimates are only as good as the angle.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAMERA_VIEWS.map((view) => (
            <label key={view} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                name="camera_views"
                value={view}
                defaultChecked={defaults.camera_views?.includes(view) ?? false}
                className="size-5"
              />
              {CAMERA_VIEW_LABELS[view]}
            </label>
          ))}
        </div>
      </fieldset>
      <TextAreaField
        id="capture_limitations"
        name="capture_limitations"
        label="Capture limitations"
        hint="Anything that limits the evidence: low frame rate, a partly blocked view, poor light, a different bat."
        maxLength={1000}
        defaultValue={defaults.capture_limitations ?? ''}
      />
      <TextAreaField id="notes" name="notes" label="Notes" maxLength={2000} defaultValue={defaults.notes ?? ''} />
    </fieldset>
  );
}
