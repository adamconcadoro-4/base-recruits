/**
 * The four-step journey drawn as the base path: first, second, third, home.
 * The diagram is decorative; the ordered list carries the content.
 */

export interface BasePathStep {
  readonly title: string;
  readonly body: string;
  /** Short availability label, e.g. "Coming later", shown with the title. */
  readonly note?: string | null;
}

const BASES = [
  { x: 150, y: 80, label: '1' }, // first base (right)
  { x: 80, y: 10, label: '2' }, // second base (top)
  { x: 10, y: 80, label: '3' }, // third base (left)
  { x: 80, y: 150, label: '4' }, // home (bottom)
] as const;

function DiamondDiagram() {
  return (
    <svg viewBox="-10 -10 180 180" aria-hidden="true" className="w-full max-w-[18rem]">
      <rect x="-10" y="-10" width="180" height="180" fill="none" />
      <path d="M80 150 L150 80 L80 10 L10 80 Z" fill="#EAF3FF" stroke="#071426" strokeWidth="3" />
      <path d="M80 150 L150 80" stroke="#176BFF" strokeWidth="6" strokeLinecap="round" />
      {BASES.map((base, index) =>
        index === 3 ? (
          <g key={base.label}>
            <path
              d={`M${base.x - 13} ${base.y - 13} h26 v13 l-13 13 l-13 -13 z`}
              fill="#071426"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <text x={base.x} y={base.y + 3} textAnchor="middle" fontSize="14" fontWeight="800" fill="#FFFFFF">
              {base.label}
            </text>
          </g>
        ) : (
          <g key={base.label}>
            <rect
              x={base.x - 13}
              y={base.y - 13}
              width="26"
              height="26"
              transform={`rotate(45 ${base.x} ${base.y})`}
              fill="#071426"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <text x={base.x} y={base.y + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#FFFFFF">
              {base.label}
            </text>
          </g>
        ),
      )}
    </svg>
  );
}

export function BasePath({ steps }: { readonly steps: readonly [BasePathStep, BasePathStep, BasePathStep, BasePathStep] }) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-[18rem_1fr]">
      <div className="mx-auto w-full max-w-[18rem]">
        <DiamondDiagram />
      </div>
      <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className="border-t-4 border-navy pt-4">
            <p className="display text-5xl leading-none text-royal-ink" aria-hidden="true">
              {index + 1}
            </p>
            <h3 className="mt-2 text-2xl text-navy">{step.title}</h3>
            {step.note ? (
              <p className="mt-1 inline-block rounded-full border-2 border-field px-3 py-0.5 text-sm font-semibold text-graphite">
                {step.note}
              </p>
            ) : null}
            <p className="mt-2 text-slate">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
