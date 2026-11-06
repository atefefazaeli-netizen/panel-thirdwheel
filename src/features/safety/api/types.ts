// DTOs for ADMIN_API.md › Safety. Metadata only: never text or matched words.

export type SafetyKind = 'crisis' | 'safety' | 'heat';
export type SafetyLevel = 'high' | 'medium' | 'low';
export type SafetySurface = 'third-ear' | 'third-ear-server' | 'quiz' | 'answer' | 'other';
export type SafetyFlagStatus = 'open' | 'reviewed' | 'escalated';

export const KINDS: readonly SafetyKind[] = ['crisis', 'safety', 'heat'];
export const LEVELS: readonly SafetyLevel[] = ['high', 'medium', 'low'];
export const STATUSES: readonly SafetyFlagStatus[] = ['open', 'reviewed', 'escalated'];
export const SURFACES: readonly SafetySurface[] = ['third-ear', 'third-ear-server', 'quiz', 'answer', 'other'];

export interface SafetyNote {
  id: string;
  by: string;
  byEmail: string | null;
  /** Staff display name (actor ids are `staff:<id>`). */
  byName?: string | null;
  text: string;
  at: string;
}

export interface SafetyFlag {
  id: string;
  userId: string;
  userEmail: string | null;
  kind: SafetyKind;
  level: SafetyLevel;
  surface: SafetySurface;
  helplineShown: boolean;
  count: number;
  status: SafetyFlagStatus;
  firstAt: string;
  lastAt: string;
  notes: SafetyNote[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  escalations: { by: string; at: string; note: string | null }[];
}

export interface SafetySummary {
  open: number;
  openHigh: number;
  openMedium: number;
  openLow: number;
  last24h: number;
  last7d: number;
}

export interface SafetyFlagQuery {
  status?: SafetyFlagStatus;
  level?: SafetyLevel;
  kind?: SafetyKind;
  /** Server-side filter (any surface, the server's own check included). */
  surface?: SafetySurface;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
