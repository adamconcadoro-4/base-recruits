import { DRILL_REQUIREMENT_LABELS, type DrillDefinition } from '@/lib/assessment/catalog/drills';
import { PILLARS } from '@/lib/assessment/catalog/pillars';

/** The full written instructions for one drill. There are no demonstration videos yet. */
export function DrillDetails({ drill }: { readonly drill: DrillDefinition }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{drill.purpose}</p>
      <p>
        <span className="font-semibold">Works on:</span> {drill.pillars.map((key) => PILLARS[key].name).join(', ')}
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
      <p>
        <span className="font-semibold">Make it easier:</span> {drill.regression}
      </p>
      <p>
        <span className="font-semibold">Make it harder:</span> {drill.progression}
      </p>
      <p>
        <span className="font-semibold">Done when:</span> {drill.completion}
      </p>
      <p>
        <span className="font-semibold">The next assessment checks:</span> {drill.reassessment}
      </p>
    </div>
  );
}
