// Remote Config (STAFF_API.md §6). Only public fields: the app reads them from `GET app-config`.

export interface AppConfigBody {
  features: Record<string, boolean>;
  maintenance: { enabled: boolean; message: string | null };
  /** `x.y.z` or null: below it the app shows "update required". */
  minVersion: string | null;
  /** `x.y.z` or null: below it the app suggests an update. */
  recommendedVersion: string | null;
}

export interface PublishedConfig extends AppConfigBody {
  version: number;
  publishedAt: string;
}

export interface FeatureInfo {
  key: string;
  label: string;
  description: string;
}

/** `GET admin/app-config`. */
export interface AppConfigAdmin {
  draft: AppConfigBody;
  published: PublishedConfig;
  features: FeatureInfo[];
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName?: string | null;
}

/** One row of `GET admin/app-config/versions`. */
export interface ConfigVersion {
  version: number;
  config: AppConfigBody;
  publishedAt: string;
  publishedBy: string | null;
  publishedByName?: string | null;
  note: string | null;
  /** Set when this version republished an earlier one. */
  rolledBackFrom?: number | null;
}
