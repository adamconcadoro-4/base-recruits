'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { deleteZoneEntryAction, logZoneEntryAction } from '@/app/(app)/assessment/hitting/zones/actions';
import { EntryPad, type PadClip } from '@/components/assessment/zones/entry-pad';
import { Button } from '@/components/ui/button';
import { countOf, emptyEntry, entryProblem, entrySummary, entryToEvent, tidyEntry, type ZoneEntryInput } from '@/lib/assessment/zones/entry';
import { metricText, summarizeZoneEvents } from '@/lib/assessment/zones/metrics';
import type { DeliverySource, EventKind, ZoneAssignment, ZoneEvent, ZoneSide } from '@/lib/assessment/zones/types';

export interface TrackerEntry {
  readonly key: string;
  readonly id: string | null;
  readonly seq: number | null;
  readonly status: 'saved' | 'saving' | 'failed';
  readonly message?: string;
  readonly event: ZoneEvent;
  readonly input: ZoneEntryInput | null;
}

type Status = { readonly tone: 'idle' | 'saving' | 'saved' | 'error'; readonly text: string };

let localCounter = 0;
const nextKey = () => `local-${Date.now()}-${(localCounter += 1)}`;

/**
 * The Live Tracker for one round, built for a phone at the field: tap where
 * the ball arrived, swing or take, and the contact; save. Entries save one at
 * a time in order, the save status is announced, the last entry can be
 * undone, and the round's totals update with their counts.
 */
