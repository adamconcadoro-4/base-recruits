import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { Notice } from '@/components/ui/notice';
import { single, type SearchParams } from '@/lib/assessment/server/page-context';
import { ZONE_CONSTRAINT_CATEGORIES, ZONE_CONTENT, ZONE_DRILL_LEVELS, ZONE_WORKBOOK_PATH, type ZoneDrill } from '@/lib/assessment/zones/content';
import { zoneList } from '@/lib/assessment/zones/records';
import { ZONE_IDS, isZoneId } from '@/lib/assessment/zones/types';

export const metadata: Metadata = { title: 'Drill Library' };

const SOURCE_TOPICS = ['Source status', 'Contact references', 'Using the drills', 'Pitch delivery and safety'];

function matches(drill: ZoneDrill, text: string): boolean {
  const haystack = [drill.sourceId, drill.name, drill.level, drill.setup, drill.execution, drill.cue, drill.track, drill.watchFor, drill.targetLane, drill.depthCue]
    .join(' ')
    .toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * The workbook's 39 drills, with its pairings, live-BP constraints, baseline
 * tests, session template and delivery plan. Content is shown as written in
 * the workbook (source sheet and row kept); it is planning guidance, not a
 * validated standard.
 */
export default async function DrillLibraryPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const query = await searchParams;
  const zoneValue = Number(single(query.zone));
  const zone = isZoneId(zoneValue) ? zoneValue : null;
  const levelValue = single(query.level);
  const level = levelValue && ZONE_DRILL_LEVELS.includes(levelValue) ? levelValue : null;
  const text = (single(query.q) ?? '').slice(0, 80);
  const athlete = single(query.athlete);
  const drills = ZONE_CONTENT.drills.filter(
    (drill) => (zone === null || drill.zone === zone) && (level === null || drill.level === level) && (text === '' || matches(drill, text)),
  );
  const notes = ZONE_CONTENT.startHere.filter((item) => SOURCE_TOPICS.includes(item.topic));

  return (
    <>
      <PageTitle title="Drill Library">
        {ZONE_CONTENT.drills.length} drills from the 9-Zone Hitting workbook, with its pairings, live-BP constraints and planning templates.
      </PageTitle>
      <div className="space-y-12">
        <Notice tone="info" title="How to read this library">
          <ul className="list-disc space-y-1 pl-5">
            {notes.map((item) => (
              <li key={item.topic}>
                <span className="font-semibold">{item.topic}:</span> {item.text}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <a href={ZONE_WORKBOOK_PATH} className="font-semibold text-royal-ink underline" download>
              Download the workbook (Excel)
            </a>{' '}
            — a planning tool with blank logs. Your athletes’ results stay here, not in the download.
          </p>
        </Notice>

        <form method="get" action="/assessment/hitting/zones/drills" className="flex flex-wrap items-end gap-3 print:hidden" aria-label="Filter drills">
          {athlete ? <input type="hidden" name="athlete" value={athlete} /> : null}
          <div className="space-y-1.5">
            <label htmlFor="drill-zone" className="block font-semibold">
              Zone
            </label>
            <select id="drill-zone" name="zone" defaultValue={zone ?? ''} className="block min-h-11 rounded-md border-2 border-field bg-white px-3 py-2">
              <option value="">All zones</option>
              {ZONE_IDS.map((id) => (
                <option key={id} value={id}>
                  Zone {id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="drill-level" className="block font-semibold">
              Level
            </label>
            <select id="drill-level" name="level" defaultValue={level ?? ''} className="block min-h-11 rounded-md border-2 border-field bg-white px-3 py-2">
              <option value="">All levels</option>
              {ZONE_DRILL_LEVELS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="drill-q" className="block font-semibold">
              Equipment, goal or word
            </label>
            <input id="drill-q" name="q" defaultValue={text} maxLength={80} className="block min-h-11 rounded-md border-2 border-field bg-white px-3 py-2" />
          </div>
          <button type="submit" className="min-h-11 rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy hover:bg-ice">
            Filter
          </button>
        </form>

        <DashboardSection id="drills" title={`Drills (${drills.length})`}>
          {drills.length === 0 ? (
            <p className="text-slate">No drills match. Clear a filter to see more.</p>
          ) : (
            <ul className="space-y-4">
              {drills.map((drill) => (
                <li key={drill.key} id={`drill-${drill.key}`} className="scroll-mt-24 border-2 border-rule p-4">
                  <details>
                    <summary className="cursor-pointer">
                      <span className="text-lg font-semibold text-navy">
                        {drill.sourceId} · {drill.name}
                      </span>{' '}
                      <span className="text-slate">
                        Zone {drill.zone} · {drill.level}
                      </span>
                    </summary>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Item term="Setup">{drill.setup}</Item>
                      <Item term="Suggested volume (planning guidance)">{drill.suggestedVolume}</Item>
                      <Item term="Execution">{drill.execution}</Item>
                      <Item term="Contact-depth cue (individualized)">{drill.depthCue}</Item>
                      <Item term="Target lane">{drill.targetLane}</Item>
                      <Item term="One cue">{drill.cue}</Item>
                      <Item term="Track">{drill.track}</Item>
                      <Item term="Watch for">{drill.watchFor}</Item>
                    </dl>
                    <p className="mt-3 text-sm text-slate">
                      Source: {drill.sourceSheet}, row {drill.sourceRow} · content {ZONE_CONTENT.version}, drill version {drill.version}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection id="pairings" title="Zone pairings" description="Contrasting zones to alternate once each zone holds up on its own.">
          <ul className="grid gap-3 md:grid-cols-2">
            {ZONE_CONTENT.pairings.map((pairing) => (
              <li key={pairing.key} className="border-l-4 border-royal-ink pl-4">
                <p className="font-semibold text-navy">
                  {pairing.name} — {zoneList(pairing.zones)}
                </p>
                <p className="text-slate">{pairing.purpose}</p>
              </li>
            ))}
          </ul>
        </DashboardSection>

        <DashboardSection id="constraints" title={`Live-BP constraints (${ZONE_CONTENT.constraints.length})`}>
          <div className="space-y-6">
            {ZONE_CONSTRAINT_CATEGORIES.map((category) => (
              <div key={category}>
                <h3 className="mb-2 text-xl font-semibold text-navy">{category}</h3>
                <ScrollTable label={`${category} constraints`}>
                  <table className="w-full min-w-[44rem] text-left text-sm">
                    <thead>
                      <tr className="border-b-2 border-rule">
                        <th scope="col" className="py-2 pr-3">Constraint</th>
                        <th scope="col" className="py-2 pr-3">Delivery setup</th>
                        <th scope="col" className="py-2 pr-3">Hitter assignment</th>
                        <th scope="col" className="py-2 pr-3">Measure</th>
                        <th scope="col" className="py-2">Volume note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ZONE_CONTENT.constraints
                        .filter((item) => item.category === category)
                        .map((item) => (
                          <tr key={item.key} className="border-b border-rule align-top">
                            <th scope="row" className="py-2 pr-3 font-semibold">{item.name}</th>
                            <td className="py-2 pr-3">{item.deliverySetup}</td>
                            <td className="py-2 pr-3">{item.hitterAssignment}</td>
                            <td className="py-2 pr-3">{item.measure}</td>
                            <td className="py-2">{item.volumeNote}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </ScrollTable>
              </div>
            ))}
          </div>
        </DashboardSection>

        <DashboardSection id="progression" title="Progression stages" description="Stages can differ by zone. Advance with the coach’s criteria and enough evidence; suggested volumes are not pass/fail rules.">
          <ol className="space-y-3">
            {ZONE_CONTENT.stages.map((stage) => (
              <li key={stage.stage} className="border-l-4 border-rule pl-4">
                <p className="font-semibold text-navy">
                  {stage.stage}. {stage.name}
                </p>
                <p>
                  <span className="font-semibold">New demand:</span> {stage.newDemand} · <span className="font-semibold">Suggested volume:</span>{' '}
                  {stage.suggestedVolume}
                </p>
                <p className="text-slate">{stage.instructions}</p>
                <p className="text-sm text-slate">
                  Measures: {stage.measures} · Next: {stage.nextStep}
                </p>
              </li>
            ))}
          </ol>
        </DashboardSection>

        <DashboardSection id="baseline" title="Baseline tests" description="Blocks to spread across sessions — never the full volume in one session.">
          <Table
            label="Baseline tests"
            heads={['Block', 'Setup', 'Volume', 'Measure', 'Notes']}
            rows={ZONE_CONTENT.baselineTests.map((item) => [item.block, item.setup, item.volume, item.measure, item.notes])}
          />
        </DashboardSection>

        <DashboardSection id="session-plan" title="Session template" description="The workbook’s session plan: rounds of 8–12 pitches with a review between rounds.">
          <Table
            label="Session template"
            heads={['Segment', 'Time', 'Volume', 'Task', 'Review']}
            rows={ZONE_CONTENT.sessionPlan.map((item) => [item.segment, item.time, item.volume, item.task, item.review])}
          />
        </DashboardSection>

        <DashboardSection
          id="delivery-plan"
          title="Delivery Plan"
          description="For the person delivering batting practice. It is not a pitching assessment and not a throwing-workload prescription; live pitchers follow their own workload and rest limits."
        >
          <Table
            label="Delivery plan"
            heads={['Finding', 'Delivery plan', 'Guardrail']}
            rows={ZONE_CONTENT.deliveryPlan.map((item) => [item.finding, item.plan, item.guardrail])}
          />
        </DashboardSection>
      </div>
    </>
  );
}

function Item({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-slate">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Table({ label, heads, rows }: { readonly label: string; readonly heads: readonly string[]; readonly rows: ReadonlyArray<readonly string[]> }) {
  return (
    <ScrollTable label={label}>
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-rule">
            {heads.map((head) => (
              <th key={head} scope="col" className="py-2 pr-3">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="border-b border-rule align-top">
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row" className="py-2 pr-3 font-semibold">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex} className="py-2 pr-3">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}
