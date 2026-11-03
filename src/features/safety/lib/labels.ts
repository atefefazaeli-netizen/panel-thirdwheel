import type { SafetyKind, SafetySurface } from '../api/types';

export const KIND_LABEL: Record<SafetyKind, string> = { crisis: 'Crisis', safety: 'Safety', heat: 'Heat check' };

export const SURFACE_LABEL: Record<SafetySurface, string> = {
  'third-ear': 'Third Ear (on device)',
  'third-ear-server': 'Third Ear (server check)',
  quiz: 'Quiz',
  answer: 'Answer',
  other: 'Other',
};
