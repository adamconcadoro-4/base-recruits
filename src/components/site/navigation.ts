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
  { href: '/schools', label: 'Search schools' },
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
      { href: '/schools', label: 'Search schools' },
      { href: '/compare', label: 'Compare schools' },
      { href: '/saved', label: 'Saved schools' },
      { href: '/match', label: 'Compare your scores' },
      { href: '/resources', label: 'Recruiting resources' },
    ],
  },
  {
    heading: 'Who it’s for',
    items: [
      { href: '/athletes', label: 'High school athletes' },
      { href: '/transfers', label: 'Transfer athletes' },
      { href: '/coaches', label: 'College coaches' },
      { href: '/pricing', label: 'Free and optional plans' },
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
