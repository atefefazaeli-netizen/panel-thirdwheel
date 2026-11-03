import { authHandlers } from './auth';
import { contentHandlers } from './content';

export const handlers = [...authHandlers, ...contentHandlers];
