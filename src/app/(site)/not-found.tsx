import { ButtonLink } from '@/components/ui/button';

export default function SiteNotFound() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h1 className="text-5xl text-navy">We couldn’t find that page</h1>
        <p className="mt-4 text-lg">
          If you followed a link to a school, it isn&apos;t listed on Base Recruits. Schools appear when they report a
          baseball team to the U.S. Department of Education, or when we&apos;ve checked the team on an official page.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/schools">Explore Baseball Programs</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Back to the home page
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
