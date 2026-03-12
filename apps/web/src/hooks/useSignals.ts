/**
 * apps/web/src/hooks/useSignals.ts
 *
 * 変更理由:
 *   旧実装 useLatestSignals() は Signal[] を期待していたが、
 *   backend は単一 SignalResponse を返す（監査レポート A-2 修正）。
 *
 * 参照仕様: SPEC_v51_part10 hooks/useSignals.ts
 */

import { useQuery } from '@tanstack/react-query';
import { signalsApi } from '../lib/api';

export const signalKeys = {
  all:    ['signals'] as const,
  latest: (params?: object) => [...signalKeys.all, 'latest', params] as const,
  list:   (params?: object) => [...signalKeys.all, 'list', params] as const,
};

/** /signals/latest → 単一 SignalResponse */
export function useLatestSignal(params?: { symbol?: string }) {
  return useQuery({
    queryKey: signalKeys.latest(params),
    queryFn:  () => signalsApi.latest(params),
    retry:    false,
    refetchInterval: 30_000, // 30 秒ポーリング
  });
}

/** /signals 一覧 */
export function useSignals(params?: { page?: number; limit?: number; symbol?: string }) {
  return useQuery({
    queryKey: signalKeys.list(params),
    queryFn:  () => signalsApi.list(params),
  });
}