'use client';

import { useId, type ReactNode } from 'react';

import type { ZoneEntryInput } from '@/lib/assessment/zones/entry';
import { OUTSIDE_LABELS, outsideSide, zoneGrid, zonePosition } from '@/lib/assessment/zones/geometry';
import type { ContactOutcome, EventKind, PitchClass, PitchLocation, SwingResponse } from '@/lib/assessment/zones/types';
import { cn } from '@/lib/utils/cn';

export interface PadClip {
  readonly id: string;
  readonly label: string;
}

type Option<T extends string> = { readonly value: T; readonly label: string };

const optionBase =
  'flex min-h-12 w-full items-center justify-center rounded-md border-2 border-field bg-white px-2 text-center font-semibold text-graphite peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-royal-ink peer-disabled:opacity-60';

/** A row of choices as real radio buttons (keyboard and screen-reader friendly), styled as large buttons. */
function Choice<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
  columns = options.length,
  hideLegend = false,
}: {
  readonly legend: string;
  readonly name: string;
  readonly value: T | null;
  readonly options: readonly Option<T>[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly columns?: number;
  readonly hideLegend?: boolean;
}) {
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className={cn('font-semibold text-graphite', hideLegend && 'sr-only')}>{legend}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <label key={option.value} className="block">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className={optionBase}>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Tri = 'unset' | 'yes' | 'no';
const toTri = (value: boolean | null): Tri => (value === null ? 'unset' : value ? 'yes' : 'no');
const fromTri = (value: Tri): boolean | null => (value === 'unset' ? null : value === 'yes');

function Observation({
  legend,
  name,
  value,
  onChange,
  yes = 'Yes',
  no = 'No',
}: {
  readonly legend: string;
  readonly name: string;
  readonly value: boolean | null;
  readonly onChange: (value: boolean | null) => void;
  readonly yes?: string;
  readonly no?: string;
}) {
  return (
    <Choice<Tri>
      legend={legend}
      name={name}
      value={toTri(value)}
      onChange={(next) => onChange(fromTri(next))}
      options={[
        { value: 'unset', label: 'Not noted' },
        { value: 'yes', label: yes },
        { value: 'no', label: no },
      ]}
    />
  );
}

function LocationButton({
  name,
  location,
  checked,
  onChange,
  children,
  className,
}: {
  readonly name: string;
  readonly location: PitchLocation;
  readonly checked: boolean;
  readonly onChange: (location: PitchLocation) => void;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <label className={cn('flex', className)}>
      <input type="radio" name={name} value={location} checked={checked} onChange={() => onChange(location)} className="peer sr-only" />
      <span className={cn(optionBase, 'min-h-14 flex-col text-base')}>{children}</span>
    </label>
  );
}

/**
 * Everything one entry can record, with the quick choices first (where it
 * arrived, swing or take, contact) and optional observations after. Anything
 * left as "Not noted" is saved as not recorded, never as right or wrong.
 */
export function EntryPad({
  value,
  onChange,
  intendedZones,
  clips,
  kindLocked = false,
  kinds = ['pitch', 'tee_swing', 'dry_rep'],
  showRecognition,
}: {
  readonly value: ZoneEntryInput;
  readonly onChange: (next: ZoneEntryInput) => void;
  readonly intendedZones: readonly number[];
  readonly clips: readonly PadClip[];
  readonly kindLocked?: boolean;
  /** Kinds this round accepts (a tee round has no pitches). */
  readonly kinds?: readonly EventKind[];
  readonly showRecognition: boolean;
}) {
  const id = useId();
  const set = (patch: Partial<ZoneEntryInput>) => onChange({ ...value, ...patch });
  const pitch = value.kind === 'pitch';
  const swing = value.kind === 'tee_swing' || (pitch && value.response === 'swing');
  const side = value.batting_side;
  const insideOnLeft = outsideSide('out_in', side) === 'left';
  const outsideButton = (location: 'out_in' | 'out_away') => (
    <LocationButton name={`${id}-location`} location={location} checked={value.location === location} onChange={(next) => set({ location: next })} className="h-full">
      {OUTSIDE_LABELS[location]}
    </LocationButton>
  );

  return (
    <div className="space-y-5">
      {kindLocked ? null : (
        <Choice<EventKind>
          legend="Entry"
          name={`${id}-kind`}
          value={value.kind}
          onChange={(kind) =>
            onChange({
              ...value,
              kind,
              response: kind === 'tee_swing' ? 'swing' : kind === 'dry_rep' ? null : value.response,
              location: kind !== 'pitch' && value.location?.startsWith('out_') ? null : value.location,
            })
          }
          options={(
            [
              { value: 'pitch', label: 'Pitch' },
              { value: 'tee_swing', label: 'Tee swing' },
              { value: 'dry_rep', label: 'Dry rep' },
            ] as const
          ).filter((option) => kinds.includes(option.value))}
        />
      )}

      {pitch && intendedZones.length > 0 ? (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-planned`} className="block font-semibold text-graphite">
            Planned zone (where it was meant to go)
          </label>
          <select
            id={`${id}-planned`}
            value={value.intended_zone ?? ''}
            onChange={(event) => set({ intended_zone: event.target.value ? Number(event.target.value) : null })}
            className="block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 sm:max-w-xs"
          >
            <option value="">Not planned / not noted</option>
            {intendedZones.map((zone) => (
              <option key={zone} value={zone}>
                Zone {zone}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="font-semibold text-graphite">{pitch ? 'Where it actually arrived' : 'Zone'}</legend>
        <p className="text-sm text-slate">Catcher’s view · {side === 'right' ? 'right' : 'left'}-handed hitter · inside is on the {insideOnLeft ? 'left' : 'right'}</p>
        <div className={cn('grid gap-2', pitch ? 'grid-cols-[4.5rem_1fr_4.5rem]' : 'grid-cols-1')}>
          {pitch ? (
            <>
              <span aria-hidden="true" />
              <LocationButton name={`${id}-location`} location="out_high" checked={value.location === 'out_high'} onChange={(next) => set({ location: next })}>
                {OUTSIDE_LABELS.out_high}
              </LocationButton>
              <span aria-hidden="true" />
            </>
          ) : null}
          {pitch ? outsideButton(insideOnLeft ? 'out_in' : 'out_away') : null}
          <div className="grid grid-cols-3 gap-2">
            {zoneGrid(side)
              .flat()
              .map((zone) => {
                const position = zonePosition(zone);
                return (
                  <LocationButton key={zone} name={`${id}-location`} location={`z${zone}`} checked={value.location === `z${zone}`} onChange={(next) => set({ location: next })}>
                    <span className="text-lg">
                      <span className="sr-only">Zone </span>
                      {zone}
                    </span>
                    <span className="text-xs font-normal">
                      {position.row} {position.column === 'middle' ? 'mid' : position.column}
                    </span>
                  </LocationButton>
                );
              })}
          </div>
          {pitch ? outsideButton(insideOnLeft ? 'out_away' : 'out_in') : null}
          {pitch ? (
            <>
              <span aria-hidden="true" />
              <LocationButton name={`${id}-location`} location="out_low" checked={value.location === 'out_low'} onChange={(next) => set({ location: next })}>
                {OUTSIDE_LABELS.out_low}
              </LocationButton>
              <span aria-hidden="true" />
            </>
          ) : null}
        </div>
        <LocationButton name={`${id}-location`} location="unknown" checked={value.location === 'unknown'} onChange={(next) => set({ location: next })} className="sm:max-w-xs">
          Location unknown
        </LocationButton>
      </fieldset>

      {pitch && value.location === 'unknown' ? (
        <Choice<PitchClass | 'unset'>
          legend="Was it a strike or a ball? (only if you know)"
          name={`${id}-class`}
          value={value.pitch_class ?? 'unset'}
          onChange={(next) => set({ pitch_class: next === 'unset' ? null : next })}
          options={[
            { value: 'unset', label: 'Not known' },
            { value: 'strike', label: 'Strike' },
            { value: 'ball', label: 'Ball' },
          ]}
        />
      ) : null}

      {pitch ? (
        <Choice<SwingResponse>
          legend="Swing or take"
          name={`${id}-response`}
          value={value.response}
          onChange={(response) =>
            set({
              response,
              ...(response === 'take'
                ? { contact: null, hard_targeted: null, depth_correct: null, lane_correct: null, posture_error: null }
                : { forced_take: false }),
            })
          }
          options={[
            { value: 'swing', label: 'Swing' },
            { value: 'take', label: 'Take' },
          ]}
        />
      ) : null}

      {swing ? (
        <Choice<ContactOutcome | 'unset'>
          legend="Contact"
          name={`${id}-contact`}
          value={value.contact ?? 'unset'}
          onChange={(next) => set({ contact: next === 'unset' ? null : next, lane_correct: next === 'fair' ? value.lane_correct : null })}
          columns={3}
          options={[
            { value: 'miss', label: 'Miss' },
            { value: 'foul', label: 'Foul' },
            { value: 'fair', label: 'Fair ball' },
            { value: 'unknown', label: 'Not seen' },
            { value: 'unset', label: 'Not noted' },
          ]}
        />
      ) : null}

      <details className="rounded-md border-2 border-rule p-3" open={value.hard_targeted !== null || value.depth_correct !== null || value.posture_error !== null}>
        <summary className="cursor-pointer font-semibold text-royal-ink">More observations (optional)</summary>
        <div className="mt-4 space-y-4">
          {swing ? (
            <>
              <Observation legend="Hard contact in the target lane" name={`${id}-hard`} value={value.hard_targeted} onChange={(next) => set({ hard_targeted: next })} />
              <Observation legend="Contact at the agreed depth" name={`${id}-depth`} value={value.depth_correct} onChange={(next) => set({ depth_correct: next })} />
              {value.contact === 'fair' ? (
                <Observation legend="Ball went into the target lane" name={`${id}-lane`} value={value.lane_correct} onChange={(next) => set({ lane_correct: next })} />
              ) : null}
            </>
          ) : null}
          {swing || value.kind === 'dry_rep' ? (
            <Observation legend="Posture error seen" name={`${id}-posture`} value={value.posture_error} onChange={(next) => set({ posture_error: next })} yes="Error seen" no="No error" />
          ) : null}
          {pitch && showRecognition ? (
            <Choice<PitchClass | 'unset'>
              legend="Hitter’s ball/strike call"
              name={`${id}-call`}
              value={value.recognition_call ?? 'unset'}
              onChange={(next) => set({ recognition_call: next === 'unset' ? null : next })}
              options={[
                { value: 'unset', label: 'No call' },
                { value: 'strike', label: 'Called strike' },
                { value: 'ball', label: 'Called ball' },
              ]}
            />
          ) : null}
          {pitch ? (
            <div className="space-y-2">
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" checked={value.off_plan} onChange={(event) => set({ off_plan: event.target.checked })} className="size-5" />
                <span>Off-plan delivery (missed the planned condition — a delivery note, not a hitter result)</span>
              </label>
              {value.off_plan ? (
                <input
                  aria-label="Why it was off-plan"
                  value={value.off_plan_reason ?? ''}
                  maxLength={200}
                  onChange={(event) => set({ off_plan_reason: event.target.value })}
                  placeholder="e.g. meant away, came inside"
                  className="block min-h-11 w-full rounded-md border-2 border-field bg-white px-3"
                />
              ) : null}
            </div>
          ) : null}
          {pitch && value.response === 'take' ? (
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={value.forced_take} onChange={(event) => set({ forced_take: event.target.checked })} className="size-5" />
              <span>The round’s rules required this take (not a decision)</span>
            </label>
          ) : null}
          <div className="space-y-2">
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={value.voided}
                onChange={(event) => set({ voided: event.target.checked, void_reason: event.target.checked ? value.void_reason : null })}
                className="size-5"
              />
              <span>Leave this entry out of every measure (e.g. hitter not ready)</span>
            </label>
            {value.voided ? (
              <input
                aria-label="Why it is left out"
                value={value.void_reason ?? ''}
                maxLength={200}
                onChange={(event) => set({ void_reason: event.target.value })}
                className="block min-h-11 w-full rounded-md border-2 border-field bg-white px-3"
              />
            ) : null}
          </div>
          {clips.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-clip`} className="block font-semibold text-graphite">
                  Clip (optional)
                </label>
                <select
                  id={`${id}-clip`}
                  value={value.media_id ?? ''}
                  onChange={(event) => set({ media_id: event.target.value || null, evidence_method: event.target.value ? value.evidence_method : 'live' })}
                  className="block min-h-11 w-full rounded-md border-2 border-field bg-white px-3"
                >
                  <option value="">No clip</option>
                  {clips.map((clip) => (
                    <option key={clip.id} value={clip.id}>
                      {clip.label}
                    </option>
                  ))}
                </select>
              </div>
              {value.media_id ? (
                <div className="space-y-1.5">
                  <label htmlFor={`${id}-clip-time`} className="block font-semibold text-graphite">
                    At (seconds)
                  </label>
                  <input
                    id={`${id}-clip-time`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={3600}
                    step={0.1}
                    value={value.clip_time_ms === null ? '' : value.clip_time_ms / 1000}
                    onChange={(event) => set({ clip_time_ms: event.target.value === '' ? null : Math.round(Number(event.target.value) * 1000) })}
                    className="block min-h-11 w-full rounded-md border-2 border-field bg-white px-3"
                  />
                </div>
              ) : null}
              {value.media_id ? (
                <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={value.evidence_method === 'video'}
                    onChange={(event) => set({ evidence_method: event.target.checked ? 'video' : 'live' })}
                    className="size-5"
                  />
                  <span>These observations were made from the video (not live)</span>
                </label>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor={`${id}-note`} className="block font-semibold text-graphite">
              Note (optional)
            </label>
            <input
              id={`${id}-note`}
              value={value.note ?? ''}
              maxLength={300}
              onChange={(event) => set({ note: event.target.value })}
              className="block min-h-11 w-full rounded-md border-2 border-field bg-white px-3"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
