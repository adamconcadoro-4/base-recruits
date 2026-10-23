import type { Metadata } from 'next';
import Link from 'next/link';

import { BasePath } from '@/components/site/base-path';
import { ButtonLink, buttonStyles } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { FEATURES, availabilityLabel } from '@/config/availability';
import { DIVISION_SHORTCUTS, shortcutHref, type DivisionShortcut } from '@/lib/registry/divisions';

export const metadata: Metadata = {
  description:
    'Search real college baseball programs, see each school’s published admissions figures and costs with their sources, compare schools and save your shortlist. Free.',
  alternates: { canonical: '/' },
};

const SHORTCUTS = Object.keys(DIVISION_SHORTCUTS) as DivisionShortcut[];

const FAQ = [
  {
    question: 'Is Base Recruits really free?',
    answer:
      'Yes. School search, school pages, comparing schools and saving as many schools as you like are free now and stay free. The score comparison is an early version and is free too. Recruiting profiles and coach tools are not open yet; when they open, their basic versions will be free.',
  },
  {
    question: 'Can paying make coaches see me?',
    answer:
      'No. No plan will ever sell visibility, admission, eligibility, roster spots or scholarships. Paid plans are not on sale, and nothing is billed.',
  },
  {
    question: 'Where does the school information come from?',
    answer:
      'From U.S. Department of Education data: the EADA athletics report for baseball programs and the College Scorecard for admissions, cost and enrollment. Every figure shows its year. When we check a fact against a school’s own athletics or admissions page, the page says so and links to it. Anything not reported stays marked as not reported.',
  },
  {
    question: 'Who can see my information?',
    answer:
      'Schools you save in this browser stay in this browser. Schools you save to a free account are visible only to you. Recruiting profiles are not open yet; when they open, they will be private until you choose to share them.',
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="on-navy bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-24 lg:pt-20">
          <div>
            <h1 className="text-6xl text-white sm:text-7xl lg:text-8xl">Your Next Level Starts Here.</h1>
            <p className="mt-6 max-w-xl text-xl text-white/90">
              Search real college baseball programs, see each school&apos;s published admissions figures and costs with
              their sources, and save your shortlist. Free.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/schools" size="lg">
                Search schools
              </ButtonLink>
              <ButtonLink href="/match" size="lg" variant="outlineOnNavy">
                Compare your scores
              </ButtonLink>
            </div>
          </div>

          <aside aria-labelledby="quick-search-title" className="self-start border-t-8 border-royal bg-white p-6 text-graphite sm:p-8">
            <h2 id="quick-search-title" className="text-4xl text-navy">
              Quick search
            </h2>
            <form method="get" action="/schools" className="mt-4 space-y-4">
              <TextField id="home-q" name="q" label="School name or city" autoComplete="off" maxLength={100} />
              <SelectField id="home-division" name="division" label="Division" defaultValue="">
                <option value="">Any division</option>
                {SHORTCUTS.map((key) =>
                  key === 'two_year' ? (
                    <option key={key} value="two_year">
                      {DIVISION_SHORTCUTS[key].label}
                    </option>
                  ) : (
                    <option key={key} value={DIVISION_SHORTCUTS[key].codes[0]}>
                      {DIVISION_SHORTCUTS[key].label}
                    </option>
                  ),
                )}
              </SelectField>
              <button type="submit" className={buttonStyles({ variant: 'primary' })}>
                Show schools
              </button>
            </form>
            <p className="mt-6 text-sm text-slate">
              Free, with no account. Results show each school&apos;s division and admissions figures with the year they
              describe.
            </p>
          </aside>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-5xl text-navy">Round the bases</h2>
          <p className="mt-3 max-w-2xl text-lg text-slate">Four steps from first search to a profile coaches can find.</p>
          <div className="mt-10">
            <BasePath
              steps={[
                {
                  title: 'Search schools',
                  body: 'Browse colleges that reported a baseball team in the latest federal athletics report, with the source of each fact.',
                },
                {
                  title: 'Compare your scores',
                  body: 'See where your SAT or ACT sits against the score ranges each school reported for a past entering class.',
                  note: availabilityLabel(FEATURES.academic_comparison.status),
                },
                {
                  title: 'Build your shortlist',
                  body: 'Compare up to five schools side by side, and save as many as you like. No account needed to start.',
                },
                {
                  title: 'Create your recruiting profile',
                  body: 'Share what you choose with verified college coaches, and change your mind any time.',
                  note: availabilityLabel(FEATURES.athlete_profile.status),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="bg-ice">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-5xl text-navy">Every school result shows its work</h2>
            <p className="mt-4 text-lg">
              Each result shows the baseball division and how it was confirmed, the school&apos;s reported admissions
              figures with the entering class they describe, and its published cost with the academic year. If a figure
              isn&apos;t reported, we say so instead of estimating one.
            </p>
            <p className="mt-4 text-slate">
              <Link href="/data-methodology" className="font-semibold text-royal-ink underline">
                See what the data covers and what is still missing
              </Link>
            </p>
          </div>
          <figure aria-labelledby="result-anatomy-caption" className="border-2 border-navy bg-white p-6">
            <figcaption id="result-anatomy-caption" className="text-sm font-semibold text-slate">
              What a school result contains
            </figcaption>
            <dl className="mt-4 divide-y divide-rule">
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Program</dt>
                <dd className="text-right text-slate">Division, and whether it was checked against an official page</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Middle 50% SAT and ACT</dt>
                <dd className="text-right text-slate">With the entering class they describe</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">GPA data</dt>
                <dd className="text-right text-slate">“Not reported in federal data”</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Testing policy</dt>
                <dd className="text-right text-slate">The past class’s policy, and the current one where checked</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Cost</dt>
                <dd className="text-right text-slate">Published price with its academic year</dd>
              </div>
            </dl>
          </figure>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-5xl text-navy">Browse by division</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SHORTCUTS.map((key) => (
              <li key={key}>
                <Link
                  href={shortcutHref(key)}
                  className="flex min-h-20 items-end border-b-4 border-royal bg-ice px-4 py-3 text-xl font-bold text-navy no-underline hover:bg-white"
                >
                  {DIVISION_SHORTCUTS[key].label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="on-navy bg-navy-raised text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-5xl text-white">Free for verified college coaches</h2>
            <p className="mt-4 text-lg text-white/90">
              College coaches can create an account and apply for verification now. Searching athletes who choose to be
              found, private recruiting boards and messaging open later, and stay free. No coach subscription, ever.
            </p>
            <ButtonLink href="/coaches" variant="onNavy" className="mt-6">
              How coach verification works
            </ButtonLink>
          </div>
          <div className="space-y-6">
            <h2 className="text-5xl text-white">Free core, optional tools</h2>
            <p className="text-lg text-white/90">
              Everything you need to find schools stays free. Planned paid plans would add organizing tools like
              reminders and pipeline tracking. They are not on sale, and nothing is billed.
            </p>
            <ButtonLink href="/pricing" variant="outlineOnNavy">
              Compare free and planned plans
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-5xl text-navy">What you can trust</h2>
            <p className="mt-4 text-lg text-slate">
              Sources and years on every figure. Score comparisons describe past entering classes, never your chances of
              admission. Unchecked facts are labelled as unchecked.
            </p>
            <Link href="/data-methodology" className="mt-4 inline-block font-semibold text-royal-ink underline">
              Read the data methodology
            </Link>
          </div>
          <div>
            <h2 className="text-3xl text-navy">Questions families ask</h2>
            <div className="mt-4 divide-y-2 divide-rule border-y-2 border-rule">
              {FAQ.map((item) => (
                <details key={item.question} className="group py-4">
                  <summary className="cursor-pointer list-none text-lg font-semibold text-navy marker:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-3 text-graphite">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t-8 border-royal bg-ice">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <h2 className="text-5xl text-navy">Start with the schools.</h2>
          <ButtonLink href="/schools" size="lg">
            Search schools
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
