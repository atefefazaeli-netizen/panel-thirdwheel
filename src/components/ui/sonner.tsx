import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { resolveTheme, useTheme } from '@/stores/theme';

// Upstream reads the theme from next-themes; this project keeps the theme in a zustand store.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme((s) => s.theme);

  return (
    <Sonner
      theme={resolveTheme(theme)}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
