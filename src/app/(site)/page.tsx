import Link from 'next/link';

import { BasePath } from '@/components/site/base-path';
import { ButtonLink } from '@/components/ui/button';

const DIVISIONS = [
  { key: 'ncaa-d1', label: 'NCAA Division I' },
  { key: 'ncaa-d2', label: 'NCAA Division II' },
  { key: 'ncaa-d3', label: 'NCAA Division III' },
  { key: 'naia', label: 'NAIA' },
  { key: 'juco', label: 'Junior college (NJCAA and others)' },
] as const;

const FAQ = [
  {
    question: 'Is Base Recruits really free?',
    answer:
      'Yes. School search, academic matching, comparisons, unlimited saved schools, a basic recruiting profile and choosing to be visible to verified coaches are free for good. Optional paid plans will only add organizing tools.',
  },
  {
    question: 'Can paying make coaches see me?',
    answer:
      'No. Whether coaches can find you depends only on what you choose to share. No plan sells visibility, admission, eligibility, roster spots or scholarships.',
  },
  {
    question: 'Where does the school information come from?',
    answer:
      'From official sources such as the College Scorecard, IPEDS, the Common Data Set and athletic association directories. Every figure shows its source and year, and anything a school does not publish is marked as not reported.',
  },
  {
    question: 'Who can see my information?',
    answer:
      'Only the people you choose. Your profile is private until you turn on visibility to verified college coaches, and you can turn it off at any time. Athletes under 18 need a parent or guardian to approve coach visibility.',
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
              Discover real college baseball programs, understand your academic fit, and build your recruiting
              shortlist. Free.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/match" size="lg">
                Find my college matches
              </ButtonLink>
              <ButtonLink href="/schools" size="lg" variant="outlineOnNavy">
                Search schools
              </ButtonLink>
            </div>
          </div>

          <aside aria-labelledby="quick-match-title" className="self-start border-t-8 border-royal bg-white p-6 text-graphite sm:p-8">
            <h2 id="quick-match-title" className="text-4xl text-navy">
              Quick Match
            </h2>
            <p className="mt-3">
              Quick Match opens when our national program registry is published. It will compare your grades and test
              scores with each school&apos;s published ranges, free and without an account.
            </p>
            <h3 className="mt-6 text-xl text-navy">What you&apos;ll enter</h3>
            <ul className="mt-3 grid gap-x-6 gap-y-2 text-[0.95rem] sm:grid-cols-2">
              <li>GPA and its scale</li>
              <li>SAT or ACT, if you have one</li>
              <li>Graduation year</li>
              <li>Primary position</li>
              <li>Preferred regions</li>
              <li>Divisions you&apos;re open to</li>
            </ul>
            <p className="mt-6 text-sm text-slate">
              Results are a starting point, not an admission decision. Test-optional schools never count a missing score
              against you.
            </p>
            <Link href="/how-it-works" className="mt-4 inline-block font-semibold text-royal-ink underline">
              See how matching works
            </Link>
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
                  body: 'Browse real college baseball programs across every division, with the source of each fact.',
                },
                {
                  title: 'Understand academic fit',
                  body: 'See where your grades and scores sit against each school’s published ranges and policies.',
                },
                {
                  title: 'Build your shortlist',
                  body: 'Compare schools side by side and save as many as you like. No account needed to start.',
                },
                {
                  title: 'Create your recruiting profile',
                  body: 'Share what you choose with verified college coaches, and change your mind any time.',
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
              Each result lists the program&apos;s division and conference, the school&apos;s published academic ranges
              with the year they come from, and its testing policy. If a school doesn&apos;t publish a number, we say
              so instead of estimating one.
            </p>
            <p className="mt-4 text-slate">
              The registry is being built from official sources now. No school records are published yet.
            </p>
          </div>
          <figure aria-labelledby="result-anatomy-caption" className="border-2 border-navy bg-white p-6">
            <figcaption id="result-anatomy-caption" className="text-sm font-semibold text-slate">
              What a school result contains
            </figcaption>
            <dl className="mt-4 divide-y divide-rule">
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Program</dt>
                <dd className="text-right text-slate">Division, conference, verified status</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Middle 50% SAT and ACT</dt>
                <dd className="text-right text-slate">With source and academic year</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">GPA data</dt>
                <dd className="text-right text-slate">Or “Not publicly reported”</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Testing policy</dt>
                <dd className="text-right text-slate">Required, optional or blind</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="font-semibold">Your fit</dt>
                <dd className="text-right text-slate">Explained in plain language</dd>
              </div>
            </dl>
          </figure>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-5xl text-navy">Browse by division</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {DIVISIONS.map((division) => (
              <li key={division.key}>
                <Link
                  href={`/schools?division=${division.key}`}
                  className="flex min-h-20 items-end border-b-4 border-royal bg-ice px-4 py-3 text-xl font-bold text-navy no-underline hover:bg-white"
                >
                  {division.label}
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
              Coaches whose role is confirmed against their program&apos;s official staff page search athletes who chose
              to be found, keep private recruiting boards and message within recruiting rules. No coach subscription,
              ever.
            </p>
            <ButtonLink href="/coaches" variant="onNavy" className="mt-6">
              How coach verification works
            </ButtonLink>
          </div>
          <div className="space-y-6">
            <h2 className="text-5xl text-white">Free core, optional tools</h2>
            <p className="text-lg text-white/90">
              Everything you need to find schools and be found stays free. Planned paid plans add organizing tools like
              reminders and pipeline tracking, and are not on sale yet.
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
              Sources and dates on every figure. Matches are estimates, never guarantees. Self-reported information is
              always labelled as self-reported. You decide who sees your profile.
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
          <h2 className="text-5xl text-navy">Start with the schools that fit.</h2>
          <ButtonLink href="/match" size="lg">
            Find my college matches
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
