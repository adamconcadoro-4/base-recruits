import type { Metadata } from 'next';
import Link from 'next/link';

import { buildComparisonGroupAction, setComparisonGroupsOpenAction, setReleaseStatusAction } from '@/app/(app)/admin/comparison-groups/actions';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { COMPARISON_CONSENT_TEXT, COMPARISON_CONSENT_VERSION } from '@/lib/assessment/catalog/comparison-groups';
import { AGE_BANDS, AGE_BAND_LABELS, COMPETITION_LEVELS, COMPETITION_LEVEL_LABELS, PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import { NAMED_DEVICES, namedDevice } from '@/lib/assessment/catalog/devices';
import { METRIC_LIST, metric as findMetric } from '@/lib/assessment/catalog/metrics';
import { PROTOCOLS } from '@/lib/assessment/catalog/protocols';
import { PITCH_TYPES } from '@/lib/assessment/types';
import { requireAccess } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Comparison groups' };

interface Settings {
  readonly is_open: boolean;
  readonly consent_text_version: string;
  readonly opted_in: number;
  readonly waiting_for_guardian: number;
  readonly counted: number;
}

interface ReleaseRow {
  readonly id: string;
  readonly metric_key: string;
  readonly protocol_key: string;
  readonly protocol_version: number;
  readonly pitch_type: string | null;
  readonly age_band: string | null;
  readonly competition_level: string | null;
  readonly device_kind: string | null;
  readonly device_model: string | null;
  readonly built_from: 'outside_source' | 'opted_in_athletes';
  readonly status: 'draft' | 'approved' | 'retired';
  readonly distinct_athletes: number;
  readonly dataset_version: string;
  readonly collected_from: string;
  readonly collected_to: string;
}

const MIN_ATHLETES = 30;

export default async function ComparisonGroupsAdminPage() {
  await requireAccess('/admin/comparison-groups');
  const supabase = await createClient();
  const [settingsResult, releasesResult] = await Promise.all([
    supabase.rpc('admin_comparison_group_settings'),
    supabase.rpc('admin_benchmark_releases'),
  ]);
  const settings = ((settingsResult.data ?? []) as Settings[])[0];
  const releases = (releasesResult.data ?? []) as ReleaseRow[];
  const measured = METRIC_LIST.filter((item) => item.scoring !== 'rubric');
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const wordingMatches = settings?.consent_text_version === COMPARISON_CONSENT_VERSION;

  return (
    <>
      <PageTitle title="Comparison groups">
        Groups built from athletes who opted in, so a measured result can show a position among athletes of the same age,
        level and device. <Link href="/admin" className="font-semibold text-royal-ink underline">Back to Admin</Link>
      </PageTitle>
      {settingsResult.error || releasesResult.error || !settings ? (
        <Notice tone="error" className="mb-8">
          Comparison groups didn&apos;t load. Refresh to try again.
        </Notice>
      ) : (
        <div className="space-y-14">
          <DashboardSection
            id="opt-in"
            title="Opting in"
            description={`${settings.opted_in} opted in · ${settings.counted} counted · ${settings.waiting_for_guardian} waiting for a parent or guardian`}
          >
            <div className="space-y-4">
              <StatusChip tone={settings.is_open ? 'positive' : 'neutral'}>{settings.is_open ? 'Open' : 'Closed'}</StatusChip>
              <p className="font-semibold">Wording {settings.consent_text_version} (draft for counsel):</p>
              <div className="max-w-3xl space-y-2 border-l-4 border-royal-ink pl-4 text-sm">
                {COMPARISON_CONSENT_TEXT.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {!wordingMatches ? (
                <Notice tone="error">The site&apos;s wording ({COMPARISON_CONSENT_VERSION}) doesn&apos;t match the database&apos;s. Don&apos;t open until they match.</Notice>
              ) : null}
              <ActionForm action={setComparisonGroupsOpenAction} submitLabel="Save">
                <label className="flex items-center gap-3 font-semibold">
                  <input type="checkbox" name="open" defaultChecked={settings.is_open} className="size-5" />
                  Opting in is open
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="counsel_approved" className="size-5" />
                  Counsel approved wording {settings.consent_text_version}
                </label>
              </ActionForm>
            </div>
          </DashboardSection>

          <DashboardSection
            id="build"
            title="Build a draft group"
            description="Takes one value per opted-in athlete: the result from their most recent matching published report in the dates given. Test accounts are never included."
          >
            <ActionForm action={buildComparisonGroupAction} submitLabel="Build draft group">
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField id="metric" name="metric" label="Measure" required defaultValue="">
                  <option value="">Choose</option>
                  {measured.map((item) => (
                    <option key={`${item.key}@${item.version}`} value={`${item.key}@${item.version}`}>
                      {item.name} ({item.discipline})
                    </option>
                  ))}
                </SelectField>
                <SelectField id="protocol" name="protocol" label="Protocol" required defaultValue="">
                  <option value="">Choose</option>
                  {PROTOCOLS.map((item) => (
                    <option key={`${item.key}@${item.version}`} value={`${item.key}@${item.version}`}>
                      {item.title} (v{item.version})
                    </option>
                  ))}
                </SelectField>
                <SelectField id="device" name="device" label="Device" defaultValue="" hint="Required for measures that need a device.">
                  <option value="">No device (video or observation measures)</option>
                  {NAMED_DEVICES.map((item) => (
                    <option key={item.model} value={`${item.kind}:${item.model}`}>
                      {item.label}
                    </option>
                  ))}
                  <option value="radar:">Any radar gun</option>
                </SelectField>
                <SelectField id="pitch_type" name="pitch_type" label="Pitch type" defaultValue="" hint="Pitch velocity, spin and movement need one.">
                  <option value="">None</option>
                  {PITCH_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {PITCH_TYPE_LABELS[item]}
                    </option>
                  ))}
                </SelectField>
                <SelectField id="age_band" name="age_band" label="Age band" defaultValue="">
                  <option value="">All ages</option>
                  {AGE_BANDS.filter((item) => item !== 'unknown').map((item) => (
                    <option key={item} value={item}>
                      {AGE_BAND_LABELS[item]}
                    </option>
                  ))}
                </SelectField>
                <SelectField id="competition_level" name="competition_level" label="Level" defaultValue="">
                  <option value="">All levels</option>
                  {COMPETITION_LEVELS.map((item) => (
                    <option key={item} value={item}>
                      {COMPETITION_LEVEL_LABELS[item]}
                    </option>
                  ))}
                </SelectField>
                <TextField id="collected_from" name="collected_from" type="date" label="Reports from" required defaultValue={yearAgo} />
                <TextField id="collected_to" name="collected_to" type="date" label="Reports to" required defaultValue={today} />
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" name="coach_reviewed_only" defaultChecked className="size-5" />
                Coach-reviewed reports only (recommended)
              </label>
            </ActionForm>
          </DashboardSection>

          <DashboardSection id="groups" title="Groups and references" description={`A group is used only once approved, and approval needs at least ${MIN_ATHLETES} athletes.`}>
            {releases.length === 0 ? (
              <p className="text-slate">None yet.</p>
            ) : (
              <ScrollTable label="Comparison groups and references">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-rule">
                      <th className="py-2 pr-3">Measure</th>
                      <th className="py-2 pr-3">Who</th>
                      <th className="py-2 pr-3">Device</th>
                      <th className="py-2 pr-3">Athletes</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((row) => (
                      <tr key={row.id} className="border-b border-rule align-top">
                        <td className="py-2 pr-3">
                          <span className="block font-semibold">{findMetric(row.metric_key)?.name ?? row.metric_key}</span>
                          <span className="block text-slate">
                            {row.protocol_key} v{row.protocol_version}
                            {row.pitch_type ? ` · ${PITCH_TYPE_LABELS[row.pitch_type as keyof typeof PITCH_TYPE_LABELS] ?? row.pitch_type}` : ''} ·{' '}
                            {row.dataset_version}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {row.built_from === 'opted_in_athletes' ? 'Opted-in athletes' : 'Outside source'}
                          <span className="block text-slate">
                            {row.age_band ? AGE_BAND_LABELS[row.age_band as keyof typeof AGE_BAND_LABELS] : 'All ages'} ·{' '}
                            {row.competition_level ? COMPETITION_LEVEL_LABELS[row.competition_level as keyof typeof COMPETITION_LEVEL_LABELS] : 'All levels'}
                          </span>
                          <span className="block text-slate">
                            {row.collected_from} to {row.collected_to}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{row.device_model ? namedDevice(row.device_model)?.label : (row.device_kind ?? 'None')}</td>
                        <td className="py-2 pr-3 font-semibold">{row.distinct_athletes}</td>
                        <td className="py-2 pr-3">
                          <StatusChip tone={row.status === 'approved' ? 'positive' : row.status === 'draft' ? 'attention' : 'neutral'}>
                            {row.status === 'approved' ? 'Approved' : row.status === 'draft' ? 'Draft' : 'Retired'}
                          </StatusChip>
                        </td>
                        <td className="space-y-2 py-2">
                          {row.status === 'draft' && row.distinct_athletes >= MIN_ATHLETES ? (
                            <ActionForm action={setReleaseStatusAction} fields={{ releaseId: row.id, status: 'approved' }} submitLabel="Approve" size="sm" />
                          ) : null}
                          {row.status !== 'retired' ? (
                            <ActionForm
                              action={setReleaseStatusAction}
                              fields={{ releaseId: row.id, status: 'retired' }}
                              submitLabel="Retire"
                              variant="secondary"
                              size="sm"
                              confirm="Retire this group? Reports stop showing positions in it."
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            )}
          </DashboardSection>
        </div>
      )}
    </>
  );
}
