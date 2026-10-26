import type { Metadata } from 'next';

import { DisciplinePage } from '@/components/assessment/discipline-page';
import type { SearchParams } from '@/lib/assessment/server/page-context';

export const metadata: Metadata = { title: 'Pitching' };

export default function PitchingPage({ searchParams }: { readonly searchParams: SearchParams }) {
  return <DisciplinePage discipline="pitching" searchParams={searchParams} />;
}
