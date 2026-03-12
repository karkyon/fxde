/**
 * apps/web/src/hooks/useAiSummary.ts
 *
 * 参照仕様: SPEC_v51_part10 §6.7「AI 要約系エンドポイント」
 *
 * フック:
 *   useLatestAiSummary() — GET /api/v1/ai-summary/latest
 *   useGenerateAiSummary() — POST /api/v1/ai-summary（ミューテーション）
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiSummaryApi } from '../lib/api';

export const aiSummaryKeys = {
  all:    ()                          => ['ai-summary'] as const,
  latest: (symbol: string, tf: string) => ['ai-summary', 'latest', symbol, tf] as const,
};

/**
 * useLatestAiSummary
 * GET /api/v1/ai-summary/latest
 * キャッシュ済みの最新サマリーを取得。404 はエラーなし（初回未生成）。
 */
export function useLatestAiSummary(symbol: string, timeframe: string, enabled = true) {
  return useQuery({
    queryKey: aiSummaryKeys.latest(symbol, timeframe),
    queryFn:  () => aiSummaryApi.latest({ symbol, timeframe }),
    enabled:  !!symbol && !!timeframe && enabled,
    retry:    false,   // 404 はリトライしない
  });
}

/**
 * useGenerateAiSummary
 * POST /api/v1/ai-summary
 * 生成後に latest キャッシュを無効化。
 */
export function useGenerateAiSummary(symbol: string, timeframe: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId?: string) =>
      aiSummaryApi.generate({ symbol, timeframe, snapshotId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiSummaryKeys.latest(symbol, timeframe) });
    },
  });
}