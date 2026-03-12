/**
 * apps/web/src/hooks/usePredictionJob.ts
 *
 * 変更内容:
 *   backend（predictions.module.ts / controller / service / app.module.ts）実装済みのため
 *   enabled: false（STUB 無効化）を解除し、実 API 接続に変更。
 *
 * 含まれるフック:
 *   useCreatePredictionJob() → POST /api/v1/predictions/jobs
 *   usePredictionJob(jobId)  → GET  /api/v1/predictions/jobs/:id（5秒ポーリング）
 *   useLatestPrediction()    → GET  /api/v1/predictions/latest
 *
 * 権限: PRO | PRO_PLUS | ADMIN のみ（App.tsx ProGuard + backend RolesGuard）
 * 参照仕様: SPEC_v51_part3 §10「Predictions API」
 *           SPEC_v51_part10 §5「hooks ディレクトリ構成（確定）」
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { predictionsApi } from '../lib/api';
import type { CreatePredictionJobDto } from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const predictionKeys = {
  all:    ()                         => ['predictions'] as const,
  job:    (id: string)               => ['predictions', 'job', id] as const,
  latest: (symbol: string, tf?: string) => ['predictions', 'latest', symbol, tf] as const,
};

/**
 * useCreatePredictionJob
 * POST /api/v1/predictions/jobs → 202 Accepted
 * 権限: PRO | PRO_PLUS | ADMIN
 * 参照: SPEC_v51_part3 §10
 */
export function useCreatePredictionJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePredictionJobDto) => predictionsApi.createJob(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: predictionKeys.all() }),
  });
}

/**
 * usePredictionJob
 * GET /api/v1/predictions/jobs/:id
 * QUEUED / RUNNING 中は 5 秒ポーリング。SUCCEEDED / FAILED でポーリング停止。
 * 権限: PRO | PRO_PLUS | ADMIN
 * 参照: SPEC_v51_part3 §10
 */
export function usePredictionJob(jobId: string | null) {
  return useQuery({
    queryKey: predictionKeys.job(jobId ?? ''),
    queryFn:  () => predictionsApi.getJob(jobId!),
    enabled:  !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      if (status === 'QUEUED' || status === 'RUNNING') return 5_000;
      return false;
    },
  });
}

/**
 * useLatestPrediction
 * GET /api/v1/predictions/latest?symbol={symbol}&timeframe={tf}
 * symbol 必須 / timeframe 任意
 * 権限: PRO | PRO_PLUS | ADMIN
 * 参照: SPEC_v51_part3 §10
 */
export function useLatestPrediction(symbol: string, timeframe?: string) {
  return useQuery({
    queryKey: predictionKeys.latest(symbol, timeframe),
    queryFn:  () => predictionsApi.latest({ symbol, timeframe }),
    enabled:  !!symbol,
    retry:    false,
  });
}