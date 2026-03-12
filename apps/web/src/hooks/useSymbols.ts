/**
 * apps/web/src/hooks/useSymbols.ts
 *
 * [Task C] SPEC_v51_part10 hooks ディレクトリ正本構成に従い新設。
 *          symbolsApi.list() / symbolsApi.update() を包む専用 hook。
 *          既存 queries.ts 側の useSymbols を置換する。
 *
 * 参照仕様: SPEC_v51_part10 §5「hooks ディレクトリ構成（確定）」
 *           SPEC_v51_part3 §6「Symbols API」
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { symbolsApi } from '../lib/api';
import type { UpdateSymbolSettingDto } from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const symbolKeys = {
  all:  () => ['symbols'] as const,
  list: () => ['symbols', 'list'] as const,
};

/**
 * useSymbols
 * GET /api/v1/symbols
 * 有効化された通貨ペア設定一覧を取得する。
 * 参照: SPEC_v51_part3 §6
 */
export function useSymbols() {
  return useQuery({
    queryKey: symbolKeys.list(),
    queryFn:  () => symbolsApi.list(),
  });
}

/**
 * useUpdateSymbol
 * PATCH /api/v1/symbols/:symbol
 * 通貨ペア設定を更新する。
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