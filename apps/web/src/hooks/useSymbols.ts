/**
 * apps/web/src/hooks/useSymbols.ts
 *
 * 変更内容（round6）:
 *   [Task2] useUpdateSymbol → symbolsApi.update が backend 未実装のためコメントアウト
 *           symbols.controller.ts には GET /symbols のみ実装
 *           仕様上 PATCH /symbols/:symbol は必要。backend 実装後に復元すること。
 *         （round8）:
 *   [Task2] useUpdateSymbol → symbolsApi.update を復元
 *           backend PATCH /symbols/:symbol 実装完了（symbols.controller.ts に追加済み）
 *
 * 含まれるフック:
 *   useSymbols()      → GET /api/v1/symbols
 *   useUpdateSymbol() → PATCH /api/v1/symbols/:symbol ⚠️ backend 未実装・無効化中
 *
 * 参照仕様: SPEC_v51_part10 §5「hooks ディレクトリ構成（確定）」
 *           SPEC_v51_part3 §6「Symbols API」
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { symbolsApi } from '../lib/api';
import type { UpdateSymbolSettingDto } from '../lib/api';

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
 *
 * ⚠️ backend 未実装（symbols.controller.ts に PATCH route なし）
 *    mutationFn を stub（no-op）に差し替え中。backend 実装後に復元すること。
 *
 * TODO(backend): PATCH /symbols/:symbol 実装後に以下を復元
 *   mutationFn: ({ symbol, body }: { symbol: string; body: UpdateSymbolSettingDto }) =>
 *     symbolsApi.update(symbol, body),
 */
export function useUpdateSymbol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ symbol, body }: { symbol: string; body: UpdateSymbolSettingDto }) =>
      symbolsApi.update(symbol, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: symbolKeys.all() }),
  });
}