export function Tracker({
  roundId,
  roundSeq,
  side,
  delivery,
  assignment,
  intendedZones,
  initial,
  clips,
  editable,
  reviewHref,
  correctHref,
}: {
  readonly roundId: string;
  readonly roundSeq: number;
  readonly side: ZoneSide;
  readonly delivery: DeliverySource;
  readonly assignment: ZoneAssignment;
  readonly intendedZones: readonly number[];
  readonly initial: readonly TrackerEntry[];
  readonly clips: readonly PadClip[];
  readonly editable: boolean;
  readonly reviewHref: string;
  readonly correctHref: string;
}) {
  const defaultKind: EventKind = delivery === 'tee' ? 'tee_swing' : 'pitch';
  const fresh = useCallback(
    (kind: EventKind): ZoneEntryInput => ({
      ...emptyEntry(kind, side),
      intended_zone: kind === 'pitch' && intendedZones.length === 1 ? (intendedZones[0] ?? null) : null,
    }),
    [intendedZones, side],
  );
  const [entries, setEntries] = useState<TrackerEntry[]>([...initial]);
  const [draft, setDraft] = useState<ZoneEntryInput>(() => fresh(defaultKind));
  const [status, setStatus] = useState<Status>({ tone: 'idle', text: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const queue = useRef<Array<{ key: string; input: ZoneEntryInput }>>([]);
  const running = useRef(false);

  const process = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const job = queue.current[0];
      if (!job) break;
      setStatus({ tone: 'saving', text: 'Saving…' });
      let result: Awaited<ReturnType<typeof logZoneEntryAction>>;
      try {
        result = await logZoneEntryAction({ roundId, entry: job.input });
      } catch {
        result = { ok: false, message: 'No connection. The entry is kept here; try again.' };
      }
      queue.current.shift();
      if (result.ok) {
        const saved = result;
        setEntries((list) =>
          list.map((entry) =>
            entry.key === job.key ? { ...entry, id: saved.id, seq: saved.seq, status: 'saved', event: { ...entry.event, id: saved.id, seq: saved.seq } } : entry,
          ),
        );
        setStatus({ tone: 'saved', text: `Saved ${entrySummary(tidyEntry(job.input), saved.seq)}.` });
      } else {
        const message = result.message;
        setEntries((list) => list.map((entry) => (entry.key === job.key ? { ...entry, status: 'failed', message } : entry)));
        setStatus({ tone: 'error', text: `Not saved: ${message}` });
        // Later entries wait until this one is retried or discarded, so the order is kept.
        break;
      }
    }
    running.current = false;
  }, [roundId]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (queue.current.length > 0) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const log = () => {
    const tidy = tidyEntry(draft);
    const found = entryProblem(tidy);
    if (found) {
      setProblem(found);
      return;
    }
    setProblem(null);
    const key = nextKey();
    const event = entryToEvent(tidy, assignment, key, 0);
    setEntries((list) => [...list, { key, id: null, seq: null, status: 'saving', event, input: tidy }]);
    queue.current.push({ key, input: tidy });
    setDraft(fresh(draft.kind));
    void process();
  };

  const retry = (key: string) => {
    const entry = entries.find((item) => item.key === key);
    if (!entry?.input) return;
    setEntries((list) => list.map((item) => (item.key === key ? { ...item, status: 'saving', message: undefined } : item)));
    queue.current = [{ key, input: entry.input }, ...queue.current.filter((job) => job.key !== key)];
    void process();
  };

  const discard = (key: string) => {
    queue.current = queue.current.filter((job) => job.key !== key);
    setEntries((list) => list.filter((item) => item.key !== key));
    setStatus({ tone: 'idle', text: 'Unsaved entry discarded.' });
    void process();
  };

  const last = entries[entries.length - 1];
  const undo = async () => {
    if (!last) return;
    if (last.status !== 'saved' || !last.id) {
      if (last.status === 'failed') discard(last.key);
      return;
    }
    setStatus({ tone: 'saving', text: 'Removing the last entry…' });
    const result = await deleteZoneEntryAction({ eventId: last.id });
    if (result.ok) {
      setEntries((list) => list.filter((item) => item.key !== last.key));
      setStatus({ tone: 'saved', text: `Removed ${entrySummary(eventSummaryInput(last.event), last.seq)}.` });
    } else {
      setStatus({ tone: 'error', text: `Not removed: ${result.message}` });
    }
  };

  const summary = useMemo(() => summarizeZoneEvents(entries.map((entry) => entry.event)), [entries]);
  const nextNumber = entries.filter((entry) => entry.event.kind === draft.kind).length + 1;
  const saving = entries.some((entry) => entry.status === 'saving');
  const kindWord = draft.kind === 'pitch' ? 'pitch' : draft.kind === 'tee_swing' ? 'tee swing' : 'dry rep';

  return (
    <div className="space-y-6" data-testid="zone-tracker">
      {editable ? (
        <div className="space-y-4">
          <EntryPad value={draft} onChange={setDraft} intendedZones={intendedZones} clips={clips} showRecognition={assignment.recognitionRequired || draft.recognition_call !== null} />
          {problem ? (
            <p role="alert" className="font-semibold text-danger">
              {problem}
            </p>
          ) : null}
          <div className="sticky bottom-2 z-10 flex flex-wrap gap-3 rounded-md bg-white/95 p-2 shadow-md">
            <Button size="lg" onClick={log} className="grow" data-testid="log-entry">
              Save {kindWord} {nextNumber}
            </Button>
            <Button variant="secondary" onClick={() => void undo()} disabled={!last || saving} data-testid="undo-entry">
              Undo last
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-slate">Recording is paused. You can still review and read this session.</p>
      )}

      <p role="status" aria-live="polite" className={status.tone === 'error' ? 'font-semibold text-danger' : 'text-sm text-slate'} data-testid="save-status">
        {status.text}
      </p>

      {entries.some((entry) => entry.status === 'failed') ? (
        <ul className="space-y-2">
          {entries
            .filter((entry) => entry.status === 'failed')
            .map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-center gap-3 rounded-md border-2 border-danger bg-danger-soft p-3">
                <span className="grow">
                  Not saved: {entry.input ? entrySummary(entry.input, null) : 'entry'} — {entry.message}
                </span>
                <Button size="sm" onClick={() => retry(entry.key)}>
                  Try again
                </Button>
                <Button size="sm" variant="danger" onClick={() => discard(entry.key)}>
                  Discard
                </Button>
              </li>
            ))}
        </ul>
      ) : null}

      <section aria-labelledby={`round-${roundSeq}-totals`} className="space-y-2 rounded-md border-2 border-rule p-4">
        <h3 id={`round-${roundSeq}-totals`} className="text-lg font-semibold text-navy">
          Round {roundSeq} so far
        </h3>
        <p data-testid="round-counts">
          {countOf(summary.counts.pitches, 'pitch', 'pitches')} · {countOf(summary.counts.swings, 'swing')} · {countOf(summary.counts.teeSwings, 'tee swing')} ·{' '}
          {countOf(summary.counts.dryReps, 'dry rep')}
          {summary.counts.offPlan > 0 ? ` · ${summary.counts.offPlan} off-plan` : ''}
          {summary.counts.voided > 0 ? ` · ${summary.counts.voided} left out` : ''}
        </p>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {summary.counts.pitches > 0 ? (
            <>
              <Total label="Strike contact" value={metricText(summary.pitch.strike_contact)} />
              <Total label="Decisions" value={metricText(summary.pitch.decision)} />
              <Total label="Chase" value={metricText(summary.pitch.chase)} />
              <Total label="Correct depth" value={metricText(summary.pitch.depth)} />
            </>
          ) : null}
          {summary.counts.teeSwings > 0 ? (
            <>
              <Total label="Tee contact" value={metricText(summary.reps.contact)} />
              <Total label="Tee depth" value={metricText(summary.reps.depth)} />
            </>
          ) : null}
        </dl>
        <p className="text-sm text-slate">
          Between rounds: <Link href={reviewHref} className="font-semibold text-royal-ink underline">review this round</Link> — ask the hitter, check the counts, then advance, hold or simplify.
        </p>
      </section>

      {entries.length > 0 ? (
        <section aria-labelledby={`round-${roundSeq}-entries`} className="space-y-2">
          <h3 id={`round-${roundSeq}-entries`} className="text-lg font-semibold text-navy">
            Latest entries
          </h3>
          <ol className="space-y-1" data-testid="latest-entries">
            {entries
              .slice(-8)
              .reverse()
              .map((entry) => (
                <li key={entry.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule py-1">
                  <span>
                    {entrySummary(eventSummaryInput(entry.event), entry.seq)}
                    {entry.status === 'saving' ? ' — saving…' : entry.status === 'failed' ? ' — not saved' : ''}
                  </span>
                  {entry.id ? (
                    <Link href={`${correctHref}#entry-${entry.id}`} className="text-sm font-semibold text-royal-ink underline">
                      Correct
                    </Link>
                  ) : null}
                </li>
              ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function eventSummaryInput(event: ZoneEvent) {
  return { kind: event.kind, location: event.location, response: event.response, contact: event.contact, voided: event.voided };
}

function Total({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-rule py-1">
      <dt>{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
