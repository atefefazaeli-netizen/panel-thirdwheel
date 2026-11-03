import { StatusBadge } from '@/components/shared';
import type { ContentListState } from '../api/types';
import { STATE_LABEL } from '../lib/labels';

export function ContentStateBadge({ state, version }: { state: ContentListState; version?: number }) {
  const label = STATE_LABEL[state] + (state === 'live' && version ? ` v${version}` : '');
  return <StatusBadge status={state} label={label} />;
}
