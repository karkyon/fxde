// apps/web/src/hooks/useSignals.ts
//
// 変更内容:
//   [Task5] queries.ts から Signals 関連フック・ミューテーションを分離
//           SPEC_v51_part10 §5（フロントディレクトリ正本）に準拠
//
// 含まれるフック:
//   useSignals()       → GET /api/v1/signals（一覧・ページネーション）
//   useLatestSignals() → GET /api/v1/signals?limit=5（Dashboard 用）
//   useAckSignal()     → POST /api/v1/signals/:id/ack（既読化）
//
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { signalsApi } from '../lib/api';
import type { PaginationParams } from '../lib/api';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const signalKeys = {
  all:    ()               => ['signals'] as const,
  list:   (params?: object) => ['signals', 'list', params] as const,
  latest: ()               => ['signals', 'latest'] as const,
};

/**
 * useSignals
 * GET /api/v1/signals
 * Signals 一覧（ページネーション・フィルター）
 * 60秒ポーリング
 * 参照: SPEC_v51_part10 §6.5
 */
export function useSignals(
  params?: PaginationParams & { symbol?: string },
) {
  return useQuery({
    queryKey: signalKeys.list(params),
    queryFn:  () => signalsApi.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

/**
 * useLatestSignals
 * Dashboard 用に最新 5 件のシグナルを返す。
 * GET /api/v1/signals?limit=5 で代替（/signals/latest は SPEC_v51_part10 §6.5 に存在しない）
 */
export function useLatestSignals() {
  return useQuery({
    queryKey: signalKeys.latest(),
    queryFn:  () => signalsApi.list({ limit: 5 }),
    refetchInterval: 60_000,
  });
}

/**
 * useAckSignal
 * POST /api/v1/signals/:id/ack
 * 既読化ミューテーション。成功後にシグナル一覧キャッシュを無効化。
 * 参照: SPEC_v51_part10 §6.5
 */
export function useAckSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => signalsApi.ack(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: signalKeys.all() }),
  });
}