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
import type { AiSummaryResponse } from '../lib/api';

export const aiSummaryKeys = {
  all:    ()                          => ['ai-summary'] as const,
  latest: (symbol: string, tf: string) => ['ai-summary', 'latest', symbol, tf] as const,
};

/**
 * useLatestAiSummary
 * GET /api/v1/ai-summary/latest
 * キャッシュ済みの最新サマリーを取得。
 * 404（まだ生成されていない）は null を返す（エラーとして扱わない）。
 */
export function useLatestAiSummary(
  symbol: string,
  timeframe: string,
  enabled = true,
) {
  return useQuery<AiSummaryResponse | null>({
    queryKey: aiSummaryKeys.latest(symbol, timeframe),
    queryFn:  async () => {
      try {
        return await aiSummaryApi.getLatest({ symbol, timeframe });
      } catch (error: unknown) {
        // 404 = まだ生成されていない → null を返す（エラーではない）
        const status = (
          error !== null &&
          typeof error === 'object' &&
          'response' in error
        )
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;

        if (status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled:  !!symbol && !!timeframe && enabled,
    retry:    false,
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