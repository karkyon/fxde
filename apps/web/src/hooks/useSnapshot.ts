// apps/web/src/hooks/useSnapshot.ts
//
// 変更内容（round8-reaudit2）:
//   [Task2] useLatestSnapshot() の queryFn 返却型を SnapshotResponse | null に整合
//           backend getLatest() はスナップショット未存在時に null を返す仕様のため
//           snapshotsApi.latest() の返却型が Promise<SnapshotResponse | null> になったことに追従
//
// 含まれるフック:
//   useLatestSnapshot(params?) → GET /api/v1/snapshots/latest（300秒ポーリング）
//   useSnapshots(params?)      → GET /api/v1/snapshots（一覧）
//
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { snapshotsApi } from '../lib/api';
import type { PaginationParams } from '../lib/api';
import type { SnapshotResponse } from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const snapshotKeys = {
  all:    ()                => ['snapshots'] as const,
  latest: (params?: object) => ['snapshots', 'latest', params] as const,
  list:   (params?: object) => ['snapshots', 'list', params] as const,
};

/**
 * useLatestSnapshot
 * GET /api/v1/snapshots/latest
 * symbol / timeframe でフィルタ可能。300秒ポーリング。
 * スナップショット未存在時は data が null になる（backend 仕様）。
 * 参照: SPEC_v51_part10 §6.3 / SPEC_v51_part3 §7
 */
export function useLatestSnapshot(params?: { symbol?: string; timeframe?: string }) {
  return useQuery<SnapshotResponse | null>({
    queryKey: snapshotKeys.latest(params),
    queryFn:  () => snapshotsApi.latest(params),
    refetchInterval: 300_000,
    retry:    false,
  });
}

/**
 * useSnapshots
 * GET /api/v1/snapshots
 * スナップショット履歴一覧（ページネーション・フィルター）
 * 参照: SPEC_v51_part10 §6.3
 */
export function useSnapshots(
  params?: PaginationParams & { symbol?: string; timeframe?: string },
) {
  return useQuery({
    queryKey: snapshotKeys.list(params),
    queryFn:  () => snapshotsApi.list(params),
    placeholderData: keepPreviousData,
  });
}