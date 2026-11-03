// Mock safety flags: metadata only (kind, level, surface, helpline shown, counts, dates, staff notes).
import type { SafetyFlag, SafetyKind, SafetyLevel, SafetySurface } from '@/features/safety/api/types';
import { daysAgo, oid } from '../utils';
import { uid } from './users';

export const LEVEL_OF: Record<SafetyKind, SafetyLevel> = { crisis: 'high', safety: 'medium', heat: 'low' };

export interface SafetyState {
  flags: SafetyFlag[];
}

export function seedSafety(emailOf: (userId: string) => string | null): SafetyState {
  const lead = uid('lead');
  const doctor = uid('doctor');
  const rows: [string, SafetyKind, SafetySurface, boolean, number, SafetyFlag['status'], number, number][] = [
    // user, kind, surface, helpline, count, status, firstAt (hours ago), lastAt (hours ago)
    ['priya', 'crisis', 'third-ear', true, 1, 'open', 2, 2],
    ['dev', 'safety', 'third-ear-server', false, 3, 'open', 5, 4],
    ['alex', 'heat', 'third-ear', false, 2, 'open', 9, 8.8],
    ['noor', 'crisis', 'quiz', true, 1, 'escalated', 30, 30],
    ['karim', 'heat', 'third-ear-server', false, 1, 'reviewed', 50, 50],
    ['sara', 'heat', 'third-ear', false, 1, 'reviewed', 96, 96],
    ['lena', 'safety', 'answer', true, 1, 'open', 20, 19],
    ['jonas', 'heat', 'third-ear', false, 4, 'open', 26, 25.7],
    ['ella', 'safety', 'third-ear', false, 1, 'reviewed', 120, 120],
    ['theo', 'crisis', 'third-ear-server', true, 2, 'reviewed', 150, 149.9],
    ['aisha', 'heat', 'other', false, 1, 'open', 60, 60],
    ['ben', 'heat', 'third-ear', false, 1, 'reviewed', 200, 200],
    ['sofia', 'safety', 'quiz', false, 1, 'open', 70, 70],
    ['luca', 'heat', 'third-ear-server', false, 2, 'reviewed', 300, 299],
    ['hana', 'crisis', 'third-ear', true, 1, 'reviewed', 400, 400],
    ['yusuf', 'heat', 'answer', false, 1, 'open', 3, 3],
    ['clara', 'safety', 'third-ear-server', false, 1, 'escalated', 80, 79],
    ['max', 'heat', 'third-ear', false, 1, 'reviewed', 500, 500],
    ['rania', 'heat', 'quiz', false, 1, 'open', 110, 110],
    ['mira', 'safety', 'third-ear', true, 2, 'open', 12, 11],
    ['felix', 'heat', 'third-ear-server', false, 1, 'reviewed', 600, 600],
    ['dana', 'crisis', 'answer', true, 1, 'reviewed', 700, 700],
  ];
  const hoursAgo = (h: number) => daysAgo(0, h);
  const flags = rows.map(([name, kind, surface, helplineShown, count, status, first, last], i): SafetyFlag => {
    const userId = uid(name);
    const id = oid(`flag:${i}`);
    const reviewed = status === 'reviewed';
    const escalated = status === 'escalated';
    const notes: SafetyFlag['notes'] = [];
    if (reviewed && i % 2 === 0)
      notes.push({
        id: oid(`note:${i}:a`),
        by: doctor,
        byEmail: 'dr.noor@thirdwheel.app',
        text: 'Helpline card was shown. No further action needed.',
        at: hoursAgo(last - 1),
      });
    if (escalated) {
      notes.push({
        id: oid(`note:${i}:b`),
        by: lead,
        byEmail: 'lead@thirdwheel.app',
        text: 'Repeated crisis checks this week. Escalated to the on-call clinician.',
        at: hoursAgo(last - 0.5),
      });
      notes.push({
        id: oid(`note:${i}:c`),
        by: doctor,
        byEmail: 'dr.noor@thirdwheel.app',
        text: 'Seen. Following the safeguarding runbook.',
        at: hoursAgo(last - 2),
      });
    }
    return {
      id,
      userId,
      userEmail: emailOf(userId),
      kind,
      level: LEVEL_OF[kind],
      surface,
      helplineShown,
      count,
      status,
      firstAt: hoursAgo(first),
      lastAt: hoursAgo(last),
      notes,
      reviewedBy: reviewed ? doctor : null,
      reviewedAt: reviewed ? hoursAgo(last - 1) : null,
      escalations: escalated ? [{ by: lead, at: hoursAgo(last - 0.5), note: 'Repeated checks this week.' }] : [],
    };
  });
  return { flags };
}
