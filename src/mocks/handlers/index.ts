import { adminHandlers } from './admin';
import { aiHandlers } from './ai';
import { appConfigHandlers } from './app-config';
import { authHandlers } from './auth';
import { contentHandlers } from './content';
import { integrationsHandlers } from './integrations';
import { legacyHandlers } from './legacy';
import { safetyHandlers } from './safety';
import { staffHandlers } from './staff';
import { supportHandlers } from './support';
import { usersHandlers } from './users';

export const handlers = [
  ...authHandlers,
  ...staffHandlers,
  ...adminHandlers,
  ...appConfigHandlers,
  ...contentHandlers,
  ...usersHandlers,
  ...safetyHandlers,
  ...supportHandlers,
  ...aiHandlers,
  ...integrationsHandlers,
  ...legacyHandlers,
];
