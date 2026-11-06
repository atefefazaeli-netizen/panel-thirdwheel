import { z } from 'zod';
import type { AppConfigBody } from '../api/types';

export const MAINTENANCE_MAX = 280;
/** x.y.z, numbers only, no leading zeros, up to 9999 each (the backend's APP_VERSION_RE). */
export const VERSION_RE = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

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
    maintenanceMessage: z.string().max(MAINTENANCE_MAX, `At most ${MAINTENANCE_MAX} characters.`),
    minVersion: optionalVersion,
    recommendedVersion: optionalVersion,
  })
  .superRefine((v, ctx) => {
    if (v.maintenanceEnabled && !v.maintenanceMessage.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['maintenanceMessage'],
        message: 'Write the message people see during maintenance.',
      });
    if (
      VERSION_RE.test(v.minVersion) &&
      VERSION_RE.test(v.recommendedVersion) &&
      compareVersions(v.recommendedVersion, v.minVersion) < 0
    )
      ctx.addIssue({
        code: 'custom',
        path: ['recommendedVersion'],
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
    minVersion: c.minVersion ?? '',
    recommendedVersion: c.recommendedVersion ?? '',
  };
}

export function fromForm(v: ConfigFormValues): AppConfigBody {
  const msg = v.maintenanceMessage.trim();
  return {
    features: { ...v.features },
    maintenance: { enabled: v.maintenanceEnabled, message: msg || null },
    minVersion: v.minVersion.trim() || null,
    recommendedVersion: v.recommendedVersion.trim() || null,
  };
}

export const publishSchema = z.object({ note: z.string().trim().max(300, 'At most 300 characters.') });
export type PublishValues = z.infer<typeof publishSchema>;
