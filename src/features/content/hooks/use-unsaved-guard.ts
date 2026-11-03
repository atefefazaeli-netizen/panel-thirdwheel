import { useBlocker } from '@tanstack/react-router';

/**
 * Blocks leaving the page (links, back button, closing the tab) while there are unsaved edits.
 * Returns the resolver: render a confirm dialog while `status === 'blocked'`.
 */
export function useUnsavedGuard(dirty: boolean) {
  return useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });
}
