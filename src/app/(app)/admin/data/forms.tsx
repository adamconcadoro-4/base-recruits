'use client';

import { useActionState } from 'react';

import {
  discardJobAction,
  publishJobAction,
  restageJobAction,
  setDecisionAction,
  stageSnapshotAction,
} from '@/app/(app)/admin/data/actions';
import { TextAreaField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';
import { cn } from '@/lib/utils/cn';

function Result({ state }: { readonly state: ActionState }) {
  return state.message ? (
    <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
      {state.message}
    </Notice>
  ) : null;
}

export function StageSnapshotForm({ name }: { readonly name: string }) {
  const [state, action] = useActionState<ActionState, FormData>(stageSnapshotAction, IDLE);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="snapshot" value={name} />
      <SubmitButton pendingLabel="Staging… this takes a few seconds">Stage {name} for review</SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function PublishForm({ jobId }: { readonly jobId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(publishJobAction, IDLE);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="jobId" value={jobId} />
      <TextAreaField id="publish-note" name="note" label="Note for the change log (optional)" maxLength={2000} error={errors.note} />
      <div className="flex items-start gap-2.5">
        <input id="publish-confirm" type="checkbox" name="confirm" value="yes" className="mt-1 size-5 accent-royal" aria-describedby={errors.confirm ? 'publish-confirm-error' : undefined} />
        <label htmlFor="publish-confirm">I reviewed the new, changed and missing records above.</label>
      </div>
      {errors.confirm ? (
        <p id="publish-confirm-error" className="text-sm font-semibold text-danger">
          {errors.confirm}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Publishing…">Publish to the public registry</SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function JobButton({
  jobId,
  kind,
}: {
  readonly jobId: string;
  readonly kind: 'discard' | 'restage';
}) {
  const [state, action] = useActionState<ActionState, FormData>(kind === 'discard' ? discardJobAction : restageJobAction, IDLE);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="jobId" value={jobId} />
      <SubmitButton variant={kind === 'discard' ? 'danger' : 'secondary'} size="sm" pendingLabel="Working…">
        {kind === 'discard' ? 'Discard this import' : 'Stage this import again'}
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function DecisionButton({
  jobId,
  unitid,
  decision,
  label,
}: {
  readonly jobId: string;
  readonly unitid: number;
  readonly decision: 'apply' | 'skip';
  readonly label: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(setDecisionAction, IDLE);
  return (
    <form action={action} className={cn('flex flex-col items-start gap-1')}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="unitid" value={String(unitid)} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton variant="quiet" size="sm" pendingLabel="Saving…">
        {label}
      </SubmitButton>
      {state.status === 'error' ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
