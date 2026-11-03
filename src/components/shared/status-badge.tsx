import { Badge } from '@/components/ui/badge';
import { humanize } from '@/lib/format';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'muted';

/** Tone and label for every status the API returns. Unknown values fall back to neutral. */
const KNOWN: Record<string, { tone: StatusTone; label: string }> = {
  // content
  live: { tone: 'success', label: 'Live' },
  editing: { tone: 'info', label: 'Draft' },
  in_review: { tone: 'warning', label: 'In review' },
  changes_requested: { tone: 'danger', label: 'Changes requested' },
  retired: { tone: 'muted', label: 'Retired' },
  // safety
  open: { tone: 'warning', label: 'Open' },
  reviewed: { tone: 'success', label: 'Reviewed' },
  escalated: { tone: 'danger', label: 'Escalated' },
  high: { tone: 'danger', label: 'High' },
  medium: { tone: 'warning', label: 'Medium' },
  low: { tone: 'neutral', label: 'Low' },
  // support
  closed: { tone: 'muted', label: 'Closed' },
  // deliveries and webhooks
  pending: { tone: 'info', label: 'Pending' },
  delivered: { tone: 'success', label: 'Delivered' },
  failed: { tone: 'danger', label: 'Failed' },
  enabled: { tone: 'success', label: 'Enabled' },
  disabled: { tone: 'muted', label: 'Disabled' },
  revoked: { tone: 'muted', label: 'Revoked' },
  active: { tone: 'success', label: 'Active' },
  // accounts and plans
  suspended: { tone: 'danger', label: 'Suspended' },
  free: { tone: 'neutral', label: 'Free' },
  plus: { tone: 'success', label: 'Plus' },
  paid_by_partner: { tone: 'success', label: 'Paid by partner' },
  cancelled: { tone: 'muted', label: 'Cancelled' },
  payment_problem: { tone: 'danger', label: 'Payment problem' },
  // AI sources
  ai: { tone: 'success', label: 'AI' },
  fallback: { tone: 'warning', label: 'Fallback' },
  risk: { tone: 'danger', label: 'Risk' },
};

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-brand-soft text-destructive',
  brand: 'bg-brand text-brand-foreground',
  muted: 'bg-muted text-muted-foreground',
};

export interface StatusBadgeProps {
  status: string;
  /** Override the label (e.g. "Draft · v3"). */
  label?: string;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ status, label, tone, dot = true, className }: StatusBadgeProps) {
  const known = KNOWN[status];
  const t = tone ?? known?.tone ?? 'neutral';
  return (
    <Badge variant="outline" className={cn('border-transparent', toneClass[t], className)}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {label ?? known?.label ?? humanize(status)}
    </Badge>
  );
}
