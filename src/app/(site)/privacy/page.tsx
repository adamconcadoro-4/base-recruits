import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentSection, DraftNotice, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Base Recruits collects today, who can see it, and what is still pending before launch.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <PageIntro title="Privacy">How Base Recruits handles information about student-athletes and families.</PageIntro>
      <DraftNotice />
      <ContentSection title="What we collect today">
        <ul>
          <li>
            <strong>Without an account:</strong> nothing personal. Schools you save and your comparison picks stay in this
            browser. Scores you type into the score comparison stay in your browser and are never sent to us.
          </li>
          <li>
            <strong>With a free account:</strong> your email address, the name you give, your account type, and your date
            of birth (used only for age rules). Schools you save to your account, and any correction reports you send.
          </li>
          <li>
            <strong>Family links:</strong> if an athlete links a parent or guardian account, the link and what the athlete
            chose to share with them.
          </li>
          <li>
            <strong>Service providers:</strong> the site is hosted on Vercel and accounts and data are stored with
            Supabase. Like any web host, they keep technical logs of requests.
          </li>
        </ul>
      </ContentSection>
      <ContentSection title="Who can see it" tone="ice">
        <ul>
          <li>Schools saved to your account are visible only to you.</li>
          <li>Recruiting profiles and coach visibility are not open yet, so nothing about you is shown to coaches.</li>
          <li>
            When coach sharing opens, each kind of sharing will be a separate permission you can turn off. Permissions are
            checked in the database each time information is requested, so turning one off applies to the next request.
          </li>
          <li>We record who changed account roles, verifications and permissions, and when, so changes can be audited.</li>
        </ul>
      </ContentSection>
      <ContentSection title="Students under 18">
        <ul>
          <li>Accounts are for people 13 and older. If someone under 13 tries to sign up, no account is created.</li>
          <li>When coach sharing opens, athletes under 18 will need a linked parent or legal guardian to approve it.</li>
          <li>Your date of birth is used only for these age rules and is never shown to coaches.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What we never do" tone="ice">
        <ul>
          <li>Sell transcripts, educational records or athletes&apos; contact details.</li>
          <li>Let payment change who can see you.</li>
          <li>Train AI models on private student records without proper authorization.</li>
        </ul>
      </ContentSection>
      <ContentSection title="Still to be published before launch">
        <ul>
          <li>Who operates Base Recruits and how to contact us about privacy.</li>
          <li>How long each kind of information is kept, and when it is deleted.</li>
          <li>How to ask for a copy of your information, a correction, or deletion of your account.</li>
          <li>A final policy reviewed by counsel.</li>
        </ul>
        <p>
          Until then, see <Link href="/support">help and corrections</Link>.
        </p>
      </ContentSection>
    </>
  );
}
