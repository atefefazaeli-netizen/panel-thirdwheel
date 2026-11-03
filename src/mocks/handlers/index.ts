import { aiHandlers } from './ai';
import { authHandlers } from './auth';
import { contentHandlers } from './content';
import { integrationsHandlers } from './integrations';
import { safetyHandlers } from './safety';
import { supportHandlers } from './support';
import { usersHandlers } from './users';

export const handlers = [
  ...authHandlers,
  ...contentHandlers,
  ...usersHandlers,
  ...safetyHandlers,
  ...supportHandlers,
  ...aiHandlers,
  ...integrationsHandlers,
];
