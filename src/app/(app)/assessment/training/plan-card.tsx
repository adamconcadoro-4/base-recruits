import {
  addAssignmentAction,
  approvePlanAction,
  completePlanAction,
  deleteLogAction,
  logTrainingAction,
  removeAssignmentAction,
  replaceAssignmentAction,
  setPlanNotesAction,
  updateAssignmentAction,
} from '@/app/(app)/assessment/plan-actions';
import { ActionForm } from '@/components/assessment/action-form';
import { DrillDetails } from '@/components/assessment/drill-details';
import { formatDateOnly, formatDateTime } from '@/components/assessment/result-format';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { StatusChip } from '@/components/ui/status-chip';
import { drill as findDrill, drillsFor } from '@/lib/assessment/catalog/drills';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import { SOURCE_LABELS } from '@/lib/assessment/labels';
import { getPlanDetails, type PlanRow } from '@/lib/assessment/server/queries';

/** One training plan: focus, drills with instructions, logging, and the change history. */
export async function PlanCard({ plan, isCoach, viewerId }: { readonly plan: PlanRow; readonly isCoach: boolean; readonly viewerId: string }) {
  const { assignments, revisions, logs } = await getPlanDetails(plan.id);
  const active = assignments.filter((item) => item.status === 'active');
  const removed = assignments.filter((item) => item.status === 'removed');
  const open = plan.status === 'active';
  const today = new Date().toISOString().slice(0, 10);
  const library = drillsFor(plan.discipline);

  return (
    <article id={`plan-${plan.id}`} aria-labelledby={`plan-title-${plan.id}`} className="space-y-6 border-2 border-rule p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`plan-title-${plan.id}`} className="text-2xl text-navy">
            {plan.title}
          </h3>
          <p className="text-sm text-slate">
            {plan.discipline === 'hitting' ? 'Hitting' : 'Pitching'} · {formatDateOnly(plan.start_on)} to {formatDateOnly(plan.review_on)} · revision{' '}
            {plan.revision}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.approval === 'coach_approved' ? (
            <StatusChip tone="positive">Approved by development coach</StatusChip>
          ) : (
            <StatusChip tone="neutral">Self-directed</StatusChip>
          )}
          {!open ? <StatusChip tone="neutral">Completed</StatusChip> : null}
        </div>
      </header>

      {plan.focus.length > 0 ? (
        <div>
          <h4 className="font-semibold">Focus</h4>
          <ul className="list-disc space-y-1 pl-5">
            {plan.focus.map((item) => (
              <li key={`${item.metric_key}:${item.pitch_type ?? ''}`}>
                {item.summary || `${requireMetric(item.metric_key).name}${item.pitch_type ? ` (${PITCH_TYPE_LABELS[item.pitch_type]})` : ''}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.coach_notes ? (
        <p>
          <span className="font-semibold">Coach notes:</span> {plan.coach_notes}
        </p>
      ) : null}

      {open && isCoach && plan.approval === 'self_directed' ? (
        <ActionForm action={approvePlanAction} fields={{ planId: plan.id }} submitLabel="Approve this plan" variant="secondary" />
      ) : null}
      {open && !isCoach && plan.approval === 'coach_approved' ? (
        <p className="text-sm text-slate">Changes you make to this plan withdraw the coach&apos;s approval until they approve it again.</p>
      ) : null}

      <div className="space-y-4">
        <h4 className="text-xl font-semibold">Drills</h4>
        <ol className="space-y-4">
          {active.map((assignment) => {
            const definition = findDrill(assignment.drill_key, assignment.drill_version);
            const entries = logs.filter((log) => log.assignment_id === assignment.id);
            return (
              <li key={assignment.id} className="space-y-3 border-l-4 border-royal-ink pl-4">
                <div>
                  <p className="text-lg font-semibold">{definition?.name ?? assignment.drill_key}</p>
                  <p className="text-sm">
                    <span className="font-semibold">Dosage:</span> {assignment.dosage}
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold">Why:</span> {assignment.reason}
                  </p>
                  {assignment.note ? (
                    <p className="text-sm">
                      <span className="font-semibold">Note:</span> {assignment.note}
                    </p>
                  ) : null}
                  {assignment.override_reason ? <p className="text-sm text-slate">Changed: {assignment.override_reason}</p> : null}
                  <p className="text-sm text-slate">
                    Logged {entries.length} {entries.length === 1 ? 'time' : 'times'}
                    {entries[0] ? `, last on ${formatDateOnly(entries[0].completed_on)}` : ''}
                  </p>
                </div>
                {definition ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">How to do it</summary>
                    <div className="mt-2">
                      <DrillDetails drill={definition} />
                    </div>
                  </details>
                ) : null}
                {open ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">Log a session</summary>
                    <ActionForm action={logTrainingAction} fields={{ assignmentId: assignment.id }} submitLabel="Log it" size="sm" className="mt-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <TextField
                          id={`day-${assignment.id}`}
                          name="completed_on"
                          type="date"
                          label="Day"
                          required
                          min={plan.start_on}
                          max={today}
                          defaultValue={today < plan.start_on ? plan.start_on : today}
                        />
                        <TextField id={`sets-${assignment.id}`} name="sets" type="number" min={0} max={50} label="Sets done" />
                        <SelectField id={`effort-${assignment.id}`} name="effort" label="How hard did it feel?" defaultValue="">
                          <option value="">Skip</option>
                          <option value="1">1 — very easy</option>
                          <option value="2">2 — easy</option>
                          <option value="3">3 — moderate</option>
                          <option value="4">4 — hard</option>
                          <option value="5">5 — very hard</option>
                        </SelectField>
                      </div>
                      <TextField id={`feedback-${assignment.id}`} name="feedback" label="How did it go? (optional)" maxLength={500} />
                    </ActionForm>
                  </details>
                ) : null}
                {open ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">Change this drill</summary>
                    <div className="mt-3 grid gap-6 lg:grid-cols-3">
                      <ActionForm action={updateAssignmentAction} fields={{ assignmentId: assignment.id }} submitLabel="Save" size="sm" variant="secondary">
                        <TextField id={`dose-${assignment.id}`} name="dosage" label="Dosage" required maxLength={200} defaultValue={assignment.dosage} />
                        <TextField id={`anote-${assignment.id}`} name="note" label="Note" maxLength={300} defaultValue={assignment.note ?? ''} />
                      </ActionForm>
                      <ActionForm action={replaceAssignmentAction} fields={{ assignmentId: assignment.id }} submitLabel="Replace" size="sm" variant="secondary">
                        <SelectField id={`swap-${assignment.id}`} name="drill" label="Replace with" required defaultValue="">
                          <option value="">Choose a drill</option>
                          {library
                            .filter((item) => item.key !== assignment.drill_key)
                            .map((item) => (
                              <option key={item.key} value={`${item.key}@${item.version}`}>
                                {item.name}
                              </option>
                            ))}
                        </SelectField>
                        <TextField id={`swapwhy-${assignment.id}`} name="reason" label="Why" required minLength={3} maxLength={300} />
                      </ActionForm>
                      <ActionForm action={removeAssignmentAction} fields={{ assignmentId: assignment.id }} submitLabel="Remove" size="sm" variant="danger">
                        <TextField id={`rmwhy-${assignment.id}`} name="reason" label="Why remove it" required minLength={3} maxLength={300} />
                      </ActionForm>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
        {open && active.length < 8 ? (
          <details>
            <summary className="cursor-pointer font-semibold text-royal-ink underline">Add a drill</summary>
            <ActionForm action={addAssignmentAction} fields={{ planId: plan.id }} submitLabel="Add drill" size="sm" variant="secondary" className="mt-3">
              <div className="grid gap-3 md:grid-cols-3">
                <SelectField id={`add-${plan.id}`} name="drill" label="Drill" required defaultValue="">
                  <option value="">Choose a drill</option>
                  {library.map((item) => (
                    <option key={item.key} value={`${item.key}@${item.version}`}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
                <TextField id={`addwhy-${plan.id}`} name="reason" label="Why" required minLength={3} maxLength={600} />
                <TextField id={`adddose-${plan.id}`} name="dosage" label="Dosage (blank uses the drill’s default)" maxLength={200} />
              </div>
            </ActionForm>
          </details>
        ) : null}
        {removed.length > 0 ? (
          <p className="text-sm text-slate">
            Removed:{' '}
            {removed.map((item) => `${findDrill(item.drill_key, item.drill_version)?.name ?? item.drill_key} (${item.override_reason ?? 'no reason'})`).join('; ')}
          </p>
        ) : null}
      </div>

      {logs.length > 0 ? (
        <details>
          <summary className="cursor-pointer font-semibold text-royal-ink underline">Training log ({logs.length})</summary>
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {logs.map((log) => {
              const assignment = assignments.find((item) => item.id === log.assignment_id);
              const name = assignment ? (findDrill(assignment.drill_key, assignment.drill_version)?.name ?? assignment.drill_key) : 'Drill';
              return (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span>
                    {formatDateOnly(log.completed_on)} · {name}
                    {log.sets_completed !== null ? ` · ${log.sets_completed} sets` : ''}
                    {log.effort !== null ? ` · effort ${log.effort}/5` : ''}
                    {log.feedback ? ` · “${log.feedback}”` : ''} <span className="text-slate">({SOURCE_LABELS[log.logger_kind].toLowerCase()})</span>
                  </span>
                  {open && log.logged_by === viewerId ? (
                    <ActionForm action={deleteLogAction} fields={{ logId: log.id }} submitLabel="Delete" size="sm" variant="quiet" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {open && isCoach ? (
        <details>
          <summary className="cursor-pointer font-semibold text-royal-ink underline">Coach notes</summary>
          <ActionForm action={setPlanNotesAction} fields={{ planId: plan.id }} submitLabel="Save notes" size="sm" variant="secondary" className="mt-3">
            <TextAreaField id={`notes-${plan.id}`} name="notes" label="Notes for the athlete" maxLength={2000} defaultValue={plan.coach_notes ?? ''} />
          </ActionForm>
        </details>
      ) : null}

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">Change history</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {revisions.map((revision) => (
            <li key={revision.id}>
              Revision {revision.revision} · {formatDateTime(revision.created_at)} · {revision.change.replace(/_/g, ' ')}
              {revision.reason ? ` — ${revision.reason}` : ''} ({SOURCE_LABELS[revision.changed_by_kind].toLowerCase()})
            </li>
          ))}
        </ul>
      </details>

      {open ? (
        <ActionForm
          action={completePlanAction}
          fields={{ planId: plan.id }}
          submitLabel="Mark this plan complete"
          variant="quiet"
          confirm="Mark this plan complete? You can still see it, but not log to it."
        />
      ) : null}
    </article>
  );
}
