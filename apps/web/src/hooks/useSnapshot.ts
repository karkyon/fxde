/**
 * apps/web/src/hooks/useSnapshot.ts
 *
 * 参照仕様: SPEC_v51_part10 hooks/useSnapshot.ts
 */

import { useQuery } from '@tanstack/react-query';
import { snapshotsApi } from '../lib/api';

export const snapshotKeys = {
  all:    ['snapshots'] as const,
  latest: (params?: object) => [...snapshotKeys.all, 'latest', params] as const,
  list:   (params?: object) => [...snapshotKeys.all, 'list', params] as const,
};

export function useLatestSnapshot(params?: { symbol?: string; timeframe?: string }) {
  return useQuery({
    queryKey: snapshotKeys.latest(params),
    queryFn:  () => snapshotsApi.latest(params),
    retry:    false, // 404 は正常（スナップショット未作成）
  });
}

export function useSnapshots(params?: { page?: number; limit?: number; symbol?: string }) {
  return useQuery({
    queryKey: snapshotKeys.list(params),
    queryFn:  () => snapshotsApi.list(params),
  });
}