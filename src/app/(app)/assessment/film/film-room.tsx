'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import { addAnnotationAction, deleteAnnotationAction, recordIntervalAction } from '@/app/(app)/assessment/media-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

export interface FilmAnnotation {
  readonly id: string;
  readonly repetition_id: string | null;
  readonly kind: 'event' | 'note' | 'drawing';
  readonly event_type: string | null;
  readonly time_ms: number;
  readonly note: string | null;
  readonly drawing: { shape: string; points: [[number, number], [number, number]]; color: string } | null;
  readonly author_id: string | null;
}

export interface FilmClip {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly timingNote: string;
  readonly slowdownFactor: number | null;
  readonly timingKnown: boolean;
  readonly annotations: readonly FilmAnnotation[];
}

export interface FilmRepetition {
  readonly id: string;
  readonly seq: number;
  readonly label: string;
}

export interface IntervalMetric {
  readonly key: string;
  readonly name: string;
  readonly start: string;
  readonly end: string;
  /** Repetition ids that already have a value for this metric. */
  readonly recorded: readonly string[];
}

type Shape = 'line' | 'arrow' | 'circle' | 'box';
type Color = 'yellow' | 'red' | 'blue' | 'white';

const COLORS: Readonly<Record<Color, string>> = { yellow: '#facc15', red: '#ef4444', blue: '#60a5fa', white: '#ffffff' };
const SPEEDS = [0.1, 0.25, 0.5, 1] as const;
const FRAME_RATES = [30, 60, 120, 240] as const;
const DRAWING_WINDOW_MS = 750;

const control = 'block min-h-10 rounded-md border-2 border-field bg-white px-2';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(3)} s`;
}

function DrawingShape({ drawing, preview = false }: { readonly drawing: NonNullable<FilmAnnotation['drawing']>; readonly preview?: boolean }) {
  const [[x1, y1], [x2, y2]] = drawing.points;
  const stroke = COLORS[drawing.color as Color] ?? COLORS.yellow;
  const common = { stroke, fill: 'none', vectorEffect: 'non-scaling-stroke' as const, opacity: preview ? 0.7 : 1 };
  switch (drawing.shape) {
    case 'circle':
      return <ellipse cx={x1} cy={y1} rx={Math.abs(x2 - x1)} ry={Math.abs(y2 - y1)} {...common} strokeWidth={3} />;
    case 'box':
      return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} {...common} strokeWidth={3} />;
    case 'arrow':
      return <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} strokeWidth={3} markerEnd={`url(#arrow-${drawing.color})`} />;
    default:
      return <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} strokeWidth={3} />;
  }
}

