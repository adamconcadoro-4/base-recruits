import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { SessionOutline } from '@/components/assessment/session-outline';
import { Notice } from '@/components/ui/notice';
import { PROGRESSION_STAGES, sessionTitle } from '@/lib/assessment/catalog/session-templates';
import { MASTER_WORKBOOK, MASTER_WORKBOOK_COACH_REVIEWED, withMasterNames, type LabelledText } from '@/lib/assessment/hitting-workbook/master';

export const metadata: Metadata = { title: 'Six-Stage Hitting Progression' };

function Bullets({ items }: { readonly items: readonly LabelledText[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item.sourceRow}>
          <span className="font-semibold">{item.label}:</span> {withMasterNames(item.text)}
        </li>
      ))}
    </ul>
  );
}

const MEDICINE_BALL_KEY = ['Medicine-ball kit', 'Medicine-ball count', 'Medicine-ball review'];

/**
 * The Hitting Master Workbook's paired practice progression (decision F56):
 * six stage cards, the session every stage follows, and the rules for
 * advancing, scaling, substituting and adding one focus block. Shown as
 * written in the workbook, with drill numbers spelled out as names.
 */
export default function ProgressionPage() {
  const key = MASTER_WORKBOOK.quickKey.filter((item) => !MEDICINE_BALL_KEY.includes(item.label));
  const medicineKey = MASTER_WORKBOOK.quickKey.filter((item) => MEDICINE_BALL_KEY.includes(item.label));
  return (
    <>
      <PageTitle title="Six-Stage Hitting Progression">
        Rear leg → front leg → upper body → normal swing. Each stage pairs three drills from the hitting drill library, then checks
        whether the hitter can use the work in an unrestricted swing.
      </PageTitle>
      <div className="space-y-12">
        <p className="text-sm text-slate print:hidden">
          <Link href="/assessment/hitting" className="font-semibold text-royal-ink underline">
            Hitting
          </Link>{' '}
          ›{' '}
          <Link href="/assessment/hitting/drills" className="font-semibold text-royal-ink underline">
            Hitting drill library
          </Link>
        </p>
        <Notice tone="info" title="What this plan is, and isn’t">
          <ul className="list-disc space-y-1 pl-5">
            {MASTER_WORKBOOK.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-2">
            From the Base Recruits hitting master workbook.{' '}
            {MASTER_WORKBOOK_COACH_REVIEWED ? 'Reviewed by Base Recruits hitting coaches.' : 'Not yet reviewed by Base Recruits hitting coaches.'}{' '}
            To use a stage, open a published hitting report&apos;s{' '}
            <Link href="/assessment/training" className="font-semibold text-royal-ink underline">
              training plan builder
            </Link>{' '}
            and choose the stage under “Start from”.
          </p>
        </Notice>

        <DashboardSection id="how" title="How to use it">
          <div className="space-y-6">
            <Bullets items={MASTER_WORKBOOK.howToUse} />
            <ScrollTable label="The session every stage follows">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="py-2 text-left font-semibold">The session every stage follows</caption>
                <thead>
                  <tr className="border-b-2 border-rule text-slate">
                    <th scope="col" className="py-2 pr-3">
                      Block
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Order and dose
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Coaching task
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MASTER_WORKBOOK.structure.map((item) => (
                    <tr key={item.block} className="border-b border-rule align-top">
                      <th scope="row" className="py-2 pr-3 font-semibold">
                        {item.block}
                      </th>
                      <td className="py-2 pr-3">{item.dose}</td>
                      <td className="py-2 pr-3">{withMasterNames(item.task)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
            <div>
              <h3 className="text-xl font-semibold text-navy">Quick key</h3>
              <Bullets items={key} />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-navy">Equipment and recording</h3>
              <Bullets items={MASTER_WORKBOOK.equipment} />
            </div>
          </div>
        </DashboardSection>

        <DashboardSection id="stages" title="The six stages">
          <div className="space-y-4">
            {PROGRESSION_STAGES.map((item) => (
              <details key={item.id} className="border-2 border-rule p-4" open={item.stage?.number === 1}>
                <summary className="cursor-pointer text-xl font-semibold text-navy">{sessionTitle(item)}</summary>
                <div className="mt-3">
                  <SessionOutline session={item} />
                </div>
              </details>
            ))}
          </div>
        </DashboardSection>

        <DashboardSection id="advance" title="Advance, repeat, simplify, or fix the recording">
          <div className="space-y-4">
            <Bullets items={MASTER_WORKBOOK.advancement} />
            <ul className="list-disc space-y-2 pl-5">
              {MASTER_WORKBOOK.decisions.map((item) => (
                <li key={item.sourceRow}>{item.text}</li>
              ))}
            </ul>
          </div>
        </DashboardSection>

        <DashboardSection id="scaling" title="Scaling the workload" description="Optional scaling choices, not extra work on top of the standard session.">
          <ScrollTable label="Workload adjustments">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b-2 border-rule text-slate">
                  <th scope="col" className="py-2 pr-3">
                    Situation
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Adjustment
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Transfer check
                  </th>
                </tr>
              </thead>
              <tbody>
                {MASTER_WORKBOOK.adjustments.map((item) => (
                  <tr key={item.sourceRow} className="border-b border-rule align-top">
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {item.situation}
                    </th>
                    <td className="py-2 pr-3">{withMasterNames(item.adjustment)}</td>
                    <td className="py-2 pr-3">{withMasterNames(item.check)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </DashboardSection>

        <DashboardSection
          id="substitutions"
          title="Targeted pairing substitutions"
          description="Use these only when a coach has seen a repeatable pattern. A substitution replaces a block; it does not add a second workout or prove that one body part caused another's problem."
        >
          <ScrollTable label="Pairing substitutions">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="border-b-2 border-rule text-slate">
                  <th scope="col" className="py-2 pr-3">
                    Observed pattern
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Rear-leg choice
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Front-leg choice
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Upper-body choice
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Evidence and caution
                  </th>
                </tr>
              </thead>
              <tbody>
                {MASTER_WORKBOOK.substitutions.map((item) => (
                  <tr key={item.sourceRow} className="border-b border-rule align-top">
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {item.pattern}
                    </th>
                    <td className="py-2 pr-3">{withMasterNames(item.rear)}</td>
                    <td className="py-2 pr-3">{withMasterNames(item.front)}</td>
                    <td className="py-2 pr-3">{withMasterNames(item.upper)}</td>
                    <td className="py-2 pr-3">{withMasterNames(item.caution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </DashboardSection>

        <DashboardSection id="focus" title="Optional focus blocks" description="Replace the stage’s suggested focus drill only; do not add these on top.">
          <Bullets items={MASTER_WORKBOOK.focusAlternatives} />
        </DashboardSection>

        <DashboardSection
          id="medicine-ball"
          title="Medicine-ball module"
          description="Chosen instead of a posture or balance focus, with a coach present. Throws are not scored in the assessment and do not measure power."
        >
          <div className="space-y-4">
            <Bullets items={medicineKey} />
            <Bullets items={MASTER_WORKBOOK.medicineBall} />
          </div>
        </DashboardSection>
      </div>
    </>
  );
}
