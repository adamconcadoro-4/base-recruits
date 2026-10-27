import type { ReactNode } from 'react';

import { SelectField, TextField } from '@/components/ui/field';
import { ZONE_CONSTRAINT_CATEGORIES, ZONE_CONTENT } from '@/lib/assessment/zones/content';
import { zonePosition } from '@/lib/assessment/zones/geometry';
import { ASSIGNMENT_LABELS, DELIVERY_LABELS } from '@/lib/assessment/zones/records';
import { ASSIGNMENT_KINDS, DELIVERY_SOURCES, ZONE_IDS, type AssignmentKind, type DeliverySource, type ZoneSide } from '@/lib/assessment/zones/types';

export interface RoundDefaults {
  readonly side: ZoneSide;
  readonly stage: number;
  readonly delivery: DeliverySource;
  readonly drillKey: string | null;
  readonly constraintKey: string | null;
  readonly cue: string;
  readonly lane: string;
  readonly plannedReps: number | null;
  readonly intendedZones: readonly number[];
  readonly assignmentKind: AssignmentKind;
  readonly swingZones: readonly number[];
  readonly recognitionRequired: boolean;
  /** Zones whose drills are listed first. */
  readonly focusZones: readonly number[];
}

/** A sensible default delivery for a stage (the coach can change it). */
export function deliveryForStage(stage: number): DeliverySource {
  if (stage <= 1) return 'tee';
  if (stage <= 5) return 'toss';
  if (stage <= 7) return 'coach';
  return 'live';
}

export function ZoneCheckboxes({
  name,
  legend,
  hint,
  checked,
  idPrefix,
  testId,
}: {
  readonly name: string;
  readonly legend: ReactNode;
  readonly hint?: ReactNode;
  readonly checked: readonly number[];
  readonly idPrefix: string;
  readonly testId?: string;
}) {
  return (
    <fieldset className="space-y-2" data-testid={testId}>
      <legend className="font-semibold text-graphite">{legend}</legend>
      {hint ? <p className="text-sm text-slate">{hint}</p> : null}
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {ZONE_IDS.map((zone) => {
          const position = zonePosition(zone);
          const id = `${idPrefix}-${name}-${zone}`;
          return (
            <label key={zone} htmlFor={id} className="flex min-h-11 items-center gap-2 rounded-md border-2 border-rule px-2 py-1">
              <input id={id} type="checkbox" name={name} value={zone} defaultChecked={checked.includes(zone)} className="size-5" />
              <span>
                <span className="font-semibold">Zone {zone}</span>
                <span className="block text-xs text-slate">
                  {position.row} {position.column}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The settings for one round: stage, delivery, drill, constraint, cue, lane,
 * planned repetitions and the predeclared swing/take assignment. Used when
 * starting a session and when adding a round.
 */
export function RoundFields({ defaults, idPrefix }: { readonly defaults: RoundDefaults; readonly idPrefix: string }) {
  const focusFirst = [...ZONE_IDS].sort((a, b) => Number(!defaults.focusZones.includes(a)) - Number(!defaults.focusZones.includes(b)) || a - b);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id={`${idPrefix}-side`} name="batting_side" label="Batting side" defaultValue={defaults.side} hint="Record each side separately for a switch hitter.">
          <option value="right">Right-handed</option>
          <option value="left">Left-handed</option>
        </SelectField>
        <SelectField id={`${idPrefix}-stage`} name="stage" label="Stage" defaultValue={String(defaults.stage)} required>
          {ZONE_CONTENT.stages.map((stage) => (
            <option key={stage.stage} value={stage.stage}>
              {stage.stage}. {stage.name}
            </option>
          ))}
        </SelectField>
        <SelectField id={`${idPrefix}-delivery`} name="delivery_source" label="Delivery" defaultValue={defaults.delivery} required>
          {DELIVERY_SOURCES.map((source) => (
            <option key={source} value={source}>
              {DELIVERY_LABELS[source]}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`${idPrefix}-reps`}
          name="planned_reps"
          label="Planned repetitions"
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          defaultValue={defaults.plannedReps ?? ''}
          hint="The workbook suggests rounds of 8–12 pitches; this is planning guidance."
        />
        <SelectField id={`${idPrefix}-drill`} name="drill_key" label="Drill (optional)" defaultValue={defaults.drillKey ?? ''}>
          <option value="">No specific drill</option>
          {focusFirst.map((zone) => (
            <optgroup key={zone} label={`Zone ${zone}`}>
              {ZONE_CONTENT.drills
                .filter((drill) => drill.zone === zone)
                .map((drill) => (
                  <option key={drill.key} value={drill.key}>
                    {drill.sourceId} {drill.name} ({drill.level})
                  </option>
                ))}
            </optgroup>
          ))}
        </SelectField>
        <SelectField id={`${idPrefix}-constraint`} name="constraint_key" label="Active constraint (optional)" defaultValue={defaults.constraintKey ?? ''}>
          <option value="">None</option>
          {ZONE_CONSTRAINT_CATEGORIES.map((category) => (
            <optgroup key={category} label={category}>
              {ZONE_CONTENT.constraints
                .filter((item) => item.category === category)
                .map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </SelectField>
        <TextField id={`${idPrefix}-cue`} name="primary_cue" label="One cue" maxLength={120} defaultValue={defaults.cue} />
        <TextField id={`${idPrefix}-lane`} name="target_lane" label="Target lane" maxLength={80} defaultValue={defaults.lane} />
      </div>

      <ZoneCheckboxes
        name="intended_zones"
        idPrefix={idPrefix}
        legend="Planned locations for this round"
        hint="Where the deliveries are meant to go. The tracker records where each one actually arrived."
        checked={defaults.intendedZones}
      />

      <fieldset className="space-y-3 border-2 border-rule p-4" data-testid={`${idPrefix}-assignment`}>
        <legend className="px-1 font-semibold text-graphite">Swing/take assignment (declared before the round)</legend>
        <p className="text-sm text-slate">Decisions are judged against this assignment and the actual pitch. Changing it later adds a new version; entries already logged keep theirs.</p>
        <div className="space-y-2">
          {ASSIGNMENT_KINDS.map((kind) => (
            <label key={kind} htmlFor={`${idPrefix}-kind-${kind}`} className="flex min-h-11 items-center gap-3">
              <input
                id={`${idPrefix}-kind-${kind}`}
                type="radio"
                name="assignment_kind"
                value={kind}
                defaultChecked={defaults.assignmentKind === kind}
                className="size-5"
                required
              />
              <span>{ASSIGNMENT_LABELS[kind]}</span>
            </label>
          ))}
        </div>
        <ZoneCheckboxes
          name="swing_zones"
          idPrefix={idPrefix}
          legend="For a selective assignment: zones the hitter may swing at"
          checked={defaults.swingZones}
        />
        <label htmlFor={`${idPrefix}-recognition`} className="flex min-h-11 items-center gap-3">
          <input id={`${idPrefix}-recognition`} type="checkbox" name="recognition_required" defaultChecked={defaults.recognitionRequired} className="size-5" />
          <span>The hitter calls ball or strike out loud on every pitch (recognition is only scored from these calls)</span>
        </label>
      </fieldset>
    </div>
  );
}
