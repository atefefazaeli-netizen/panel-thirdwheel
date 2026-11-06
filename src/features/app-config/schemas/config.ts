import { z } from 'zod';
import type { AppConfigBody } from '../api/types';

export const MAINTENANCE_MAX = 280;
/** MAJOR.MINOR.PATCH, numbers only, no leading zeros, up to 99999 each (libs/common isAppVersion). */
export const VERSION_RE = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** -1, 0 or 1 for two `x.y.z` versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

const optionalVersion = z
  .string()
  .trim()
  .refine((v) => v === '' || VERSION_RE.test(v), 'Use the form x.y.z, for example 1.4.0 (no leading zeros).');

/** The draft editor's form (empty strings for "no limit"). */
export const configFormSchema = z
  .object({
    features: z.record(z.string(), z.boolean()),
    maintenanceEnabled: z.boolean(),
    maintenanceMessage: z
      .string()
      .max(MAINTENANCE_MAX, `At most ${MAINTENANCE_MAX} characters.`)
      .refine((v) => !CONTROL.test(v.trim()), 'Remove the control characters.'),
    minAppVersion: optionalVersion,
    recommendedAppVersion: optionalVersion,
  })
  .superRefine((v, ctx) => {
    if (v.maintenanceEnabled && !v.maintenanceMessage.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['maintenanceMessage'],
        message: 'Write the message people see during maintenance.',
      });
    if (
      VERSION_RE.test(v.minAppVersion) &&
      VERSION_RE.test(v.recommendedAppVersion) &&
      compareVersions(v.recommendedAppVersion, v.minAppVersion) < 0
    )
      ctx.addIssue({
        code: 'custom',
        path: ['recommendedAppVersion'],
        message: 'The recommended version must be the same as or newer than the minimum version.',
      });
  });
export type ConfigFormValues = z.infer<typeof configFormSchema>;

export function toForm(c: AppConfigBody, featureKeys: string[]): ConfigFormValues {
  const features: Record<string, boolean> = {};
  for (const k of featureKeys) features[k] = c.features[k] ?? true;
  return {
    features,
    maintenanceEnabled: c.maintenance.enabled,
    maintenanceMessage: c.maintenance.message ?? '',
    minAppVersion: c.minAppVersion ?? '',
    recommendedAppVersion: c.recommendedAppVersion ?? '',
  };
}

export function fromForm(v: ConfigFormValues): AppConfigBody {
  const msg = v.maintenanceMessage.trim();
  return {
    features: { ...v.features },
    maintenance: { enabled: v.maintenanceEnabled, message: msg || null },
    minAppVersion: v.minAppVersion.trim() || null,
    recommendedAppVersion: v.recommendedAppVersion.trim() || null,
  };
}

export const publishSchema = z.object({ note: z.string().trim().max(300, 'At most 300 characters.') });
export type PublishValues = z.infer<typeof publishSchema>;
