/**
 * apps/web/src/hooks/useTrades.ts
 *
 * 変更理由:
 *   TanStack Query ラッパー（SPEC_v51_part5 §9.4）。
 *   旧実装はページコンポーネント内に直接フェッチロジックを書いていた。
 *   Hook に分離することで責務を分離し再利用を可能にする。
 *
 * 参照仕様: SPEC_v51_part5 §9.4「TanStack Query 設定」
 *           SPEC_v51_part10 hooks/useTrades.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradesApi, PaginationParams } from '../lib/api';
import type { CreateTradeInput, UpdateTradeInput, CloseTradeInput, CreateTradeReviewInput } from '@fxde/types';

// ── Query Keys ───────────────────────────────────────────────────────────
export const tradeKeys = {
  all:     ['trades'] as const,
  lists:   () => [...tradeKeys.all, 'list'] as const,
  list:    (params?: object) => [...tradeKeys.lists(), params] as const,
  detail:  (id: string) => [...tradeKeys.all, 'detail', id] as const,
  review:  (id: string) => [...tradeKeys.all, 'review', id] as const,
  equity:  (period: string) => [...tradeKeys.all, 'equity', period] as const,
  summary: () => [...tradeKeys.all, 'summary'] as const,
};

// ── useTrades: 一覧取得 ───────────────────────────────────────────────────
export function useTrades(
  params?: PaginationParams & { status?: string; symbol?: string; side?: string; include?: 'review' },
) {
  return useQuery({
    queryKey: tradeKeys.list(params),
    queryFn:  () => tradesApi.list(params),
  });
}

// ── useTrade: 詳細取得 ────────────────────────────────────────────────────
export function useTrade(id: string) {
  return useQuery({
    queryKey: tradeKeys.detail(id),
    queryFn:  () => tradesApi.get(id),
    enabled:  !!id,
  });
}

// ── useCreateTrade ────────────────────────────────────────────────────────
export function useCreateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTradeInput) => tradesApi.create(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tradeKeys.lists() }),
  });
}

// ── useUpdateTrade ────────────────────────────────────────────────────────
export function useUpdateTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTradeInput) => tradesApi.update(id, body),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: tradeKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: tradeKeys.lists() });
    },
  });
}

// ── useCloseTrade ─────────────────────────────────────────────────────────
export function useCloseTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CloseTradeInput) => tradesApi.close(id, body),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: tradeKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: tradeKeys.lists() });
    },
  });
}

// ── useCancelTrade ────────────────────────────────────────────────────────
export function useCancelTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tradeKeys.lists() }),
  });
}

// ── useTradeReview ────────────────────────────────────────────────────────
export function useTradeReview(tradeId: string) {
  return useQuery({
    queryKey: tradeKeys.review(tradeId),
    queryFn:  () => tradesApi.getReview(tradeId),
    enabled:  !!tradeId,
    retry:    false, // 404 は正常（振り返り未登録）
  });
}

export function useCreateTradeReview(tradeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTradeReviewInput) => tradesApi.createReview(tradeId, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: tradeKeys.review(tradeId) }),
  });
}

// ── useEquityCurve ────────────────────────────────────────────────────────
export function useEquityCurve(period: '1M' | '3M' | '1Y' = '1M') {
  return useQuery({
    queryKey: tradeKeys.equity(period),
    queryFn:  () => tradesApi.equityCurve(period),
  });
}

// ── useTradeSummary ───────────────────────────────────────────────────────
export function useTradeSummary() {
  return useQuery({
    queryKey: tradeKeys.summary(),
    queryFn:  () => tradesApi.summary(),
  });
}