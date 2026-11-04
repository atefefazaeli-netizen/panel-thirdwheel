import { TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shown on every screen while the in-browser mock API (MSW) answers instead of the real one, so
 * nobody takes demo data for real accounts, flags or deliveries. It can't be dismissed.
 */
export function DemoBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="demo-banner"
      className={cn(
        'flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive px-4 py-2 text-center text-sm font-semibold text-white',
        className,
      )}
    >
      <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
      <span>
        Demo data, not the real API. Nothing here reaches real people, n8n or the app; changes stay in this browser and
        reset on reload.
      </span>
    </div>
  );
}
