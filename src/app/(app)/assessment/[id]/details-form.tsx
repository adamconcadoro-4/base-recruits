'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { saveContextAction, type ContextInput } from '@/app/(app)/assessment/actions';
import { ContextFields, type ContextDefaults } from '@/components/assessment/context-fields';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import type { Discipline } from '@/lib/assessment/types';

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'error'; readonly message: string; readonly conflict: boolean };

const TEXT_FIELDS = [
  'competition_level',
  'bats',
  'throws',
  'drill_type',
  'equipment',
  'bat_details',
  'environment',
  'surface',
  'capture_limitations',
  'notes',
] as const;

function readForm(form: HTMLFormElement): { date: string; context: ContextInput } {
  const data = new FormData(form);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };
  const context: Record<string, unknown> = {};
  for (const name of TEXT_FIELDS) context[name] = text(name);
  context.camera_views = data.getAll('camera_views').filter((value): value is string => typeof value === 'string');
  const goal = Number(text('rep_goal'));
  context.rep_goal = Number.isFinite(goal) ? goal : 0;
  return { date: text('assessment_date') ?? '', context: context as unknown as ContextInput };
}

/**
 * Assessment details that save themselves a moment after each change. A
 * version number guards against two windows overwriting each other; a failed
 * save keeps what was typed and offers a retry.
 */
export function DetailsForm({
  assessmentId,
  discipline,
  version: initialVersion,
  date,
  defaults,
}: {
  readonly assessmentId: string;
  readonly discipline: Discipline;
  readonly version: number;
  readonly date: string;
  readonly defaults: ContextDefaults;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const versionRef = useRef(initialVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  const save = useCallback(async () => {
    const form = formRef.current;
    if (!form) return;
    if (!form.checkValidity()) {
      setState({ kind: 'error', message: 'Fix the highlighted fields to save.', conflict: false });
      form.reportValidity();
      return;
    }
    setState({ kind: 'saving' });
    const { date: assessmentDate, context } = readForm(form);
    const result = await saveContextAction({ assessmentId, version: versionRef.current, date: assessmentDate, context });
    if (result.ok) {
      versionRef.current = result.version;
      setState({ kind: 'saved' });
    } else {
      setState({ kind: 'error', message: result.message, conflict: result.conflict });
    }
  }, [assessmentId]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 800);
  }, [save]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <form
      ref={formRef}
      onChange={schedule}
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        void save();
      }}
      className="space-y-6"
      data-testid="details-form"
    >
      <TextField
        id="assessment_date"
        name="assessment_date"
        type="date"
        required
        defaultValue={date}
        label="Assessment date"
        className="max-w-xs"
      />
      <ContextFields discipline={discipline} defaults={defaults} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="secondary" disabled={state.kind === 'saving'}>
          Save now
        </Button>
        <p role="status" aria-live="polite" className="text-sm font-semibold">
          {state.kind === 'saving' ? 'Saving…' : state.kind === 'saved' ? 'All changes saved.' : state.kind === 'idle' ? 'Changes save automatically.' : null}
        </p>
      </div>
      {state.kind === 'error' ? (
        <div role="alert" className="border-l-4 border-danger bg-danger-soft px-4 py-3">
          <p className="font-semibold">Not saved: {state.message}</p>
          {state.conflict ? (
            <p className="mt-1 text-sm">
              Someone changed this assessment in another window.{' '}
              <button type="button" className="font-semibold text-royal-ink underline" onClick={() => window.location.reload()}>
                Reload to see the latest
              </button>{' '}
              (what you typed here will be lost).
            </p>
          ) : (
            <button type="button" className="mt-1 text-sm font-semibold text-royal-ink underline" onClick={() => void save()}>
              Try again
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
