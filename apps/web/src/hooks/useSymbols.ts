/**
 * apps/web/src/hooks/useSymbols.ts
 *
 * 変更内容（round8-reaudit2）:
 *   [Task3] useCorrelation() を追加
 *           GET /api/v1/symbols/correlation（PRO | PRO_PLUS | ADMIN）
 *           権限が不足する場合は 403 が返り、isError が true になる
 *
 * 含まれるフック:
 *   useSymbols()      → GET /api/v1/symbols（システム定義 + ユーザー設定マージ一覧）
 *   useUpdateSymbol() → PATCH /api/v1/symbols/:symbol（ペア個別設定更新）
 *   useCorrelation()  → GET /api/v1/symbols/correlation（PRO 以上専用）
 *
 * 参照仕様: SPEC_v51_part10 §5「hooks ディレクトリ構成（確定）」
 *           SPEC_v51_part3 §6「Symbols API」§11「集計 API」
 *           SPEC_v51_part7 §2.4「通貨相関マトリクス（ProOnly）」
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { symbolsApi } from '../lib/api';
import type { UpdateSymbolSettingDto } from '../lib/api';
import type { SymbolWithSettingDto, CorrelationMatrix } from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const symbolKeys = {
  all:         () => ['symbols'] as const,
  list:        () => ['symbols', 'list'] as const,
  correlation: (period?: string) => ['symbols', 'correlation', period] as const,
};

/**
 * useSymbols
 * GET /api/v1/symbols
 * システム定義通貨ペア + ユーザー個別設定マージ済み一覧を取得する。
 * SymbolSetting が未作成のペアは既定値（enabled: true, defaultTimeframe: 'H4'）で補完済み。
 * 参照: SPEC_v51_part3 §6
 */
export function useSymbols() {
  return useQuery<SymbolWithSettingDto[]>({
    queryKey: symbolKeys.list(),
    queryFn:  () => symbolsApi.list(),
  });
}

/**
 * useUpdateSymbol
 * PATCH /api/v1/symbols/:symbol
 * 通貨ペア個別設定（enabled / defaultTimeframe / customThreshold）を更新する。
 * 参照: SPEC_v51_part3 §6
 */
export function useUpdateSymbol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ symbol, body }: { symbol: string; body: UpdateSymbolSettingDto }) =>
      symbolsApi.update(symbol, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: symbolKeys.all() }),
  });
}

/**
 * useCorrelation
 * GET /api/v1/symbols/correlation?period=30d|90d
 * 通貨ペア相関マトリクスを取得する。
 * 権限: PRO | PRO_PLUS | ADMIN（FREE / BASIC は 403）
 * Redis 1時間キャッシュ（v5.1 はスタブ値）
 * 参照: SPEC_v51_part3 §11 / SPEC_v51_part7 §2.4 / SPEC_v51_part10 §6.8
 */
export function useCorrelation(
  period: '30d' | '90d' = '30d',
  options?: { enabled?: boolean },
) {
  return useQuery<CorrelationMatrix>({
    queryKey: symbolKeys.correlation(period),
    queryFn:  () => symbolsApi.correlation({ period }),
    enabled:  options?.enabled ?? true,
    retry:    false, // 403 はリトライしない（権限不足）
    staleTime: 60 * 60 * 1000, // 1時間（Redis キャッシュと整合）
  });
}