import type * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface DrawerPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const sizes = { md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' } as const;

/** A side drawer for details and previews (payloads, flags, tickets). */
export function DrawerPreview({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'lg',
}: DrawerPreviewProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn('w-full gap-0', sizes[size])}>
        <SheetHeader className="border-b pr-10">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Details</SheetDescription>
          )}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">{children}</div>
        </ScrollArea>
        {footer && <SheetFooter className="border-t">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
