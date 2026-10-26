import type { Metadata } from 'next';
import Link from 'next/link';

import { createAssessmentAction } from '@/app/(app)/assessment/actions';
import { PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { athleteOptionLabel } from '@/components/assessment/athlete-picker';
import { ContextFields } from '@/components/assessment/context-fields';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { currentProtocols, MODE_EVIDENCE, MODE_LABELS } from '@/lib/assessment/catalog/protocols';
import { athleteContext, athleteQuery, single, type SearchParams } from '@/lib/assessment/server/page-context';
import { isDiscipline } from '@/lib/assessment/types';

export const metadata: Metadata = { title: 'New assessment' };

export default async function NewAssessmentPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { selected, query } = await athleteContext(searchParams);
  const requested = single(query.discipline);
  const discipline = isDiscipline(requested) ? requested : 'hitting';
  const protocols = currentProtocols(discipline);
  const today = new Date().toISOString().slice(0, 10);

  if (!selected) {
    return (
      <>
        <PageTitle title="New assessment" />
        <Notice>There is no athlete you can start an assessment for yet.</Notice>
      </>
    );
  }

  const other = discipline === 'hitting' ? 'pitching' : 'hitting';
  return (
    <>
      <PageTitle title={`New ${discipline} assessment`}>
        For {athleteOptionLabel(selected) === 'You' ? 'you' : athleteOptionLabel(selected)}. You can change every detail later, until
        the report is published.{' '}
        <Link href={`/assessment/new?discipline=${other}${athleteQuery(selected, '&')}`} className="font-semibold text-royal-ink underline">
          Start a {other} assessment instead
        </Link>
        .
      </PageTitle>
      <ActionForm action={createAssessmentAction} fields={{ athlete_id: selected.athlete_id }} submitLabel="Start the assessment" pendingLabel="Starting…">
        <fieldset className="space-y-3">
          <legend className="text-2xl text-navy">What evidence will you have?</legend>
          {protocols.map((item, index) => (
            <label key={`${item.key}@${item.version}`} className="flex gap-3 border-2 border-rule p-4 has-[:checked]:border-royal-ink has-[:checked]:bg-ice">
              <input
                type="radio"
                name="protocol"
                value={`${item.key}@${item.version}`}
                defaultChecked={index === 0}
                required
                className="mt-1 size-5"
              />
              <span className="space-y-1">
                <span className="block font-semibold">{item.title}</span>
                <span className="block text-sm">{item.summary}</span>
                <span className="block text-sm text-slate">{MODE_EVIDENCE[item.mode]}</span>
              </span>
            </label>
          ))}
          <div className="flex gap-3 border-2 border-dashed border-rule p-4 text-slate">
            <span className="space-y-1">
              <span className="block font-semibold">{MODE_LABELS.lab}</span>
              <span className="block text-sm">{MODE_EVIDENCE.lab}</span>
            </span>
          </div>
        </fieldset>
        <TextField
          id="assessment_date"
          name="assessment_date"
          type="date"
          required
          max={today}
          defaultValue={today}
          label="Assessment date"
          hint="The day the swings or pitches were filmed or measured."
          className="max-w-xs"
        />
        <h2 className="text-2xl text-navy">How it was captured</h2>
        <ContextFields discipline={discipline} defaults={{}} />
      </ActionForm>
    </>
  );
}
