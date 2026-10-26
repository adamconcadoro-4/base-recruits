import type { AthleteOption } from '@/lib/assessment/server/queries';

/** "You", or the athlete's name with the viewer's role for them. */
export function athleteOptionLabel(option: AthleteOption): string {
  if (option.relation === 'athlete') return 'You';
  const role = option.relation === 'guardian' ? 'parent or guardian' : 'development coach';
  return `${option.athlete_name ?? 'Athlete'} (you’re their ${role})`;
}

/**
 * Chooses whose assessments a page shows. A plain GET form, so it works
 * without JavaScript; the athlete id travels as ?athlete=.
 */
export function AthletePicker({
  options,
  selected,
  action,
}: {
  readonly options: readonly AthleteOption[];
  readonly selected: AthleteOption;
  readonly action: string;
}) {
  if (options.length < 2) {
    return selected.relation === 'athlete' ? null : (
      <p className="text-slate">
        Athlete: <span className="font-semibold text-graphite">{athleteOptionLabel(selected)}</span>
      </p>
    );
  }
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="space-y-1.5">
        <label htmlFor="athlete-picker" className="block font-semibold">
          Athlete
        </label>
        <select
          id="athlete-picker"
          name="athlete"
          defaultValue={selected.athlete_id}
          className="block min-h-11 rounded-md border-2 border-field bg-white px-3 py-2"
        >
          {options.map((option) => (
            <option key={option.athlete_id} value={option.athlete_id}>
              {athleteOptionLabel(option)}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="min-h-11 rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy hover:bg-ice">
        Show
      </button>
    </form>
  );
}
