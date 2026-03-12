// apps/web/src/hooks/useTrades.ts
//
// 変更内容（round6）:
//   [Task2] useEquityCurve / useTradeSummary を enabled: false で一時無効化
//           backend trades.controller.ts に該当 route（equity-curve / stats/summary）が不在のため
//           backend 実装後に enabled: false を削除すること
//
// 含まれるフック:
//   useTrades()        → GET /api/v1/trades（一覧）
//   useTrade(id)       → GET /api/v1/trades/:id（詳細）
//   useTradeReview(id) → GET /api/v1/trades/:id/review
//   useCreateTrade()   → POST /api/v1/trades
//   useUpdateTrade(id) → PATCH /api/v1/trades/:id
//   useCloseTrade(id)  → POST /api/v1/trades/:id/close
//   useDeleteTrade()   → DELETE /api/v1/trades/:id（論理削除）
//   useCreateReview(id)→ POST /api/v1/trades/:id/review
//   useEquityCurve()   → GET /api/v1/trades/equity-curve ⚠️ backend 未実装・無効化中
//   useTradeSummary()  → GET /api/v1/trades/stats/summary ⚠️ backend 未実装・無効化中
//
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { tradesApi } from '../lib/api';
import type { PaginationParams } from '../lib/api';
import type {
  CloseTradeInput,
  CreateTradeReviewInput,
  CreateTradeInput,
  UpdateTradeInput,
} from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const tradeKeys = {
  all:    ()               => ['trades'] as const,
  list:   (params?: object) => ['trades', 'list', params] as const,
  detail: (id: string)     => ['trades', 'detail', id] as const,
  review: (id: string)     => ['trades', 'review', id] as const,
};

/**
 * useTrades
 * GET /api/v1/trades（一覧・ページネーション・フィルター）
 * 参照: SPEC_v51_part10 §6.4
 */
export function useTrades(
  params?: PaginationParams & { status?: string; symbol?: string },
) {
  return useQuery({
    queryKey: tradeKeys.list(params),
    queryFn:  () => tradesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * useTrade
 * GET /api/v1/trades/:id（詳細）
 */
export function useTrade(id: string) {
  return useQuery({
    queryKey: tradeKeys.detail(id),
    queryFn:  () => tradesApi.get(id),
    enabled:  !!id,
  });
}

/**
 * useTradeReview
 * GET /api/v1/trades/:id/review
 */
export function useTradeReview(tradeId: string) {
  return useQuery({
    queryKey: tradeKeys.review(tradeId),
    queryFn:  () => tradesApi.getReview(tradeId),
    enabled:  !!tradeId,
    retry:    false,
  });
}

/**
 * useCreateTrade
 * POST /api/v1/trades
 */
export function useCreateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTradeInput) => tradesApi.create(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tradeKeys.all() }),
  });
}

/**
 * useUpdateTrade
 * PATCH /api/v1/trades/:id
 */
export function useUpdateTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTradeInput) => tradesApi.update(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: tradeKeys.all() });
      qc.invalidateQueries({ queryKey: tradeKeys.detail(id) });
    },
  });
}

/**
 * useCloseTrade
 * POST /api/v1/trades/:id/close
 */
export function useCloseTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CloseTradeInput) => tradesApi.close(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: tradeKeys.all() });
      qc.invalidateQueries({ queryKey: tradeKeys.detail(id) });
    },
  });
}

/**
 * useDeleteTrade
 * DELETE /api/v1/trades/:id → 論理削除（status=CANCELED）
 */
export function useDeleteTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tradeKeys.all() }),
  });
}

/**
 * useCreateReview
 * POST /api/v1/trades/:id/review
 */
export function useCreateReview(tradeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTradeReviewInput) =>
      tradesApi.createReview(tradeId, body),
    onSuccess:  () =>
      qc.invalidateQueries({ queryKey: tradeKeys.review(tradeId) }),
  });
}

/**
 * useEquityCurve
 * GET /api/v1/trades/equity-curve
 * 参照: SPEC_v51_part10 §6.8
 *
 * ⚠️ backend 未実装（trades.controller.ts に route なし）
 *    enabled: false で無効化中。backend 実装後に enabled 条件を復元すること。
 */
export function useEquityCurve(period: '1M' | '3M' | '1Y' = '1M') {
  return useQuery({
    queryKey: ['trades', 'equity-curve', period] as const,
    // TODO(backend): GET /trades/equity-curve 実装後に enabled を削除
    queryFn:  () => Promise.resolve(null) as Promise<null>,
    enabled:  false,
  });
}

/**
 * useTradeSummary
 * GET /api/v1/trades/stats/summary
 * 参照: SPEC_v51_part10 §6.8
 *
 * ⚠️ backend 未実装（trades.controller.ts に route なし）
 *    enabled: false で無効化中。backend 実装後に enabled 条件を復元すること。
 */
export function useTradeSummary() {
  return useQuery({
    queryKey: ['trades', 'stats', 'summary'] as const,
    // TODO(backend): GET /trades/stats/summary 実装後に enabled を削除
    queryFn:  () => Promise.resolve(null) as Promise<null>,
    enabled:  false,
  });
}