/**
 * apps/web/src/hooks/useSymbols.ts
 *
 * 変更内容（round8-reaudit）:
 *   [P2] stale コメント（"⚠️ backend 未実装", "TODO(backend)" 等）を除去
 *   [P2] symbolsApi.list() の返却型が SymbolWithSettingDto[] になったため
 *        useSymbols() の data 型を明示
 *
 * 含まれるフック:
 *   useSymbols()      → GET /api/v1/symbols（システム定義 + ユーザー設定マージ一覧）
 *   useUpdateSymbol() → PATCH /api/v1/symbols/:symbol（ペア個別設定更新）
 *
 * 参照仕様: SPEC_v51_part10 §5「hooks ディレクトリ構成（確定）」
 *           SPEC_v51_part3 §6「Symbols API」
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { symbolsApi } from '../lib/api';
import type { UpdateSymbolSettingDto } from '../lib/api';
import type { SymbolWithSettingDto } from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const symbolKeys = {
  all:  () => ['symbols'] as const,
  list: () => ['symbols', 'list'] as const,
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