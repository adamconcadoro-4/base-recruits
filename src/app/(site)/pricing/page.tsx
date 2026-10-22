import { Check } from 'lucide-react';
import type { Metadata } from 'next';

import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { PLANS } from '@/config/plans';
import { CAPABILITIES, CORE_CAPABILITY_KEYS } from '@/lib/entitlements/capabilities';

export const metadata: Metadata = { title: 'Free and optional plans' };

const coreForPeople = CORE_CAPABILITY_KEYS.map((key) => CAPABILITIES[key]).filter(
  (capability) => capability.audience !== 'verified_coach' && capability.audience !== 'admin',
);
const coreForCoaches = CORE_CAPABILITY_KEYS.map((key) => CAPABILITIES[key]).filter(
  (capability) => capability.audience === 'verified_coach',
);

export default function PricingPage() {
  const paidPlans = PLANS.filter((plan) => plan.availability === 'planned');
  return (
    <>
      <PageIntro title="Free core. Optional tools.">
        Finding schools and being found by coaches is free for good. Paying never changes your matches or whether
        coaches can see you.
      </PageIntro>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div className="border-t-8 border-navy pt-6">
            <h2 className="text-4xl text-navy">Base Free</h2>
            <p className="mt-2 text-lg">$0, for athletes and families. Always.</p>
            <ul className="mt-6 space-y-3">
              {coreForPeople.map((capability) => (
                <li key={capability.description} className="flex gap-3">
                  <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success-ink" />
                  <span>{capability.description}</span>
                </li>
              ))}
            </ul>
            <ButtonLink href="/signup" className="mt-8">
              Create a free account
            </ButtonLink>
          </div>
          <div className="border-t-8 border-royal pt-6">
            <h2 className="text-4xl text-navy">Verified coaches</h2>
            <p className="mt-2 text-lg">$0 after verification. Always.</p>
            <ul className="mt-6 space-y-3">
              {coreForCoaches.map((capability) => (
                <li key={capability.description} className="flex gap-3">
                  <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success-ink" />
                  <span>{capability.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-ice">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-4xl text-navy">Planned paid plans</h2>
          <p className="mt-3 max-w-2xl text-lg">
            These add organizing and planning tools on top of the free core. They are not on sale yet, nothing is billed,
            and prices are proposals that may change.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {paidPlans.map((plan) => (
              <article key={plan.key} className="border-2 border-navy bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-3xl text-navy">{plan.name}</h3>
                  <StatusChip tone="neutral">Not available yet</StatusChip>
                </div>
                <p className="mt-2 text-slate">Proposed ${plan.proposedMonthlyPriceUsd.toFixed(2)} a month</p>
                <p className="mt-4">{plan.summary}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-slate">
            If you ever cancel a paid plan, you keep a full free account, including every saved school, your academic
            basics and your recruiting profile.
          </p>
        </div>
      </section>
    </>
  );
}
