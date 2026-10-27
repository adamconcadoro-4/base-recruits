import { assessmentSiteEnabled } from '@/config/assessment';

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Header navigation (spec §4: Search Schools, How It Works, For Coaches,
 * Pricing, Login), plus the working discovery tools: score comparison and
 * saved schools. Labels describe what each page does today
 * (src/config/availability.ts).
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/schools', label: 'Explore programs' },
  { href: '/match', label: 'Compare scores' },
  { href: '/saved', label: 'Saved schools' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/coaches', label: 'For coaches' },
  { href: '/pricing', label: 'Pricing' },
];

export const FOOTER_NAV: ReadonlyArray<{ readonly heading: string; readonly items: readonly NavItem[] }> = [
  {
    heading: 'Explore',
    items: [
      { href: '/schools', label: 'Explore programs' },
      { href: '/compare', label: 'Compare schools' },
      { href: '/saved', label: 'Saved schools' },
      { href: '/match', label: 'Compare your scores' },
      { href: '/resources', label: 'Recruiting resources' },
    ],
  },
  {
    heading: 'Who it’s for',
    items: [
      { href: '/athletes', label: 'High school players' },
      { href: '/transfers', label: 'Transfer players' },
      { href: '/coaches', label: 'College coaches' },
      { href: '/pricing', label: 'What’s free' },
    ],
  },
  {
    heading: 'Trust',
    items: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/data-methodology', label: 'Data methodology' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/accessibility', label: 'Accessibility' },
      { href: '/support', label: 'Help and corrections' },
    ],
  },
];

const ASSESSMENT_NAV: NavItem = { href: '/assessment', label: 'Assessment' };

/** Header navigation, with the Assessment tab only while Assessment is switched on for the site. */
export function primaryNav(): readonly NavItem[] {
  if (!assessmentSiteEnabled()) return PRIMARY_NAV;
  const index = PRIMARY_NAV.findIndex((item) => item.href === '/saved');
  return [...PRIMARY_NAV.slice(0, index + 1), ASSESSMENT_NAV, ...PRIMARY_NAV.slice(index + 1)];
}

/** Footer navigation; the Explore group lists the Assessment explanation while Assessment is on. */
export function footerNav(): typeof FOOTER_NAV {
  if (!assessmentSiteEnabled()) return FOOTER_NAV;
  return FOOTER_NAV.map((group) =>
    group.heading === 'Explore'
      ? { heading: group.heading, items: [...group.items, { href: '/player-assessment', label: 'Player assessment' }] }
      : group,
  );
}
