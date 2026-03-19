/**
 * apps/api/src/plugins-runtime/types/plugin-execution-context.ts
 *
 * Plugin 実行時に各 plugin へ渡す標準コンテキスト型
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §8.4「Execution Context」
 *
 * ⚠️ このファイルは API 内部型。@fxde/types には含めない。
 *
 * STEP2-4 追加:
 *   conditionContextEngine を追加。
 *   auto-chart-pattern-engine.adapter.ts が module-level new を使わず
 *   DI 管理下の instance を ctx 経由で受け取るようにするための追加。
 */

import type { UserRole } from '@fxde/types';
import type { ConditionContextEngineService } from '../context/condition-context-engine.service';

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

  /**
   * 上位足ローソク足データ（higherTrend 算出用）
   * HTF_MAP で決まる上位足のcandles。取得失敗時は undefined。
   */
  higherCandles?: Candle[];

  /** indicator_cache から取得したインジケーターデータ */
  indicators?: Record<string, unknown> | null;

  /** パターンマーカー（将来拡張用） */
  patternMarkers?: unknown[];

  /** アクティブトレード（将来拡張用） */
  activeTrades?: unknown[];

  /** 予測オーバーレイ（v5.1 は stub、将来拡張用） */
  predictionOverlay?: unknown | null;

  /**
   * STEP2-4: DI統一のため追加。
   * ExecutionContextBuilderService が NestJS DI 管理下の instance を注入する。
   * auto-chart-pattern-engine.adapter.ts はこれを使って context を算出する。
   * module-level `new ConditionContextEngineService()` は廃止。
   */
  conditionContextEngine?: ConditionContextEngineService;
}

/** plugin が実行時に返す生の出力型 */
export interface PluginRawOutput {
  overlays?:   unknown[];
  signals?:    unknown[];
  indicators?: unknown[];
}