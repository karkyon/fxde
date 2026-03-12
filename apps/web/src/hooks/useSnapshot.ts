// apps/web/src/hooks/useSnapshot.ts
//
// 変更内容:
//   [Task5] queries.ts から Snapshot 関連フックを分離
//           SPEC_v51_part10 §5（フロントディレクトリ正本）に準拠
//
// 含まれるフック:
//   useLatestSnapshot(params?) → GET /api/v1/snapshots/latest（300秒ポーリング）
//   useSnapshots(params?)      → GET /api/v1/snapshots（一覧）
//
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { snapshotsApi } from '../lib/api';
import type { PaginationParams } from '../lib/api';

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
 * 参照: SPEC_v51_part10 §6.3
 */
export function useLatestSnapshot(params?: { symbol?: string; timeframe?: string }) {
  return useQuery({
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