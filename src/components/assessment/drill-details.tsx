import { DRILL_REQUIREMENT_LABELS, worksOn, type DrillDefinition } from '@/lib/assessment/catalog/drills';

/** The full written instructions for one drill. There are no demonstration videos yet. */
export function DrillDetails({ drill }: { readonly drill: DrillDefinition }) {
  const source = drill.workbook;
  return (
    <div className="space-y-3 text-sm">
      <p>{drill.purpose}</p>
      <p>
        <span className="font-semibold">Works on:</span> {worksOn(drill)}
        {source?.book === 'master' ? ` · body area: ${source.section.toLowerCase()}` : ''}
        {source?.level ? ` · level: ${source.level}` : ''}
      </p>
      <p>
        <span className="font-semibold">Equipment:</span> {drill.equipment.join(', ')}
        {drill.requires.length > 0 ? ` · needs ${drill.requires.map((item) => DRILL_REQUIREMENT_LABELS[item].toLowerCase()).join(', ')}` : ''}
      </p>
      {drill.setup ? (
        <p>
          <span className="font-semibold">Set-up:</span> {drill.setup}
        </p>
      ) : null}
      {source?.related ? (
        <p>
          <span className="font-semibold">Builds on:</span> {source.related}
        </p>
      ) : null}
      <div>
        <p className="font-semibold">Steps</p>
        <ol className="list-decimal space-y-1 pl-5">
          {drill.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      {drill.cues.length > 0 ? (
        <div>
          <p className="font-semibold">Cues</p>
          <ul className="list-disc space-y-1 pl-5">
            {drill.cues.map((cue) => (
              <li key={cue}>{cue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {source?.mistake ? (
        <p>
          <span className="font-semibold">Common mistake:</span> {source.mistake}
          {source.correction ? ` Fix: ${source.correction}` : ''}
        </p>
      ) : null}
      {drill.regression ? (
        <p>
          <span className="font-semibold">Make it easier:</span> {drill.regression}
        </p>
      ) : null}
      {drill.progression ? (
        <p>
          <span className="font-semibold">Make it harder:</span> {drill.progression}
        </p>
      ) : null}
      {drill.completion ? (
        <p>
          <span className="font-semibold">{source ? 'Coach target (a starting point, not a validated standard):' : 'Done when:'}</span>{' '}
          {drill.completion}
        </p>
      ) : null}
      <p>
        <span className="font-semibold">The next assessment checks:</span> {drill.reassessment}
      </p>
      {source?.safety ? (
        <p>
          <span className="font-semibold">Safety:</span> {source.safety}
        </p>
      ) : null}
      {source?.filming ? (
        <details>
          <summary className="cursor-pointer font-semibold text-royal-ink underline">Filming it and reviewing the video</summary>
          <div className="mt-2 space-y-2">
            <p>
              <span className="font-semibold">Camera:</span> {source.filming.views}
            </p>
            <p>
              <span className="font-semibold">Part of the swing to review:</span> {source.filming.phase}
            </p>
            <p>
              <span className="font-semibold">What to look for:</span> {source.filming.review}
            </p>
            <p>
              <span className="font-semibold">Example feedback:</span> “{source.filming.feedback}”
            </p>
            <p>
              <span className="font-semibold">What video can&apos;t tell you:</span> {source.filming.limits}
            </p>
            <p className="text-slate">These are review guidelines for a coach watching video, not a measurement or a diagnosis.</p>
          </div>
        </details>
      ) : null}
      {source ? (
        <p className="text-slate">
          From the Base Recruits hitting {source.book === 'master' ? 'master' : 'development'} workbook ({source.sourceId}).{' '}
          {source.coachReviewed ? 'Reviewed by Base Recruits hitting coaches.' : 'Not yet reviewed by Base Recruits hitting coaches.'}
        </p>
      ) : null}
    </div>
  );
}
