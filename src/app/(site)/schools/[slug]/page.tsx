import { notFound } from 'next/navigation';

/**
 * Institution and program profiles. No school records are published yet
 * (Stage 2), so every slug is honestly "not found" rather than invented.
 */
export default async function SchoolProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  await params;
  notFound();
}
