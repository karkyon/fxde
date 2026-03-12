// apps/web/src/hooks/queries.ts
//
// 変更内容:
//   [Task5] Signals / Trades / Snapshot 関連フックを各専用ファイルへ分離
//           SPEC_v51_part10 §5（フロントディレクトリ正本）に準拠
//
//   このファイルの責務:
//     - useMe / useSymbols / useSettings / useUpdateSettings（共通フック）
//     - 後方互換用 re-export（既存 import パスを壊さないための橋渡し）
//       ※ 今後の新規コードは各専用ファイルから直接 import すること
//
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  settingsApi,
  userApi,
  symbolsApi,
} from '../lib/api';
import type { UpdateSettingsDto } from '@fxde/types';

// ── 後方互換 re-export ────────────────────────────────────────────────────────
// 既存ページ（Trades.tsx / Dashboard.tsx / Signals.tsx 等）が
// ../hooks/queries から import しているため、分離後も動作するよう再エクスポート。
// 新規コードはそれぞれのファイルから直接 import すること。
export {
  useSignals,
  useLatestSignals,
  useAckSignal,
} from './useSignals';

export {
  useTrades,
  useTrade,
  useTradeReview,
  useCreateTrade,
  useUpdateTrade,
  useCloseTrade,
  useDeleteTrade,
  useCreateReview,
  useEquityCurve,
  useTradeSummary,
} from './useTrades';

export {
  useLatestSnapshot,
  useSnapshots,
} from './useSnapshot';

// ── Query Keys（共通）────────────────────────────────────────────────────────
// 専用ファイルの keys は各ファイル内で管理。
// 後方互換のために QK オブジェクトも残す（使用箇所があれば移行推奨）。
export const QK = {
  me:       () => ['me'] as const,
  symbols:  () => ['symbols'] as const,
  settings: () => ['settings'] as const,
};

// ── User ──────────────────────────────────────────────────────────────────────
export function useMe() {
  return useQuery({
    queryKey: QK.me(),
    queryFn:  () => userApi.me(),
  });
}

// ── Symbols ───────────────────────────────────────────────────────────────────
export function useSymbols() {
  return useQuery({
    queryKey: QK.symbols(),
    queryFn:  () => symbolsApi.list(),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function useSettings() {
  return useQuery({
    queryKey: QK.settings(),
    queryFn:  () => settingsApi.get(),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsDto) => settingsApi.update(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QK.settings() }),
  });
}