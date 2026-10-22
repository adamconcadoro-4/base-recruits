import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="bg-white focus:outline-none">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h1 className="text-5xl text-navy">We couldn’t find that page</h1>
          <p className="mt-4 text-lg">Check the address, or start from the home page.</p>
          <ButtonLink href="/" className="mt-8">
            Back to the home page
          </ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
