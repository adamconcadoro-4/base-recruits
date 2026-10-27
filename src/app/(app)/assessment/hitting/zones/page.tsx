import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { clipHref, zoneHref } from '@/components/assessment/zones/links';
import { MetricList } from '@/components/assessment/zones/metric-list';
import { ZoneGrid, type ZoneCell } from '@/components/assessment/zones/zone-grid';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { athleteContext, single, type SearchParams } from '@/lib/assessment/server/page-context';
import { drillsForZone, zoneDefinition } from '@/lib/assessment/zones/content';
import { countOf } from '@/lib/assessment/zones/entry';
import { laneLabel, zonePosition } from '@/lib/assessment/zones/geometry';
import {
  MAP_CONTEXT_LABELS,
  MAP_CONTEXTS,
  MAP_METRICS,
  isMapMetric,
  mapTile,
  zoneAttempts,
  zoneResult,
  type MapContext,
  type MapMetric,
} from '@/lib/assessment/zones/map';
import { PITCH_METRIC_INFO, REP_METRIC_INFO, summarizeZoneEvents } from '@/lib/assessment/zones/metrics';
import { DELIVERY_LABELS, currentStages, zoneList } from '@/lib/assessment/zones/records';
import { getAthleteZoneData } from '@/lib/assessment/zones/server/queries';
import { MIN_ZONE_SAMPLE } from '@/lib/assessment/zones/suggestions';
import { DELIVERY_SOURCES, ZONE_IDS, isZoneId, type DeliverySource, type ZoneId, type ZoneSide } from '@/lib/assessment/zones/types';

export const metadata: Metadata = { title: 'Zone Map' };

const PILLAR_LINKS: ReadonlyArray<{ readonly pillar: string; readonly evidence: string }> = [
  { pillar: 'Load & Timing', evidence: 'Timing notes, adjustment across locations, announced versus unannounced rounds.' },
  { pillar: 'Barrel Delivery', evidence: 'Correct-depth rate and directional accuracy by zone, contact consistency.' },
  { pillar: 'Lower-Body Contribution', evidence: 'Coach-observed posture during set tasks (an observation, not a force measurement).' },
  { pillar: 'Impact & Output', evidence: 'Strike-contact rate and observed hard targeted contact (a coach’s judgment, not measured exit velocity).' },
];

function metricName(context: MapContext, metric: MapMetric): string {
  return context === 'tee' ? REP_METRIC_INFO[metric as keyof typeof REP_METRIC_INFO].label : PITCH_METRIC_INFO[metric as keyof typeof PITCH_METRIC_INFO].label;
}

