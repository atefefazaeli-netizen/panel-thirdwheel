import { adminHandlers } from './admin';
import { aiHandlers } from './ai';
import { authHandlers } from './auth';
import { contentHandlers } from './content';
import { integrationsHandlers } from './integrations';
import { legacyHandlers } from './legacy';
import { safetyHandlers } from './safety';
import { supportHandlers } from './support';
import { usersHandlers } from './users';

export const handlers = [
  ...authHandlers,
  ...adminHandlers,
  ...contentHandlers,
  ...usersHandlers,
  ...safetyHandlers,
  ...supportHandlers,
  ...aiHandlers,
  ...integrationsHandlers,
  ...legacyHandlers,
];
