'use server';

import { revalidatePath } from 'next/cache';

import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

const PATH = '/admin/comparison-groups';

/** Opens or closes opting in. Open it only after counsel approves the wording version shown. */
export async function setComparisonGroupsOpenAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const open = field(formData, 'open') === 'on';
  if (open && field(formData, 'counsel_approved') !== 'on') {
    return failure('Confirm that counsel approved this wording before opening.', { counsel_approved: 'Required to open.' });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_comparison_groups_open', { p_open: open });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath(PATH);
  revalidatePath('/assessment', 'layout');
  return success(open ? 'Opting in is open.' : 'Opting in is closed. Athletes already in stay in until they leave.');
}

/** Builds a draft group from opted-in athletes' published reports. */
export async function buildComparisonGroupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const [metricKey, metricVersion] = field(formData, 'metric').split('@');
  const [protocolKey, protocolVersion] = field(formData, 'protocol').split('@');
  const device = field(formData, 'device');
  const [deviceKind, deviceModel] = device ? device.split(':') : ['', ''];
  const spec = {
    metric_key: metricKey,
    metric_version: Number(metricVersion),
    protocol_key: protocolKey,
    protocol_version: Number(protocolVersion),
    pitch_type: field(formData, 'pitch_type') || null,
    age_band: field(formData, 'age_band') || null,
    competition_level: field(formData, 'competition_level') || null,
    device_kind: deviceKind || null,
    device_model: deviceModel || null,
    collected_from: field(formData, 'collected_from'),
    collected_to: field(formData, 'collected_to'),
    coach_reviewed_only: field(formData, 'coach_reviewed_only') === 'on',
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_build_comparison_group', { p_spec: spec });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath(PATH);
  return success(`Draft group built (${String(data).slice(0, 8)}). It shows how many athletes it holds below; approve it only once it has at least 30.`);
}

export async function setReleaseStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const status = field(formData, 'status');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_benchmark_release_status', {
    p_release_id: field(formData, 'releaseId'),
    p_status: status,
    p_note: null,
  });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath(PATH);
  return success(status === 'approved' ? 'Approved. Matching reports now show a position in this group.' : 'Retired.');
}
