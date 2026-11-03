import { CheckIcon, CopyIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface CopyButtonProps {
  value: string;
  label?: string;
  /** Only the icon (the label becomes the accessible name). */
  iconOnly?: boolean;
  variant?: 'outline' | 'ghost' | 'secondary' | 'default';
  size?: 'sm' | 'default' | 'icon' | 'icon-sm';
  className?: string;
}

export function CopyButton({
  value,
  label = 'Copy',
  iconOnly,
  variant = 'outline',
  size = 'sm',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? (size === 'sm' ? 'icon-sm' : 'icon') : size}
      onClick={copy}
      aria-label={iconOnly ? label : undefined}
      className={className}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {!iconOnly && (copied ? 'Copied' : label)}
    </Button>
  );
}
