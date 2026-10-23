import type { ChipTone } from '@/components/ui/status-chip';

export type JobStatus = 'staging' | 'staged' | 'published' | 'discarded';

export const JOB_STATUS: Readonly<Record<JobStatus, { readonly label: string; readonly tone: ChipTone }>> = {
  staging: { label: 'Staging (incomplete)', tone: 'attention' },
  staged: { label: 'Awaiting review', tone: 'attention' },
  published: { label: 'Published', tone: 'positive' },
  discarded: { label: 'Discarded', tone: 'neutral' },
};

export const CHANGE_LABELS = {
  new: 'New',
  changed: 'Changed',
  missing: 'No longer reported',
  invalid: 'Invalid (skipped)',
  unchanged: 'Unchanged',
} as const;
export type ChangeKind = keyof typeof CHANGE_LABELS;
