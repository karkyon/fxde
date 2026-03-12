/**
 * apps/web/src/hooks/usePredictionJob.ts
 *
 * [Task D] SPEC_v51_part10 hooks ディレクトリ正本構成に従い新設。
 *
 * ⚠️ STUB: backend 未実装
 *
 * TODO: apps/api/src/modules/predictions/ モジュールが存在しない。
 *       app.module.ts に PredictionsModule が import されていない。
 *       backend 実装完了まで全フックは enabled: false で無効化している。
 *       backend 実装完了後に enabled 制御を解除すること。
 *
 * backend 実装が必要なもの（SPEC_v51_part3 §10）:
 *   POST /api/v1/predictions/jobs
 *   GET  /api/v1/predictions/jobs/:id
 *   GET  /api/v1/predictions/latest
 *
 * 参照仕様: SPEC_v51_part3 §10「Predictions API」
 *           SPEC_v51_part10 §5「hooks ディレクトリ構成（確定）」
 *           SPEC_v51_part4 §5「prediction-dispatch スタブ」
 *           SPEC_v51_part8 §9「Prediction Service v5.1 スタブのみ実装」
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { predictionsApi } from '../lib/api';
import type { CreatePredictionJobDto } from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const predictionKeys = {
  all:    ()           => ['predictions'] as const,
  job:    (id: string) => ['predictions', 'job', id] as const,
  latest: ()           => ['predictions', 'latest'] as const,
};

/**
 * useCreatePredictionJob
 * POST /api/v1/predictions/jobs
 *
 * TODO: backend 実装完了まで mutate を呼ばないこと（stub エラーが返る）。
 * 権限: PRO | PRO_PLUS | ADMIN
 * 参照: SPEC_v51_part3 §10
 */
export function useCreatePredictionJob() {
  const qc = useQueryClient();
  return useMutation({
    // TODO: backend 実装完了後に stub エラーが解消される
    mutationFn: (body: CreatePredictionJobDto) => predictionsApi.createJob(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: predictionKeys.all() }),
  });
}

/**
 * usePredictionJob
 * GET /api/v1/predictions/jobs/:id
 *
 * QUEUED / RUNNING 中は 5 秒ポーリング。SUCCEEDED / FAILED でポーリング停止。
 *
 * TODO: backend 実装完了まで enabled: false で無効化。
 *       backend 実装後は enabled: !!jobId に変更すること。
 * 権限: PRO | PRO_PLUS | ADMIN
 * 参照: SPEC_v51_part3 §10
 */
export function usePredictionJob(jobId: string | null) {
  return useQuery({
    queryKey: predictionKeys.job(jobId ?? ''),
    queryFn:  () => predictionsApi.getJob(jobId!),
    // TODO: backend 実装完了後に `enabled: !!jobId` へ変更すること
    enabled:  false, // STUB: backend 未実装のため無効化
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      if (status === 'QUEUED' || status === 'RUNNING') return 5_000;
      return false;
    },
  });
}

/**
 * useLatestPrediction
 * GET /api/v1/predictions/latest
 *
 * TODO: backend 実装完了まで enabled: false で無効化。
 *       backend 実装後は `enabled: true` に変更すること。
 * 権限: PRO | PRO_PLUS | ADMIN
 * 参照: SPEC_v51_part3 §10
 */
export function useLatestPrediction() {
  return useQuery({
    queryKey: predictionKeys.latest(),
    queryFn:  () => predictionsApi.latest(),
    // TODO: backend 実装完了後に enabled: true へ変更すること
    enabled:  false, // STUB: backend 未実装のため無効化
    retry:    false,
  });
}