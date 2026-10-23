import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { Notice } from '@/components/ui/notice';

export const metadata: Metadata = {
  title: 'Help and corrections',
  description: 'How to report a wrong or missing fact about a school, and how to get help with Base Recruits.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return (
    <>
      <PageIntro title="Help and corrections">How to tell us about a mistake, and how to get help.</PageIntro>
      <ContentSection title="Report a wrong or missing fact">
        <p>
          Every school page has a <strong>Report a correction</strong> link. Tell us which fact is wrong and, if you can,
          link to the official page that shows the right one. A Base Recruits reviewer checks each report against official
          sources before anything changes, and the school page records what changed and when.
        </p>
        <p>
          Reports need a free account, so we can follow up and keep the queue free of spam.{' '}
          <Link href="/schools">Find the school</Link> to start.
        </p>
      </ContentSection>
      <ContentSection title="Other help" tone="ice">
        <Notice tone="attention" title="A support email address is not published yet">
          It will be published here before launch. We won&apos;t list an address until someone is answering it.
        </Notice>
        <p>
          For questions about recruiting rules, eligibility or admission, contact the school&apos;s admissions or
          athletics office, or your athletic association. Base Recruits can&apos;t decide those.
        </p>
      </ContentSection>
    </>
  );
}
