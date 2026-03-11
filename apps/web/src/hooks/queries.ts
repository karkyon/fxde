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
import type {
  CloseTradeRequest,
  CreateReviewRequest,
  CreateTradeRequest,
  PaginationParams,
  UpdateSettingsRequest,
  UpdateTradeRequest,
} from '../types';

// ─── Query Keys ──────────────────────────────────────────────────────────────
export const QK = {
  trades: (params?: object) => ['trades', params] as const,
  trade: (id: string) => ['trade', id] as const,
  tradeReview: (id: string) => ['trade-review', id] as const,
  signals: (params?: object) => ['signals', params] as const,
  signalsLatest: () => ['signals-latest'] as const,
  snapshot: () => ['snapshot-latest'] as const,
  snapshots: (params?: object) => ['snapshots', params] as const,
  settings: () => ['settings'] as const,
  me: () => ['me'] as const,
  symbols: () => ['symbols'] as const,
};

// ─── User ────────────────────────────────────────────────────────────────────
export function useMe() {
  return useQuery({ queryKey: QK.me(), queryFn: userApi.me });
}

// ─── Symbols ─────────────────────────────────────────────────────────────────
export function useSymbols() {
  return useQuery({ queryKey: QK.symbols(), queryFn: symbolsApi.list });
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
    retry: false, // レビュー未作成の404は静かに処理
  });
}

export function useCreateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTradeRequest) => tradesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });
}

export function useUpdateTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTradeRequest) => tradesApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: QK.trade(id) });
    },
  });
}

export function useCloseTrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CloseTradeRequest) => tradesApi.close(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: QK.trade(id) });
    },
  });
}

export function useDeleteTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tradesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });
}

export function useCreateReview(tradeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReviewRequest) =>
      tradesApi.createReview(tradeId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: QK.tradeReview(tradeId) }),
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

export function useLatestSignals() {
  return useQuery({
    queryKey: QK.signalsLatest(),
    queryFn: signalsApi.latest,
    refetchInterval: 60_000,
  });
}

// ─── Snapshots ───────────────────────────────────────────────────────────────
export function useLatestSnapshot() {
  return useQuery({
    queryKey: QK.snapshot(),
    queryFn: snapshotsApi.latest,
    refetchInterval: 300_000,
  });
}

export function useSnapshots(params?: PaginationParams) {
  return useQuery({
    queryKey: QK.snapshots(params),
    queryFn: () => snapshotsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────
export function useSettings() {
  return useQuery({ queryKey: QK.settings(), queryFn: settingsApi.get });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsRequest) => settingsApi.update(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.settings() }),
  });
}