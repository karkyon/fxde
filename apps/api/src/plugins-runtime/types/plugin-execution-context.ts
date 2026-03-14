/**
 * apps/api/src/plugins-runtime/types/plugin-execution-context.ts
 *
 * Plugin 実行時に各 plugin へ渡す標準コンテキスト型
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §8.4「Execution Context」
 *
 * ⚠️ このファイルは API 内部型。@fxde/types には含めない。
 */

import type { UserRole } from '@fxde/types';

/** ローソク足 1 本 */
export interface Candle {
  time:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/** Plugin 実行コンテキスト */
export interface PluginExecutionContext {
  userId:    string;
  role:      UserRole;
  symbol:    string;
  timeframe: string;
  nowIso:    string;

  /** market_candles から取得したローソク足データ */
  candles?: Candle[];

  /** indicator_cache から取得したインジケーターデータ */
  indicators?: Record<string, unknown> | null;

  /** パターンマーカー（将来拡張用） */
  patternMarkers?: unknown[];

  /** アクティブトレード（将来拡張用） */
  activeTrades?: unknown[];

  /** 予測オーバーレイ（v5.1 は stub、将来拡張用） */
  predictionOverlay?: unknown | null;
}

/** plugin が実行時に返す生の出力型 */
export interface PluginRawOutput {
  overlays?:   unknown[];
  signals?:    unknown[];
  indicators?: unknown[];
}