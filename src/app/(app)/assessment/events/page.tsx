import type { Metadata } from 'next';

import { checkShowcaseResultAction, deleteShowcaseResultAction, recordShowcaseResultAction } from '@/app/(app)/assessment/events/actions';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SHOWCASE_MEASURES, SHOWCASE_SOURCES, SHOWCASE_SOURCE_LABELS, showcaseMeasure, type ShowcaseSource } from '@/lib/assessment/catalog/showcase';
import { athleteContext, type SearchParams } from '@/lib/assessment/server/page-context';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Event Results' };

interface ShowcaseRow {
  readonly id: string;
  readonly event_source: ShowcaseSource;
  readonly event_name: string;
  readonly event_date: string;
  readonly measure: string;
  readonly value: number;
  readonly unit: string;
  readonly profile_url: string | null;
  readonly source_kind: 'self' | 'development_coach';
  readonly checked_at: string | null;
}

export default async function EventResultsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { options, selected, failed } = await athleteContext(searchParams);

  if (!selected) {
    return (
      <>
        <PageTitle title="Event Results">Numbers from showcases and events, kept apart from practice measurements.</PageTitle>
        <Notice tone={failed ? 'error' : 'info'}>
          {failed ? 'Your athletes didn’t load. Refresh the page to try again.' : 'Event results belong to an athlete. Choose or connect an athlete first.'}
        </Notice>
      </>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('athlete_showcase_results')
    .select('id, event_source, event_name, event_date, measure, value, unit, profile_url, source_kind, checked_at')
    .eq('athlete_id', selected.athlete_id)
    .order('event_date', { ascending: false })
    .limit(200);
  const results = (data ?? []) as ShowcaseRow[];
  const isCoach = selected.relation === 'development_coach';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageTitle title="Event Results">
        Record your numbers from showcases and events. They are shown as you entered them, apart from your practice
        measurements, and are marked checked only once your development coach has checked them against the event’s
        published profile.
      </PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/assessment/events" />

        <DashboardSection
          id="results"
          title="Recorded results"
          description="A showcase number is usually a best mark on the day, not a typical one, so it is never combined with practice results."
        >
          {error ? (
            <Notice tone="error">Event results didn&apos;t load. Refresh to try again.</Notice>
          ) : results.length === 0 ? (
            <p className="text-slate">No event results yet.</p>
          ) : (
            <ScrollTable label="Event results">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-rule">
                    <th className="py-2 pr-3">Event</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Measure</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.id} className="border-b border-rule align-top">
                      <td className="py-2 pr-3">
                        <span className="block font-semibold">{row.event_name}</span>
                        <span className="block text-slate">{SHOWCASE_SOURCE_LABELS[row.event_source]}</span>
                        {row.profile_url ? (
                          <a href={row.profile_url} rel="noopener noreferrer nofollow" target="_blank" className="text-royal-ink underline">
                            Event profile
                          </a>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">{formatDateOnly(row.event_date)}</td>
                      <td className="py-2 pr-3">{showcaseMeasure(row.measure)?.label ?? row.measure}</td>
                      <td className="py-2 pr-3 font-semibold">
                        {row.value} {row.unit}
                      </td>
                      <td className="py-2 pr-3">
                        {row.checked_at
                          ? 'Checked by the development coach'
                          : row.source_kind === 'development_coach'
                            ? 'Entered by the development coach, not checked'
                            : 'Entered by the athlete, not checked'}
                      </td>
                      <td className="space-y-2 py-2">
                        {isCoach ? (
                          <ActionForm
                            action={checkShowcaseResultAction}
                            fields={{ resultId: row.id, checked: row.checked_at ? 'false' : 'true' }}
                            submitLabel={row.checked_at ? 'Remove check' : 'Mark checked'}
                            variant="secondary"
                            size="sm"
                          />
                        ) : null}
                        <ActionForm
                          action={deleteShowcaseResultAction}
                          fields={{ resultId: row.id }}
                          submitLabel="Remove"
                          variant="secondary"
                          size="sm"
                          confirm="Remove this event result?"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </DashboardSection>

        <DashboardSection id="add" title="Add an event result">
          <ActionForm action={recordShowcaseResultAction} fields={{ athleteId: selected.athlete_id }} submitLabel="Save result">
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField id="event_source" name="event_source" label="Event" required defaultValue="">
                <option value="">Choose</option>
                {SHOWCASE_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {SHOWCASE_SOURCE_LABELS[source]}
                  </option>
                ))}
              </SelectField>
              <TextField id="event_name" name="event_name" label="Event name" required minLength={3} maxLength={120} />
              <TextField id="event_date" name="event_date" label="Event date" type="date" required max={today} />
              <SelectField id="measure" name="measure" label="Measure" required defaultValue="">
                <option value="">Choose</option>
                {SHOWCASE_MEASURES.map((measure) => (
                  <option key={measure.key} value={measure.key}>
                    {measure.label} ({measure.unit})
                  </option>
                ))}
              </SelectField>
              <TextField id="value" name="value" label="Result" type="number" step="any" inputMode="decimal" required />
              <TextField
                id="profile_url"
                name="profile_url"
                label="Link to the event profile (optional)"
                type="url"
                maxLength={300}
                hint="Lets your development coach check the number. Must start with https://"
              />
            </div>
          </ActionForm>
        </DashboardSection>
      </div>
    </>
  );
}
