'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { deleteZoneEntryAction, updateZoneEntryAction } from '@/app/(app)/assessment/hitting/zones/actions';
import { EntryPad, type PadClip } from '@/components/assessment/zones/entry-pad';
import { Button } from '@/components/ui/button';
import { entrySummary, type ZoneEntryInput } from '@/lib/assessment/zones/entry';

export interface ReviewEntry {
  readonly id: string;
  readonly seq: number;
  readonly roundSeq: number;
  readonly summary: string;
  readonly details: string;
  readonly coachLogged: boolean;
  readonly clipHref: string | null;
  readonly input: ZoneEntryInput;
  readonly intendedZones: readonly number[];
  readonly recognitionRequired: boolean;
}

/**
 * Every entry in a round, each correctable with the same pad the tracker
 * uses (richer observations are easier to add here than at the field). The
 * kind of entry and the assignment it was judged against do not change.
 */
export function ReviewEntries({
  entries,
  clips,
  editable,
  coachLocked,
}: {
  readonly entries: readonly ReviewEntry[];
  readonly clips: readonly PadClip[];
  readonly editable: boolean;
  /** The viewer is on the athlete's side, so entries the coach logged are read-only. */
  readonly coachLocked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<ZoneEntryInput | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (entry: ReviewEntry) => {
    if (!draft) return;
    startTransition(async () => {
      const result = await updateZoneEntryAction({ eventId: entry.id, entry: draft });
      setMessage({ id: entry.id, text: result.message, error: !result.ok });
      if (result.ok) {
        setOpen(null);
        router.refresh();
      }
    });
  };

  const remove = (entry: ReviewEntry) => {
    if (!window.confirm(`Remove ${entry.summary}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteZoneEntryAction({ eventId: entry.id });
      setMessage({ id: entry.id, text: result.message, error: !result.ok });
      if (result.ok) router.refresh();
    });
  };

  if (entries.length === 0) return <p className="text-slate">No entries in this round.</p>;
  return (
    <ol className="divide-y-2 divide-rule border-y-2 border-rule">
      {entries.map((entry) => {
        const locked = !editable || (coachLocked && entry.coachLogged);
        return (
          <li key={entry.id} id={`entry-${entry.id}`} className="scroll-mt-24 space-y-2 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-graphite">{entry.summary}</p>
                <p className="text-sm text-slate">{entry.details}</p>
                {entry.clipHref ? (
                  <a href={entry.clipHref} className="text-sm font-semibold text-royal-ink underline">
                    Watch the clip
                  </a>
                ) : null}
              </div>
              {locked ? (
                entry.coachLogged && coachLocked ? <span className="text-sm text-slate">Logged by the coach</span> : null
              ) : (
                <div className="flex gap-2 print:hidden">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-expanded={open === entry.id}
                    onClick={() => {
                      setOpen(open === entry.id ? null : entry.id);
                      setDraft(entry.input);
                      setMessage(null);
                    }}
                  >
                    {open === entry.id ? 'Close' : 'Correct'}
                    <span className="sr-only"> {entry.summary}</span>
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(entry)} disabled={pending}>
                    Remove<span className="sr-only"> {entry.summary}</span>
                  </Button>
                </div>
              )}
            </div>
            {open === entry.id && draft ? (
              <div className="space-y-3 rounded-md border-2 border-royal-ink p-3">
                <EntryPad
                  value={draft}
                  onChange={setDraft}
                  intendedZones={entry.intendedZones}
                  clips={clips}
                  kindLocked
                  showRecognition={entry.recognitionRequired || draft.recognition_call !== null}
                />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => save(entry)} disabled={pending}>
                    {pending ? 'Saving…' : `Save correction to ${entrySummary(draft, entry.seq)}`}
                  </Button>
                  <Button variant="quiet" onClick={() => setOpen(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
            {message?.id === entry.id ? (
              <p role={message.error ? 'alert' : 'status'} className={message.error ? 'font-semibold text-danger' : 'text-success-ink'}>
                {message.text}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
