# Open Decisions

Decisions the build has defaulted conservatively. Base Recruits is owned by the founder and Jonathan Caceres; it is a
separate company from any other venture. Each default is implemented, tested and
changeable with one migration or config edit. Recommended answers are engineering recommendations, not legal advice.

## Founder decisions

| # | Decision | Current default | Trade-off | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | Supabase project for Base Recruits development | None yet. The founder's existing Supabase organization (Pro plan) holds other work; its projects must not be used | A project inside that organization would share members and billing with the other work: on the Pro plan every organization member can open every project, and each extra project adds about $10/month | A separate "Base Recruits" Supabase organization owned by the founder and Jonathan Caceres: Free plan for development (free projects may pause after 7 days of low activity), upgraded to Pro for production. Create the dev project before inviting the second owner, because Supabase counts every owner's free-project allowance |
| F2 | Who reviews coach verifications, and how fast | Base Recruits is owned by the founder and Jonathan Caceres; the day-to-day reviewer is not yet assigned | Every verified coach is a manual review; slow reviews stall Pillar C's network value | Assign one of the two as the named reviewer, with the other as backup, and a 2-business-day target before Stage 4 |
| F3 | Coach verification evidence standard | Official staff-directory page on an https athletics site listing the person in a baseball role; valid 365 days | Stricter evidence slows onboarding; looser evidence lets non-coaches reach minors' profiles | Keep; add "institution email domain matches the program's official domain" as a reviewer checklist item in Stage 2 |
| F4 | Minors' coach-facing sharing needs a linked guardian's approval | **Decided 2026-10-21 by the founder: on** for discovery, academic summary, metrics, contact info, messaging and documents | Strong protection for 13–17-year-olds; adds friction that may slow early athlete discoverability | Keep on for launch; revisit with counsel and real funnel data (`consent_scope_rules.requires_guardian_approval_for_minor`) |
| F5 | What a linked parent/guardian sees by default | Only the basic athlete record; everything else needs the athlete's explicit grant | Respects athlete control; parents of minors may expect more | Keep explicit grants; at link approval, ask the athlete which items to share (no pre-checked boxes) |
| F6 | Can a minor end a parent/guardian link alone | Yes — either party can end a platform link | Platform access is consent-based, but parents of minors may object | Keep, pending counsel (L3) |
| F7 | Support and appeals channel | Not defined; UI copy says "contact support" | Coaches need an appeal path; families need privacy-request handling | Create a dedicated support address before Stage 4 |
| F8 | Paid plan prices | $14.99 / $29.99 / $39.99 proposed, marked as hypotheses, not purchasable | Stage 6 decision | Decide after Stage 5 with usage data |
| F9 | How strongly to verify that a "parent" is a parent | Self-attested adult age and relationship, plus the athlete's approval after seeing the account's name and email | Light verification keeps family onboarding easy; a determined teen with a second account and false answers could still pose as a parent | Keep for launch with audit monitoring; decide on stronger verification before coach messaging with minors (Stage 4) |

## Legal / compliance review (production gate)

| # | Question | Where it shows up |
| --- | --- | --- |
| L1 | COPPA: neutral age screen wording and under-13 handling (block, no data retained) | Signup flow, `record_birthdate`, `admin_record_birthdate` |
| L2 | State student-privacy and minors' online-safety laws for 13–17 users (consent, defaults, messaging) | `consent_scope_rules`, Stage 4 messaging |
| L3 | Parent/guardian rights over a minor's account vs. the athlete's control | `family_links`, `revoke_consent`, `end_family_link` |
| L4 | FERPA applicability when transcripts and school-issued records are uploaded or verified | Stage 4 documents and verification |
| L5 | NCAA / NAIA / NJCAA recruiting-contact rules as they apply to platform messaging and visibility | Stage 4 coach messaging |
| L6 | Data-source licensing and permitted access (College Scorecard, IPEDS, association directories, school pages) | Stage 2 imports |
| L7 | Audit-log retention period and deletion-request handling | `audit_events` retention switch |
| L8 | Final privacy policy, terms of use and accessibility statement (current pages will be labelled drafts) | Trust pages |