export default async function ZoneMapPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { options, selected, failed, query } = await athleteContext(searchParams);
  if (!selected) {
    return (
      <>
        <PageTitle title="9-Zone Hitting" />
        <Notice tone={failed ? 'error' : 'info'}>{failed ? 'Your athletes didn’t load. Refresh to try again.' : 'There is no athlete to show yet.'}</Notice>
      </>
    );
  }
  const data = await getAthleteZoneData(selected.athlete_id);
  const latestSide = data.sessions[0]?.batting_side ?? 'right';
  const side: ZoneSide = single(query.side) === 'left' ? 'left' : single(query.side) === 'right' ? 'right' : latestSide;
  const context: MapContext = single(query.context) === 'tee' ? 'tee' : 'pitch';
  const requestedMetric = single(query.metric);
  const metric: MapMetric = isMapMetric(context, requestedMetric) ? requestedMetric : MAP_METRICS[context][0];
  const deliveryText = single(query.delivery);
  const delivery = context === 'pitch' && (DELIVERY_SOURCES as readonly string[]).includes(deliveryText ?? '') ? (deliveryText as DeliverySource) : null;
  const zoneText = Number(single(query.zone));
  const zone: ZoneId | null = isZoneId(zoneText) ? zoneText : null;

  const sideItems = data.items.filter((item) => item.event.battingSide === side);
  const pitchItems = sideItems.filter((item) => item.event.kind === 'pitch' && (delivery === null || item.deliverySource === delivery));
  const mapItems = context === 'tee' ? sideItems.filter((item) => item.event.kind === 'tee_swing') : pitchItems;
  const summary = summarizeZoneEvents(mapItems.map((item) => item.event));
  const pitchSummary = context === 'pitch' ? summary : summarizeZoneEvents(pitchItems.map((item) => item.event));
  const stages = currentStages(data.progress);
  const base = { side, context, metric, delivery: delivery ?? undefined };

  const cells = Object.fromEntries(
    ZONE_IDS.map((id): [ZoneId, ZoneCell] => {
      const breakdown = summary.byZone[id - 1];
      if (!breakdown) throw new Error('zone breakdown missing');
      const result = zoneResult(breakdown, context, metric);
      const tile = mapTile(result, zoneAttempts(breakdown, context));
      const position = zonePosition(id);
      const stage = stages.get(id);
      return [
        id,
        {
          primary: tile.primary,
          secondary: tile.secondary,
          corner: stage ? `Stage ${stage.stage}` : undefined,
          shade: tile.shade,
          href: zoneHref('/assessment/hitting/zones', selected, { ...base, zone: id }, 'zone-detail'),
          selected: zone === id,
          srText: `${position.row} ${position.column}, ${metricName(context, metric)}${stage ? `, stage ${stage.stage}` : ', no stage set'}`,
        },
      ];
    }),
  ) as Record<ZoneId, ZoneCell>;

  const definition = zone ? zoneDefinition(zone) : null;
  const pitchZone = zone ? pitchSummary.byZone[zone - 1] : undefined;
  const teeZone = zone ? summarizeZoneEvents(sideItems.filter((item) => item.event.kind === 'tee_swing').map((item) => item.event)).byZone[zone - 1] : undefined;
  const zoneClips = zone
    ? sideItems.filter((item) => item.row.media_id && item.event.location === `z${zone}`).slice(0, 12)
    : [];
  const stage = zone ? stages.get(zone) : undefined;

  return (
    <>
      <PageTitle title="9-Zone Hitting">
        Pick a zone to see its cue, target lane, drills, stage and results. Results add evidence to the hitting assessment; they never
        change a score.
      </PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/assessment/hitting/zones" />
        {data.failed ? <Notice tone="error">Some results didn’t load. Refresh to try again.</Notice> : null}
        {data.truncated ? <Notice tone="attention">Showing the most recent 5,000 entries; older entries are not included.</Notice> : null}

        <form method="get" action="/assessment/hitting/zones" className="flex flex-wrap items-end gap-3 print:hidden" aria-label="Map settings">
          {selected.relation !== 'athlete' ? <input type="hidden" name="athlete" value={selected.athlete_id} /> : null}
          {zone ? <input type="hidden" name="zone" value={zone} /> : null}
          <MapSelect id="map-side" name="side" label="Hitter" value={side}>
            <option value="right">Right-handed</option>
            <option value="left">Left-handed</option>
          </MapSelect>
          <MapSelect id="map-context" name="context" label="Results from" value={context}>
            {MAP_CONTEXTS.map((item) => (
              <option key={item} value={item}>
                {MAP_CONTEXT_LABELS[item]}
              </option>
            ))}
          </MapSelect>
          <MapSelect id="map-metric" name="metric" label="Show" value={metric}>
            {MAP_METRICS[context].map((item) => (
              <option key={item} value={item}>
                {metricName(context, item)}
              </option>
            ))}
          </MapSelect>
          {context === 'pitch' ? (
            <MapSelect id="map-delivery" name="delivery" label="Delivery" value={delivery ?? ''}>
              <option value="">All pitched balls</option>
              {DELIVERY_SOURCES.filter((item) => item !== 'tee').map((item) => (
                <option key={item} value={item}>
                  {DELIVERY_LABELS[item]}
                </option>
              ))}
            </MapSelect>
          ) : null}
          <button type="submit" className="min-h-11 rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy hover:bg-ice">
            Update map
          </button>
        </form>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,36rem)_1fr]">
          <div className="space-y-4">
            <ZoneGrid
              side={side}
              cells={cells}
              outside={context === 'pitch' ? summary.outside : undefined}
              caption={`${metricName(context, metric)} — ${context === 'tee' ? 'tee swings' : delivery ? DELIVERY_LABELS[delivery].toLowerCase() : 'all pitched balls'}`}
              testId="zone-map"
            />
            <p className="text-sm text-slate">
              Shading appears only with at least {MAP_MIN_TEXT} scored attempts: lighter under 40%, middle 40–69%, darker 70% and up. Fewer
              attempts show the counts and “Too few to judge”. Tee swings and pitched balls are never combined.
            </p>
          </div>

          <section id="zone-detail" aria-labelledby="zone-detail-title" className="space-y-6">
            {definition && zone ? (
              <>
                <div>
                  <h2 id="zone-detail-title" className="text-3xl text-navy">
                    Zone {zone} · {definition.location}
                  </h2>
                  <p className="mt-1 text-slate">{definition.placement}</p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Fact term="Contact-depth cue (individualized starting cue)">{definition.depthCue}</Fact>
                  <Fact term="Target lane">{laneLabel(definition.targetLane, side)}</Fact>
                  <Fact term="One cue">{definition.cue}</Fact>
                  <Fact term="Desired result">{definition.desiredResult}</Fact>
                  <Fact term="Common misses (coaching context, not a diagnosis)">{definition.commonMisses}</Fact>
                  <Fact term="Current stage">
                    {stage ? (
                      <>
                        Stage {stage.stage} — {stage.reason}
                      </>
                    ) : (
                      <>
                        Not set yet.{' '}
                        <Link href={zoneHref('/assessment/hitting/zones/path', selected, {}, `zone-${zone}`)} className="font-semibold text-royal-ink underline">
                          Set a starting stage
                        </Link>
                      </>
                    )}
                  </Fact>
                </dl>
                <ButtonLink href={zoneHref('/assessment/hitting/zones/sessions/new', selected, { zone, side })} data-testid="start-zone-round">
                  Start a focused round on Zone {zone}
                </ButtonLink>

                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-navy">Results in Zone {zone} ({side === 'right' ? 'right' : 'left'}-handed)</h3>
                  {pitchZone && pitchZone.pitches > 0 ? (
                    <MetricList
                      caption={`Pitched balls in Zone ${zone}`}
                      results={[pitchZone.pitch.strike_contact, pitchZone.pitch.hard_targeted, pitchZone.pitch.depth, pitchZone.pitch.lane]}
                    />
                  ) : (
                    <p className="text-slate">No pitched balls recorded in Zone {zone}{delivery ? ` from ${DELIVERY_LABELS[delivery].toLowerCase()}` : ''}.</p>
                  )}
                  {teeZone && teeZone.teeSwings > 0 ? (
                    <MetricList caption={`Tee swings in Zone ${zone}`} results={[teeZone.tee.contact, teeZone.tee.hard_targeted, teeZone.tee.depth, teeZone.tee.lane]} />
                  ) : (
                    <p className="text-slate">No tee swings recorded in Zone {zone}.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-navy">Drills for Zone {zone}</h3>
                  <ul className="space-y-1">
                    {drillsForZone(zone).map((drill) => (
                      <li key={drill.key}>
                        <Link href={zoneHref('/assessment/hitting/zones/drills', selected, { zone }, `drill-${drill.key}`)} className="font-semibold text-royal-ink underline">
                          {drill.sourceId} {drill.name}
                        </Link>{' '}
                        <span className="text-slate">({drill.level})</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-navy">Clips</h3>
                  {zoneClips.length > 0 ? (
                    <ul className="space-y-1">
                      {zoneClips.map((item) => (
                        <li key={item.row.id}>
                          <Link href={clipHref(selected, item.row.media_id ?? '', item.row.clip_time_ms)} className="font-semibold text-royal-ink underline">
                            {formatDateOnly(item.sessionDate)} · {item.event.kind === 'pitch' ? 'pitch' : 'tee swing'} {item.row.seq}
                            {item.row.clip_time_ms !== null ? ` at ${(item.row.clip_time_ms / 1000).toFixed(1)} s` : ''}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate">No clips linked to entries in this zone yet. Link a clip to an entry from the session review.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 id="zone-detail-title" className="text-3xl text-navy">
                  Choose a zone
                </h2>
                <p className="text-slate">Select a zone on the map to see its cue, lane, drills, stage, results and clips.</p>
              </>
            )}
          </section>
        </div>

        <DashboardSection
          id="decisions"
          title="Decision & Recognition"
          description="A separate panel: decisions and recognition are not a mechanical pillar and never lower a mechanics score. Pitched balls only, for the hitter and delivery chosen above."
        >
          <p className="mb-4 text-slate">
            {countOf(pitchSummary.counts.pitches, 'pitch', 'pitches')} · {countOf(pitchSummary.counts.swings, 'swing')} ·{' '}
            {countOf(pitchSummary.counts.strikes, 'strike')} · {countOf(pitchSummary.counts.balls, 'ball')} · {pitchSummary.counts.unknownClass} with unknown
            location
            {pitchSummary.counts.planned > 0 ? ` · ${pitchSummary.counts.onTarget} of ${pitchSummary.counts.planned} planned pitches arrived in the planned zone` : ''}
          </p>
          <MetricList
            caption="Decision and recognition results"
            results={[pitchSummary.pitch.decision, pitchSummary.pitch.chase, pitchSummary.pitch.recognition, pitchSummary.pitch.posture_per10, pitchSummary.pitch.off_plan]}
          />
        </DashboardSection>

        <DashboardSection id="recent" title="Recent sessions" aside={<ButtonLink href={zoneHref('/assessment/hitting/zones/sessions/new', selected, { side })} variant="secondary">Start a session</ButtonLink>}>
          {data.sessions.length === 0 ? (
            <p className="text-slate">No sessions yet.</p>
          ) : (
            <ScrollTable label="Recent sessions">
              <table className="w-full min-w-[36rem] text-left">
                <thead>
                  <tr className="border-b-2 border-rule">
                    <th scope="col" className="py-2 pr-4">Date</th>
                    <th scope="col" className="py-2 pr-4">Focus</th>
                    <th scope="col" className="py-2 pr-4">Stage</th>
                    <th scope="col" className="py-2 pr-4">Delivery</th>
                    <th scope="col" className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.slice(0, 5).map((session) => (
                    <tr key={session.id} className="border-b border-rule">
                      <td className="py-2 pr-4">
                        <Link href={zoneHref(`/assessment/hitting/zones/sessions/${session.id}`, selected)} className="font-semibold text-royal-ink underline">
                          {formatDateOnly(session.session_date)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{zoneList(session.focus_zones)}</td>
                      <td className="py-2 pr-4">{session.stage}</td>
                      <td className="py-2 pr-4">{DELIVERY_LABELS[session.delivery_source]}</td>
                      <td className="py-2">{session.status === 'reviewed' ? 'Reviewed' : 'In progress'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </DashboardSection>

        <DashboardSection id="pillars" title="How zone evidence relates to the hitting pillars">
          <ul className="grid gap-4 md:grid-cols-2">
            {PILLAR_LINKS.map((item) => (
              <li key={item.pillar} className="border-l-4 border-royal-ink pl-4">
                <p className="font-semibold text-navy">{item.pillar}</p>
                <p className="text-slate">{item.evidence}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate">
            There is no overall zone score and no fifth pillar. Training here never raises or lowers an assessment score; reassess to measure
            change. Ball-flight observations do not establish a biomechanical cause.
          </p>
        </DashboardSection>
      </div>
    </>
  );
}

const MAP_MIN_TEXT = String(MIN_ZONE_SAMPLE);

function MapSelect({
  id,
  name,
  label,
  value,
  children,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className="block min-h-11 rounded-md border-2 border-field bg-white px-3 py-2">
        {children}
      </select>
    </div>
  );
}

function Fact({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="space-y-1 border-l-4 border-rule pl-3">
      <dt className="text-sm font-semibold text-slate">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
