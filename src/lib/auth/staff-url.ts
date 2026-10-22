/**
 * Checks for coach staff-directory links, shared by the submission form and the
 * admin review queue. The reviewer must see the site a link really opens.
 */

export type StaffUrlProblem = 'not_https' | 'invalid' | 'has_credentials' | 'no_domain';

export function staffUrlProblem(value: string): StaffUrlProblem | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'https:') return 'not_https';
  if (url.username || url.password || /^https:\/\/[^/?#]*@/i.test(value)) return 'has_credentials';
  if (!url.hostname.includes('.')) return 'no_domain';
  return null;
}

export function staffUrlProblemMessage(problem: StaffUrlProblem): string {
  switch (problem) {
    case 'not_https':
      return 'Enter the full https:// link to the official staff page.';
    case 'has_credentials':
      return 'Remove the part before “@” from the link. Use the staff page’s normal address.';
    case 'invalid':
    case 'no_domain':
      return 'Enter the full link to the official staff page, for example https://athletics.school.edu/staff.';
  }
}

/** The site a link really opens, in the browser's ASCII form (punycode). */
export function staffUrlHost(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/** The last two labels of a host name, e.g. athletics.state.edu -> state.edu. */
function baseDomain(host: string): string {
  return host.toLowerCase().split('.').filter(Boolean).slice(-2).join('.');
}

export interface StaffUrlReviewFlags {
  readonly host: string | null;
  /** The host uses internationalized (look-alike capable) characters. */
  readonly internationalized: boolean;
  /** The staff page's site differs from the work email's domain. */
  readonly domainMismatch: boolean;
}

export function reviewFlags(url: string | null, emailDomain: string): StaffUrlReviewFlags {
  const host = url ? staffUrlHost(url) : null;
  return {
    host,
    internationalized: host !== null && host.split('.').some((label) => label.startsWith('xn--')),
    domainMismatch: host !== null && baseDomain(host) !== baseDomain(emailDomain),
  };
}
