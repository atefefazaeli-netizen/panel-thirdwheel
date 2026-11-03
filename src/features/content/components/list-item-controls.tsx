import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Move up, move down and delete buttons for one card or step. */
export function ListItemControls({
  index,
  count,
  noun,
  onMove,
  onRemove,
  disabled,
}: {
  index: number;
  count: number;
  noun: string;
  onMove: (to: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={`Move ${noun} ${index + 1} up`}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={`Move ${noun} ${index + 1} down`}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Delete ${noun} ${index + 1}`}
        className="text-destructive hover:text-destructive"
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
