'use client';

import { Button } from '@/components/ui/button';

/** Opens the browser's print dialog (save as PDF from there). */
export function PrintButton({ label = 'Print or save as PDF' }: { readonly label?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
