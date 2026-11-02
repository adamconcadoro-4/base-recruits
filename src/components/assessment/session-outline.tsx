import type { SessionTemplate } from '@/lib/assessment/catalog/session-templates';
import { MASTER_WORKBOOK_COACH_REVIEWED } from '@/lib/assessment/hitting-workbook/master';

/**
 * A ready-made session as a list of blocks: a workbook session timed in
 * minutes, with the warm-up's activities one click away, or a progression
 * stage card counted in reps, with its optional focus blocks.
 */
export function SessionOutline({ session }: { readonly session: SessionTemplate }) {
  const stage = session.stage;
  return (
    <div className="space-y-2">
      {stage ? (
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-semibold">Goal:</span> {stage.goal} <span className="font-semibold">Say:</span> “{stage.cue}”
          </p>
          <p>
            <span className="font-semibold">Kit:</span> {stage.kit}
          </p>
        </div>
      ) : null}
      <ol className="space-y-2">
        {session.blocks.map((block) => (
          <li key={`${block.label}-${block.minutes ?? block.dose}`} className="text-sm">
            <span className="font-semibold">
              {block.label} · {block.minutes !== null ? `about ${block.minutes} min` : block.dose}:
            </span>{' '}
            {block.activity.replace(/\.$/, '')}. {block.focus ? <span className="text-slate">{stage ? '' : 'Coach focus: '}{block.focus}</span> : null}
            {block.warmup ? (
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold text-royal-ink underline">The {block.warmup.name.toLowerCase()}, step by step</summary>
                <p className="mt-1">
                  {block.warmup.time}. {block.warmup.note}
                </p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {block.warmup.steps.map((step, index) => (
                    <li key={index}>
                      {step.activities.map((activity) => `${activity.name} (${activity.dose}): ${activity.how}`).join(' Or ')}
                      {step.detail ? ` ${step.detail.startsWith('(') ? step.detail : `— ${step.detail}`}` : ''}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
      {stage ? (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Optional focus, before the rear-leg block (choose at most one, or none):</p>
          <ul className="list-disc space-y-1 pl-5">
            {stage.focusOptions.map((option) => (
              <li key={option.slot}>
                {option.label}: {option.drill.name}, {option.dose}. {option.run}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm text-slate">
        {stage
          ? `Stage ${stage.number} of the six-stage hitting progression, ${session.length} including preparation and video review. Rep counts and the 4-of-6 exit rule are coaching proposals, not validated standards; a coach decides when to advance. From the Base Recruits hitting master workbook. ${MASTER_WORKBOOK_COACH_REVIEWED ? 'Reviewed' : 'Not yet reviewed'} by Base Recruits hitting coaches.`
          : `About ${session.totalMinutes} minutes in all. Minutes are estimates: adjust to how the player feels, not the clock. From the Base Recruits hitting development workbook (${session.id}). Reviewed by Base Recruits hitting coaches.`}
      </p>
    </div>
  );
}
