import type { AppConfigBody, FeatureInfo } from '../api/types';

export interface ConfigChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

const onOff = (v: boolean | undefined) => (v === false ? 'Off' : 'On');
const limit = (v: string | null) => v ?? 'No limit';

/** What publishing `next` would change compared with `base`, in words. */
export function configDiff(base: AppConfigBody, next: AppConfigBody, features: FeatureInfo[]): ConfigChange[] {
  const out: ConfigChange[] = [];
  const keys = [
    ...new Set([...features.map((f) => f.key), ...Object.keys(base.features), ...Object.keys(next.features)]),
  ];
  for (const k of keys) {
    const a = base.features[k] ?? true;
    const b = next.features[k] ?? true;
    if (a !== b)
      out.push({
        field: `features.${k}`,
        label: features.find((f) => f.key === k)?.label ?? k,
        from: onOff(a),
        to: onOff(b),
      });
  }
  if (base.maintenance.enabled !== next.maintenance.enabled)
    out.push({
      field: 'maintenance.enabled',
      label: 'Maintenance screen',
      from: onOff(base.maintenance.enabled),
      to: onOff(next.maintenance.enabled),
    });
  if ((base.maintenance.message ?? '') !== (next.maintenance.message ?? ''))
    out.push({
      field: 'maintenance.message',
      label: 'Maintenance message',
      from: base.maintenance.message ?? 'None',
      to: next.maintenance.message ?? 'None',
    });
  if (base.minAppVersion !== next.minAppVersion)
    out.push({
      field: 'minAppVersion',
      label: 'Minimum version',
      from: limit(base.minAppVersion),
      to: limit(next.minAppVersion),
    });
  if (base.recommendedAppVersion !== next.recommendedAppVersion)
    out.push({
      field: 'recommendedAppVersion',
      label: 'Recommended version',
      from: limit(base.recommendedAppVersion),
      to: limit(next.recommendedAppVersion),
    });
  return out;
}
