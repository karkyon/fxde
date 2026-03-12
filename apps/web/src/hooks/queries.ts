/**
 * apps/web/src/hooks/queries.ts
 *
 * 修正内容:
 *   - CloseTradeRequest → CloseTradeInput
 *   - CreateReviewRequest → CreateTradeReviewInput
 *   - CreateTradeRequest → CreateTradeInput
 *   - UpdateSettingsRequest → UpdateSettingsDto
 *   - UpdateTradeRequest → UpdateTradeInput
 *   - PaginationParams を ../lib/api から import
 *   - tradesApi.delete → tradesApi.cancel
 *   - queryFn: signalsApi.latest → () => signalsApi.list({ limit: 5 })（Dashboard で配列表示）
 *   - queryFn: snapshotsApi.latest → () => snapshotsApi.latest()（コンテキストオブジェクト渡し問題を解消）
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  tradesApi,
  signalsApi,
  snapshotsApi,
  settingsApi,
  userApi,
  symbolsApi,
} from '../lib/api';
import type { PaginationParams } from '../lib/api';
import type {
  CloseTradeInput,
  CreateTradeReviewInput,
  CreateTradeInput,
  UpdateSettingsDto,
  UpdateTradeInput,
} from '@fxde/types';

// ─── Query Keys ──────────────────────────────────────────────────────────────
export const QK = {
  trades:        (params?: object) => ['trades', params] as const,
  trade:         (id: string)      => ['trade', id] as const,
  tradeReview:   (id: string)      => ['trade-review', id] as const,
  signals:       (params?: object) => ['signals', params] as const,
  signalsLatest: ()                => ['signals-latest'] as const,
  snapshot:      ()                => ['snapshot-latest'] as const,
  snapshots:     (params?: object) => ['snapshots', params] as const,
  settings:      ()                => ['settings'] as const,
  me:            ()                => ['me'] as const,
  symbols:       ()                => ['symbols'] as const,
};

// ─── User ────────────────────────────────────────────────────────────────────
export function useMe() {
  return useQuery({ queryKey: QK.me(), queryFn: () => userApi.me() });
}

// ─── Symbols ─────────────────────────────────────────────────────────────────
export function useSymbols() {
  return useQuery({ queryKey: QK.symbols(), queryFn: () => symbolsApi.list() });
}

// ─── Trades ──────────────────────────────────────────────────────────────────
export function useTrades(
  params?: PaginationParams & { status?: string; symbol?: string }
) {
  return useQuery({
    queryKey: QK.trades(params),
    queryFn: () => tradesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useTrade(id: string) {
  return useQuery({
    queryKey: QK.trade(id),
    queryFn: () => tradesApi.get(id),
    enabled: !!id,
  });
}

export function useTradeReview(tradeId: string) {
  return useQuery({
    queryKey: QK.tradeReview(tradeId),
    queryFn: () => tradesApi.getReview(tradeId),
    enabled: !!tradeId,
    retry: false,
  });
}

export function useCreateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTradeInput) => tradesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });
}

export function useUpdateTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTradeInput) => tradesApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: QK.trade(id) });
    },
  });
}

export function useCloseTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CloseTradeInput) => tradesApi.close(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: QK.trade(id) });
    },
  });
}

/** useDeleteTrade: 論理削除（status=CANCELED）。tradesApi.cancel を呼ぶ */
export function useDeleteTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });
}

export function useCreateReview(tradeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTradeReviewInput) =>
      tradesApi.createReview(tradeId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: QK.tradeReview(tradeId) }),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: QK.settings(),
    queryFn: () => settingsApi.get(),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsDto) => settingsApi.update(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.settings() }),
  });
}

// ─── Signals ─────────────────────────────────────────────────────────────────
export function useSignals(
  params?: PaginationParams & { symbol?: string }
) {
  return useQuery({
    queryKey: QK.signals(params),
    queryFn: () => signalsApi.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

/**
 * useLatestSignals: Dashboard 用に最新 5 件のシグナルを返す。
 * ⚠️ /signals/latest は単一返却のため list({ limit: 5 }) を使用する。
 */
export function useLatestSignals() {
  return useQuery({
    queryKey: QK.signalsLatest(),
    queryFn: () => signalsApi.list({ limit: 5 }),
    refetchInterval: 60_000,
  });
}

// ─── Snapshots ───────────────────────────────────────────────────────────────
export function useLatestSnapshot() {
  return useQuery({
    queryKey: QK.snapshot(),
    queryFn: () => snapshotsApi.latest(),
    refetchInterval: 300_000,
    retry: false,
  });
}

export function useSnapshots(params?: PaginationParams & { symbol?: string; timeframe?: string }) {
  return useQuery({
    queryKey: QK.snapshots(params),
    queryFn: () => snapshotsApi.list(params),
    placeholderData: keepPreviousData,
  });
}