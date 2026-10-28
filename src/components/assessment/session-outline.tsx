import type { SessionTemplate } from '@/lib/assessment/catalog/session-templates';

/** A workbook session as a timed list of blocks, with the warm-up's activities one click away. */
export function SessionOutline({ session }: { readonly session: SessionTemplate }) {
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {session.blocks.map((block) => (
          <li key={`${block.label}-${block.minutes}`} className="text-sm">
            <span className="font-semibold">
              {block.label} · about {block.minutes} min:
            </span>{' '}
            {block.activity}. <span className="text-slate">Coach focus: {block.focus}</span>
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
      <p className="text-sm text-slate">
        About {session.totalMinutes} minutes in all. Minutes are estimates: adjust to how the player feels, not the clock. From the
        Base Recruits hitting development workbook ({session.id}). Reviewed by Base Recruits hitting coaches.
      </p>
    </div>
  );
}
