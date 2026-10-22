import type { Metadata } from 'next';

import { ContentSection, DraftNotice, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <>
      <PageIntro title="Privacy">How Base Recruits handles information about student-athletes and families.</PageIntro>
      <DraftNotice />
      <ContentSection title="Private by default">
        <ul>
          <li>Your profile is visible only to you until you choose to share it.</li>
          <li>Each kind of sharing is a separate permission that you can turn off at any time, and it takes effect immediately.</li>
          <li>Coaches can search athletes only after we confirm their coaching role, and only athletes who turned on coach visibility.</li>
          <li>We record who changed what and when, so permissions can be audited.</li>
        </ul>
      </ContentSection>
      <ContentSection title="Students under 18" tone="ice">
        <ul>
          <li>Accounts are for people 13 and older. If someone under 13 tries to sign up, no account is created.</li>
          <li>Athletes under 18 need a linked parent or legal guardian to approve anything shared with coaches.</li>
          <li>Your date of birth is used only for these age rules and is never shown to coaches.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What we never do">
        <ul>
          <li>Sell transcripts, educational records or athletes&apos; contact details.</li>
          <li>Let payment change who can see you.</li>
          <li>Train AI models on private student records without proper authorization.</li>
        </ul>
      </ContentSection>
    </>
  );
}
