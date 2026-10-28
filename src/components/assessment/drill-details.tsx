import { DRILL_REQUIREMENT_LABELS, worksOn, type DrillDefinition } from '@/lib/assessment/catalog/drills';

/** The full written instructions for one drill. There are no demonstration videos yet. */
export function DrillDetails({ drill }: { readonly drill: DrillDefinition }) {
  const source = drill.workbook;
  return (
    <div className="space-y-3 text-sm">
      <p>{drill.purpose}</p>
      <p>
        <span className="font-semibold">Works on:</span> {worksOn(drill)}
        {source?.level ? ` · level: ${source.level}` : ''}
      </p>
      <p>
        <span className="font-semibold">Equipment:</span> {drill.equipment.join(', ')}
        {drill.requires.length > 0 ? ` · needs ${drill.requires.map((item) => DRILL_REQUIREMENT_LABELS[item].toLowerCase()).join(', ')}` : ''}
      </p>
      <p>
        <span className="font-semibold">Set-up:</span> {drill.setup}
      </p>
      <div>
        <p className="font-semibold">Steps</p>
        <ol className="list-decimal space-y-1 pl-5">
          {drill.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div>
        <p className="font-semibold">Cues</p>
        <ul className="list-disc space-y-1 pl-5">
          {drill.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      </div>
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
      {source ? (
        <p className="text-slate">
          From the Base Recruits hitting development workbook ({source.sourceId}). Reviewed by Base Recruits hitting coaches.
        </p>
      ) : null}
    </div>
  );
}
