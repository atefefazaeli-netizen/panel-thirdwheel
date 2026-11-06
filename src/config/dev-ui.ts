// Development-only UI (the mock API banner and the dev sign-in hint). main.tsx registers it from
// src/mocks only when `import.meta.env.DEV` is true, so production builds never contain it: this
// registry then stays empty and the slots render nothing.
import type * as React from 'react';

export interface DevUi {
  /** Shown above the top bar on every page while the mock API answers. */
  Banner?: React.ComponentType<{ className?: string }>;
  /** Shown under the sign-in form: the dev usernames. */
  LoginHint?: React.ComponentType;
}

let current: DevUi = {};

export const devUi = (): DevUi => current;

export function registerDevUi(ui: DevUi): void {
  current = ui;
}
