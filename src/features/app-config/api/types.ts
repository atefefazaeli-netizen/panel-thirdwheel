// Remote Config (STAFF_API.md §6, as built on feature/support-remote-config). Only public fields:
// the app reads them from `GET app-config`.

export interface AppConfigBody {
  /** By feature key (the server's list: thirdEar, spicy, calendar today). */
  features: Record<string, boolean>;
  maintenance: { enabled: boolean; message: string | null };
  /** `x.y.z` or null: below it the app shows "update required". */
  minVersion: string | null;
  /** `x.y.z` or null: below it the app suggests an update. */
  recommendedVersion: string | null;
}

export interface FeatureInfo {
  key: string;
  label: string;
  description: string;
}

/** One published version (`kind: 'seed'` is the default the migration stores as version 1). */
export interface ConfigVersion {
  version: number;
  config: AppConfigBody;
  kind: 'seed' | 'publish' | 'rollback';
  note: string | null;
  /** For a rollback: the version it brought back. */
  rolledBackFrom: number | null;
  /** `staff:<id>` or `system`. */
  publishedBy: string;
  publishedByName: string | null;
  publishedAt: string;
}

/**
 * `GET admin/app-config`, and the answer of every write. `draft.version` is the concurrency token
 * (`baseVersion`): every draft save, publish and rollback bumps it (0 before anyone saved a
 * draft). `draft.changed` lists the fields where the draft differs from what is live.
 */
export interface AppConfigAdmin {
  draft: { config: AppConfigBody; version: number; changed: string[] };
  /** null before anything was published (the app then gets the default as version 0). */
  published: ConfigVersion | null;
  features: FeatureInfo[];
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
}
