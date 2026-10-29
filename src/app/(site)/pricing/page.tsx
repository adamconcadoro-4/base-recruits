import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { assessmentSiteEnabled } from '@/config/assessment';
import { availabilityLabel, capabilityAvailability } from '@/config/availability';
import { PLANS, type PlanDefinition } from '@/config/plans';
import { CAPABILITIES, CORE_CAPABILITY_KEYS, type CoreCapabilityKey } from '@/lib/entitlements/capabilities';

export const metadata: Metadata = {
  title: 'What’s free',
  description:
    'What is free on Base Recruits today, what is coming later, and the paid plans planned with their prices. Nothing is on sale yet.',
  alternates: { canonical: '/pricing' },
};

const coreForPeople = CORE_CAPABILITY_KEYS.filter((key) => CAPABILITIES[key].audience !== 'verified_coach');
const coreForCoaches = CORE_CAPABILITY_KEYS.filter((key) => CAPABILITIES[key].audience === 'verified_coach');

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function price(amount: number): string {
  return usd.format(amount).replace(/\.00$/, '');
}

/** The plan's bullets, with its SeamState allowance while Assessment is on the site. */
function planFeatures(plan: PlanDefinition, assessmentOn: boolean): readonly string[] {
  if (!assessmentOn || plan.seamstateAnalysesPerMonth === 0) return plan.features;
  const analyses = `${plan.seamstateAnalysesPerMonth} SeamState swing analyses a month (hitters 18 and older for now)`;
  return [...plan.features, analyses];
}

function FeatureItem({ children }: { readonly children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success-ink" />
      <span>{children}</span>
    </li>
  );
}

function CapabilityItem({ capability }: { readonly capability: CoreCapabilityKey }) {
  const label = availabilityLabel(capabilityAvailability(capability));
  return (
    <li className="flex gap-3">
      <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success-ink" />
      <span>
        {CAPABILITIES[capability].description}
        {label ? (
          <>
            {' '}
            <StatusChip tone="neutral">{label}</StatusChip>
          </>
        ) : null}
      </span>
    </li>
  );
}

export default function PricingPage() {
  const paidPlans = PLANS.filter((plan) => plan.availability === 'planned');
  const assessmentOn = assessmentSiteEnabled();
  return (
    <>
      <PageIntro title="What’s free">
        School search, school pages, comparing and saving schools, and the score comparison are free. Items marked
        &ldquo;Coming later&rdquo; aren&apos;t built yet. Paying will never change your search results, your score
        comparison or whether coaches can see you.
      </PageIntro>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div className="border-t-8 border-navy pt-6">
            <h2 className="text-4xl text-navy">Base Free</h2>
            <p className="mt-2 text-lg">For players and families.</p>
            <ul className="mt-6 space-y-3">
              {coreForPeople.map((key) => (
                <CapabilityItem key={key} capability={key} />
              ))}
              {assessmentOn ? (
                <FeatureItem>Player assessment: self-assessment, the Film Room, training plans and the drill library.</FeatureItem>
              ) : null}
            </ul>
            <ButtonLink href="/signup" className="mt-8">
              Create a free account
            </ButtonLink>
          </div>
          <div className="border-t-8 border-royal pt-6">
            <h2 className="text-4xl text-navy">Verified coaches</h2>
            <p className="mt-2 text-lg">Verification is free.</p>
            <ul className="mt-6 space-y-3">
              {coreForCoaches.map((key) => (
                <CapabilityItem key={key} capability={key} />
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-ice">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-4xl text-navy">Paid plans</h2>
          <p className="mt-3 max-w-2xl text-lg">
            Paid plans will add tools for organizing your work, tracking your development and managing the recruiting
            process. These are the planned prices. None is on sale yet, and nothing is billed.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {paidPlans.map((plan) => (
              <article key={plan.key} className="border-2 border-navy bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-3xl text-navy">{plan.name}</h3>
                  <StatusChip tone="neutral">Not available yet</StatusChip>
                </div>
                <p className="mt-4">
                  <span className="text-3xl font-semibold text-navy">{price(plan.proposedMonthlyPriceUsd)}</span> a month
                  <span className="block text-slate">or {price(plan.proposedAnnualPriceUsd)} a year</span>
                </p>
                <p className="mt-4 text-lg font-semibold text-navy">{plan.summary}</p>
                <ul className="mt-4 space-y-2" aria-label={`${plan.name} includes`}>
                  {planFeatures(plan, assessmentOn).map((feature) => (
                    <FeatureItem key={feature}>{feature}</FeatureItem>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-slate">
            If paid plans launch and you cancel one, you keep a full free account, including every saved school.
          </p>
        </div>
      </section>
    </>
  );
}
