'use server';

import { numberField, rpcAction, switchedOff, textOrNull } from '@/lib/assessment/server/actions';
import { field, failure, type ActionState } from '@/lib/forms/action-state';

const PATHS = ['/assessment/events'];

export async function recordShowcaseResultAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const value = numberField(formData, 'value');
  if (value === null || Number.isNaN(value)) return failure('Enter the number from the event.', { value: 'Enter a number.' });
  const eventDate = textOrNull(formData, 'event_date');
  if (!eventDate) return failure('Enter the event date.', { event_date: 'Enter a date.' });
  return rpcAction(
    'record_showcase_result',
    {
      p_athlete_id: field(formData, 'athleteId'),
      p_event_source: field(formData, 'event_source'),
      p_event_name: field(formData, 'event_name'),
      p_event_date: eventDate,
      p_measure: field(formData, 'measure'),
      p_value: value,
      p_profile_url: textOrNull(formData, 'profile_url'),
    },
    'Saved.',
    PATHS,
  );
}

export async function checkShowcaseResultAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction(
    'check_showcase_result',
    { p_result_id: field(formData, 'resultId'), p_checked: field(formData, 'checked') === 'true' },
    field(formData, 'checked') === 'true' ? 'Marked as checked.' : 'Check removed.',
    PATHS,
  );
}

export async function deleteShowcaseResultAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('delete_showcase_result', { p_result_id: field(formData, 'resultId') }, 'Removed.', PATHS);
}
