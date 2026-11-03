import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyTheme, useTheme } from '@/stores/theme';

function ThemeSync() {
  const theme = useTheme((s) => s.theme);
  React.useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [theme]);
  return null;
}

export function Providers({ queryClient, children }: { queryClient: QueryClient; children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ThemeSync />
        {children}
        <Toaster richColors closeButton position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
