import { authHandlers } from './auth';
import { contentHandlers } from './content';
import { usersHandlers } from './users';

export const handlers = [...authHandlers, ...contentHandlers, ...usersHandlers];
