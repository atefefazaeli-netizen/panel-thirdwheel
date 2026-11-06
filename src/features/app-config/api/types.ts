// Remote Config (STAFF_API.md §6, reconciled with v2.0.0): a draft staff edit, published as
// numbered versions. Field names and the 8 feature keys are the app's (`GET app-config`, which
// the released app reads); the list of switches, their labels and descriptions come from the server.

export interface AppConfigBody {
  /** By feature key (the server's list: thirdEar, aiCreate, voiceInput, plusPurchases, venueBooking, league, calendarSync, photoUploads). */
  features: Record<string, boolean>;
  /** The message is kept while maintenance is off (the public read hides it until it is on). */
  maintenance: { enabled: boolean; message: string | null };
  /** `MAJOR.MINOR.PATCH` or null: below it the app shows "update required". */
  minAppVersion: string | null;
  /** `MAJOR.MINOR.PATCH` or null: below it the app suggests an update. Never below minAppVersion. */
  recommendedAppVersion: string | null;
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
  /** For a rollback: the version it brought back (0 = the defaults). */
  rolledBackFrom: number | null;
  /** `staff:<id>`, `system`, or `user:<id>` for a version saved by the v2.0.0 admin route. */
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
  /** null before anything was published (the app then gets the defaults as version 0). */
  published: ConfigVersion | null;
  features: FeatureInfo[];
  limits: { maintenanceMessageMax: number; noteMax: number };
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
}
