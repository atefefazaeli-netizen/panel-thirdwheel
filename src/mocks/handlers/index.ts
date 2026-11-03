import { authHandlers } from './auth';
import { contentHandlers } from './content';
import { safetyHandlers } from './safety';
import { usersHandlers } from './users';

export const handlers = [...authHandlers, ...contentHandlers, ...usersHandlers, ...safetyHandlers];
