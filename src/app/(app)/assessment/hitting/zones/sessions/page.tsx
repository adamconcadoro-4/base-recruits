import type { Metadata } from 'next';
import Link from 'next/link';

import { PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { zoneHref } from '@/components/assessment/zones/links';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { athleteContext, type SearchParams } from '@/lib/assessment/server/page-context';
import { DELIVERY_LABELS, drillLabel, zoneList } from '@/lib/assessment/zones/records';
import { listZoneSessions } from '@/lib/assessment/zones/server/queries';

export const metadata: Metadata = { title: 'Sessions' };

export default async function ZoneSessionsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { options, selected, failed } = await athleteContext(searchParams);
  if (!selected) {
    return (
      <>
        <PageTitle title="Sessions" />
        <Notice tone={failed ? 'error' : 'info'}>{failed ? 'Your athletes didn’t load. Refresh to try again.' : 'There is no athlete to show yet.'}</Notice>
      </>
    );
  }
  const sessions = await listZoneSessions(selected.athlete_id);
  return (
    <>
      <PageTitle title="Sessions">Every 9-Zone practice session, newest first. Open one to keep logging or to review it.</PageTitle>
      <div className="space-y-8">
        <AthletePicker options={options} selected={selected} action="/assessment/hitting/zones/sessions" />
        <ButtonLink href={zoneHref('/assessment/hitting/zones/sessions/new', selected)} data-testid="new-zone-session">
          Start a session
        </ButtonLink>
        {sessions.failed ? <Notice tone="error">Sessions didn’t load. Refresh to try again.</Notice> : null}
        {sessions.data.length === 0 && !sessions.failed ? (
          <p className="text-slate">No sessions yet.</p>
        ) : (
          <ScrollTable label="Sessions">
            <table className="w-full min-w-[44rem] text-left">
              <thead>
                <tr className="border-b-2 border-rule">
                  <th scope="col" className="py-2 pr-4">Date</th>
                  <th scope="col" className="py-2 pr-4">Focus</th>
                  <th scope="col" className="py-2 pr-4">Stage</th>
                  <th scope="col" className="py-2 pr-4">Delivery</th>
                  <th scope="col" className="py-2 pr-4">Drill</th>
                  <th scope="col" className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.data.map((session) => (
                  <tr key={session.id} className="border-b border-rule">
                    <td className="py-2 pr-4">
                      <Link href={zoneHref(`/assessment/hitting/zones/sessions/${session.id}`, selected)} className="font-semibold text-royal-ink underline">
                        {formatDateOnly(session.session_date)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{zoneList(session.focus_zones)}</td>
                    <td className="py-2 pr-4">{session.stage}</td>
                    <td className="py-2 pr-4">{DELIVERY_LABELS[session.delivery_source]}</td>
                    <td className="py-2 pr-4">{drillLabel(session.drill_key) ?? '—'}</td>
                    <td className="py-2">
                      {session.status === 'reviewed' ? (
                        <StatusChip tone={session.next_plan_approved_at ? 'positive' : 'progress'}>
                          {session.next_plan_approved_at ? 'Reviewed · next plan approved' : 'Reviewed'}
                        </StatusChip>
                      ) : (
                        <StatusChip tone="neutral">In progress</StatusChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </div>
    </>
  );
}
