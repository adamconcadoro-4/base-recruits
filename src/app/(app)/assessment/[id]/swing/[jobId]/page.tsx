import { redirect } from 'next/navigation';

/** Swing reports moved to SeamState's own page; old links still work. */
export default async function OldSwingReportPage({ params }: { readonly params: Promise<{ id: string; jobId: string }> }) {
  const { jobId } = await params;
  redirect(`/seamstate/report/${encodeURIComponent(jobId)}`);
}