/** A video with its drawings layered on top. Coordinates are 0–1 of the frame, so they survive any screen size. */
function Player({
  clip,
  annotations,
  videoRef,
  currentMs,
  drawMode,
  onDrawn,
  showAll,
}: {
  readonly clip: FilmClip;
  readonly annotations: readonly FilmAnnotation[];
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly currentMs: number;
  readonly drawMode: { shape: Shape; color: Color } | null;
  readonly onDrawn?: (points: [[number, number], [number, number]]) => void;
  readonly showAll: boolean;
}) {
  const [start, setStart] = useState<[number, number] | null>(null);
  const [end, setEnd] = useState<[number, number] | null>(null);
  const point = (event: ReactPointerEvent<SVGSVGElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
  };
  const visible = annotations.filter(
    (item) => item.kind === 'drawing' && item.drawing && (showAll || Math.abs(item.time_ms - currentMs) <= DRAWING_WINDOW_MS),
  );
  return (
    <div className="relative bg-black">
      {/* Practice clips have no speech, so there is nothing to caption. */}
      <video ref={videoRef} src={clip.url} preload="metadata" playsInline className="block aspect-video w-full" />
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
        className={cn('absolute inset-0 h-full w-full', drawMode ? 'cursor-crosshair touch-none' : 'pointer-events-none')}
        onPointerDown={(event) => {
          if (!drawMode) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const p = point(event);
          setStart(p);
          setEnd(p);
        }}
        onPointerMove={(event) => {
          if (drawMode && start) setEnd(point(event));
        }}
        onPointerUp={(event) => {
          if (!drawMode || !start) return;
          const p = point(event);
          setStart(null);
          setEnd(null);
          if (Math.hypot(p[0] - start[0], p[1] - start[1]) > 0.01) onDrawn?.([start, p]);
        }}
      >
        <defs>
          {(Object.keys(COLORS) as Color[]).map((color) => (
            <marker key={color} id={`arrow-${color}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS[color]} />
            </marker>
          ))}
        </defs>
        {visible.map((item) => (item.drawing ? <DrawingShape key={item.id} drawing={item.drawing} /> : null))}
        {drawMode && start && end ? <DrawingShape drawing={{ shape: drawMode.shape, color: drawMode.color, points: [start, end] }} preview /> : null}
      </svg>
    </div>
  );
}

/**
 * The Film Room: frame-by-frame playback, event markers tied to a repetition,
 * notes, simple drawings, a second clip for side-by-side comparison, and
 * timing estimates calculated from two markers.
 */
export function FilmRoom({
  clip,
  compare,
  repetitions,
  eventTypes,
  intervalMetrics,
  editable,
  viewerId,
  assessmentId,
}: {
  readonly clip: FilmClip;
  readonly compare: FilmClip | null;
  readonly repetitions: readonly FilmRepetition[];
  readonly eventTypes: ReadonlyArray<{ readonly key: string; readonly label: string }>;
  readonly intervalMetrics: readonly IntervalMetric[];
  readonly editable: boolean;
  readonly viewerId: string;
  readonly assessmentId: string;
}) {
  const mainRef = useRef<HTMLVideoElement | null>(null);
  const compareRef = useRef<HTMLVideoElement | null>(null);
  const [annotations, setAnnotations] = useState<FilmAnnotation[]>([...clip.annotations]);
  const [currentMs, setCurrentMs] = useState(0);
  const [compareMs, setCompareMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [fps, setFps] = useState<number>(30);
  const [repetitionId, setRepetitionId] = useState<string>(repetitions[0]?.id ?? '');
  const [eventType, setEventType] = useState<string>(eventTypes[0]?.key ?? '');
  const [note, setNote] = useState('');
  const [drawShape, setDrawShape] = useState<Shape>('arrow');
  const [drawColor, setDrawColor] = useState<Color>('yellow');
  const [drawing, setDrawing] = useState(false);
  const [showAllDrawings, setShowAllDrawings] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [linked, setLinked] = useState(Boolean(compare));
  const [offsetMs, setOffsetMs] = useState(0);
  const [alignEvent, setAlignEvent] = useState<string>(eventTypes[0]?.key ?? '');
  const [intervalMetric, setIntervalMetric] = useState<string>(intervalMetrics[0]?.key ?? '');

  // Keep the displayed time and the linked comparison clip in step with the main clip.
  useEffect(() => {
    const video = mainRef.current;
    if (!video) return;
    let frame = 0;
    const tick = () => {
      setCurrentMs(Math.round(video.currentTime * 1000));
      const other = compareRef.current;
      if (other && linked) {
        const target = Math.max(0, video.currentTime - offsetMs / 1000);
        if (Math.abs(other.currentTime - target) > (video.paused ? 0.001 : 0.08)) other.currentTime = target;
      }
      if (other) setCompareMs(Math.round(other.currentTime * 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [linked, offsetMs]);

  useEffect(() => {
    if (mainRef.current) mainRef.current.playbackRate = speed;
    if (compareRef.current) compareRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlay = useCallback(() => {
    const video = mainRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      if (linked && compareRef.current) void compareRef.current.play();
    } else {
      video.pause();
      compareRef.current?.pause();
    }
  }, [linked]);

  const step = useCallback(
    (frames: number) => {
      const video = mainRef.current;
      if (!video) return;
      video.pause();
      compareRef.current?.pause();
      video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + frames / fps));
    },
    [fps],
  );

  const seek = (ms: number) => {
    const video = mainRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = ms / 1000;
  };

  async function add(kind: FilmAnnotation['kind'], extra: Partial<FilmAnnotation>) {
    setMessage(null);
    const timeMs = Math.round((mainRef.current?.currentTime ?? 0) * 1000);
    const result = await addAnnotationAction({
      mediaId: clip.id,
      kind,
      eventType: kind === 'event' ? eventType : null,
      timeMs,
      note: extra.note ?? null,
      drawing: extra.drawing ?? null,
      repetitionId: repetitionId || null,
    });
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.message });
      return;
    }
    setAnnotations((items) =>
      [
        ...items,
        {
          id: result.id,
          repetition_id: repetitionId || null,
          kind,
          event_type: kind === 'event' ? eventType : null,
          time_ms: timeMs,
          note: extra.note ?? null,
          drawing: extra.drawing ?? null,
          author_id: viewerId,
        },
      ].sort((a, b) => a.time_ms - b.time_ms),
    );
    setMessage({ tone: 'ok', text: kind === 'event' ? `Marked at ${seconds(timeMs)}.` : kind === 'note' ? 'Note added.' : 'Drawing added.' });
  }

  async function remove(id: string) {
    const result = await deleteAnnotationAction({ annotationId: id });
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.message ?? 'We couldn’t delete that.' });
      return;
    }
    setAnnotations((items) => items.filter((item) => item.id !== id));
    setMessage({ tone: 'ok', text: 'Deleted.' });
  }

  const repLabel = useMemo(() => new Map(repetitions.map((rep) => [rep.id, rep.label])), [repetitions]);
  const eventLabel = useMemo(() => new Map(eventTypes.map((event) => [event.key, event.label])), [eventTypes]);
  const markers = annotations.filter((item) => item.kind === 'event');
  const notes = annotations.filter((item) => item.kind === 'note');
  const drawings = annotations.filter((item) => item.kind === 'drawing');

  const chosenMetric = intervalMetrics.find((metric) => metric.key === intervalMetric);
  const startMarker = chosenMetric
    ? markers.find((item) => item.repetition_id === repetitionId && item.event_type === chosenMetric.start)
    : undefined;
  const endMarker = chosenMetric ? markers.find((item) => item.repetition_id === repetitionId && item.event_type === chosenMetric.end) : undefined;
  const intervalPreview =
    startMarker && endMarker && endMarker.time_ms > startMarker.time_ms
      ? (endMarker.time_ms - startMarker.time_ms) / (clip.slowdownFactor ?? 1)
      : null;

  function align() {
    if (!compare) return;
    const mine = markers.find((item) => item.event_type === alignEvent && (!repetitionId || item.repetition_id === repetitionId)) ??
      markers.find((item) => item.event_type === alignEvent);
    const theirs = compare.annotations.find((item) => item.kind === 'event' && item.event_type === alignEvent);
    if (!mine || !theirs) {
      setMessage({ tone: 'error', text: `Mark “${eventLabel.get(alignEvent) ?? alignEvent}” on both clips to align them.` });
      return;
    }
    setOffsetMs(mine.time_ms - theirs.time_ms);
    setLinked(true);
    seek(mine.time_ms);
    setMessage({ tone: 'ok', text: `Aligned at ${eventLabel.get(alignEvent) ?? alignEvent}.` });
  }

  return (
    <div className="space-y-6" data-testid="film-room">
      <div className={cn('grid gap-4', compare ? 'lg:grid-cols-2' : '')}>
        <figure className="space-y-2">
          <Player
            clip={clip}
            annotations={annotations}
            videoRef={mainRef}
            currentMs={currentMs}
            drawMode={drawing ? { shape: drawShape, color: drawColor } : null}
            showAll={showAllDrawings}
            onDrawn={(points) => {
              void add('drawing', { drawing: { shape: drawShape, color: drawColor, points } });
            }}
          />
          <figcaption className="text-sm">
            <span className="font-semibold">{clip.label}</span> · {clip.timingNote} · <span data-testid="current-time">{seconds(currentMs)}</span>
          </figcaption>
        </figure>
        {compare ? (
          <figure className="space-y-2">
            <Player clip={compare} annotations={compare.annotations} videoRef={compareRef} currentMs={compareMs} drawMode={null} showAll={showAllDrawings} />
            <figcaption className="text-sm">
              <span className="font-semibold">{compare.label}</span> · {compare.timingNote} · {seconds(compareMs)}
            </figcaption>
          </figure>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Playback">
        <Button onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</Button>
        <Button variant="secondary" onClick={() => step(-1)} aria-label="Back one frame">
          ◀ Frame
        </Button>
        <Button variant="secondary" onClick={() => step(1)} aria-label="Forward one frame">
          Frame ▶
        </Button>
        <div className="space-y-1">
          <label htmlFor="speed" className="block text-sm font-semibold">
            Speed
          </label>
          <select id="speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className={control}>
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value === 1 ? 'Normal' : `${value}×`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="fps" className="block text-sm font-semibold">
            Frame step
          </label>
          <select id="fps" value={fps} onChange={(event) => setFps(Number(event.target.value))} className={control}>
            {FRAME_RATES.map((value) => (
              <option key={value} value={value}>
                1/{value} s
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" checked={showAllDrawings} onChange={(event) => setShowAllDrawings(event.target.checked)} className="size-5" />
          Show all drawings
        </label>
        {compare ? (
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" checked={linked} onChange={(event) => setLinked(event.target.checked)} className="size-5" />
            Play both together
          </label>
        ) : null}
      </div>

      {compare ? (
        <div className="flex flex-wrap items-end gap-3 border-2 border-rule p-4" role="group" aria-label="Align the two clips">
          <div className="space-y-1">
            <label htmlFor="align-event" className="block text-sm font-semibold">
              Align both clips at
            </label>
            <select id="align-event" value={alignEvent} onChange={(event) => setAlignEvent(event.target.value)} className={control}>
              {eventTypes.map((event) => (
                <option key={event.key} value={event.key}>
                  {event.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={align}>
            Align
          </Button>
          <p className="text-sm text-slate">
            Offset {seconds(offsetMs)}. Uses the first matching marker on each clip (on the chosen repetition for this clip).
          </p>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className={cn('min-h-6 text-sm font-semibold', message?.tone === 'error' ? 'text-danger' : 'text-success-ink')}>
        {message?.text ?? ''}
      </p>

      {editable ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="mark-heading" className="space-y-4 border-2 border-rule p-4">
            <h3 id="mark-heading" className="text-xl font-semibold text-navy">
              Mark a moment
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="rep" className="block text-sm font-semibold">
                  Repetition
                </label>
                <select id="rep" value={repetitionId} onChange={(event) => setRepetitionId(event.target.value)} className={`${control} w-full`}>
                  <option value="">Not tied to one</option>
                  {repetitions.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="event" className="block text-sm font-semibold">
                  Event
                </label>
                <select id="event" value={eventType} onChange={(event) => setEventType(event.target.value)} className={`${control} w-full`}>
                  {eventTypes.map((event) => (
                    <option key={event.key} value={event.key}>
                      {event.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={() => void add('event', {})}>Mark at {seconds(currentMs)}</Button>
            <div className="space-y-1">
              <label htmlFor="film-note" className="block text-sm font-semibold">
                Note at this moment
              </label>
              <textarea id="film-note" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} className={`${control} min-h-20 w-full py-2`} />
            </div>
            <Button
              variant="secondary"
              disabled={note.trim() === ''}
              onClick={() => {
                void add('note', { note: note.trim() }).then(() => setNote(''));
              }}
            >
              Add note
            </Button>
          </section>

          <section aria-labelledby="draw-heading" className="space-y-4 border-2 border-rule p-4">
            <h3 id="draw-heading" className="text-xl font-semibold text-navy">
              Draw on the frame
            </h3>
            <p className="text-sm text-slate">
              Pause on a frame, turn drawing on, then drag across the video. Drawings show for the moment they were made. Drawing needs a
              mouse, pen or touch; markers and notes work from the keyboard.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="shape" className="block text-sm font-semibold">
                  Shape
                </label>
                <select id="shape" value={drawShape} onChange={(event) => setDrawShape(event.target.value as Shape)} className={control}>
                  <option value="arrow">Arrow</option>
                  <option value="line">Line</option>
                  <option value="circle">Circle</option>
                  <option value="box">Box</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="color" className="block text-sm font-semibold">
                  Colour
                </label>
                <select id="color" value={drawColor} onChange={(event) => setDrawColor(event.target.value as Color)} className={control}>
                  <option value="yellow">Yellow</option>
                  <option value="red">Red</option>
                  <option value="blue">Blue</option>
                  <option value="white">White</option>
                </select>
              </div>
              <Button variant={drawing ? 'primary' : 'secondary'} aria-pressed={drawing} onClick={() => setDrawing((value) => !value)}>
                {drawing ? 'Drawing on' : 'Turn drawing on'}
              </Button>
            </div>
          </section>

          {intervalMetrics.length > 0 ? (
            <section aria-labelledby="interval-heading" className="space-y-4 border-2 border-rule p-4 lg:col-span-2">
              <h3 id="interval-heading" className="text-xl font-semibold text-navy">
                Timing from markers
              </h3>
              <p className="text-sm text-slate">
                Mark both moments on the same repetition, then save the time between them. It is recorded as a video estimate and is only
                as precise as the clip&apos;s frame rate.
                {clip.timingKnown ? '' : ' This clip’s playback speed is “not sure”, so no timing can be calculated from it.'}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label htmlFor="interval-metric" className="block text-sm font-semibold">
                    Measure
                  </label>
                  <select id="interval-metric" value={intervalMetric} onChange={(event) => setIntervalMetric(event.target.value)} className={control}>
                    {intervalMetrics.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {metric.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-sm">
                  {repetitionId ? `On ${repLabel.get(repetitionId)}: ` : 'Choose a repetition above. '}
                  {chosenMetric ? (
                    <>
                      {eventLabel.get(chosenMetric.start)} {startMarker ? seconds(startMarker.time_ms) : 'not marked'} →{' '}
                      {eventLabel.get(chosenMetric.end)} {endMarker ? seconds(endMarker.time_ms) : 'not marked'}
                      {intervalPreview !== null ? ` = ${Math.round(intervalPreview * 10) / 10} ms real time` : ''}
                    </>
                  ) : null}
                </p>
                <Button
                  disabled={!startMarker || !endMarker || !repetitionId || !clip.timingKnown}
                  onClick={async () => {
                    if (!startMarker || !endMarker || !chosenMetric) return;
                    const result = await recordIntervalAction({
                      repetitionId,
                      metricKey: chosenMetric.key,
                      startAnnotationId: startMarker.id,
                      endAnnotationId: endMarker.id,
                      assessmentId,
                    });
                    setMessage({ tone: result.ok ? 'ok' : 'error', text: result.message });
                  }}
                >
                  Save timing
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="text-slate">This assessment is published, so its markers are read-only. Reopen it to make changes.</p>
      )}

      <section aria-labelledby="list-heading" className="space-y-3">
        <h3 id="list-heading" className="text-xl font-semibold text-navy">
          On this clip
        </h3>
        {annotations.length === 0 ? (
          <p className="text-slate">No markers, notes or drawings yet.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {[...markers, ...notes, ...drawings]
              .sort((a, b) => a.time_ms - b.time_ms)
              .map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span>
                    <button type="button" onClick={() => seek(item.time_ms)} className="font-semibold text-royal-ink underline">
                      {seconds(item.time_ms)}
                    </button>{' '}
                    {item.kind === 'event'
                      ? eventLabel.get(item.event_type ?? '') ?? item.event_type
                      : item.kind === 'note'
                        ? `Note: ${item.note}`
                        : `Drawing (${item.drawing?.shape ?? ''})`}
                    {item.repetition_id ? <span className="text-sm text-slate"> · {repLabel.get(item.repetition_id) ?? 'repetition'}</span> : null}
                  </span>
                  {editable && item.author_id === viewerId ? (
                    <button type="button" onClick={() => void remove(item.id)} className="text-sm font-semibold text-danger underline">
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
