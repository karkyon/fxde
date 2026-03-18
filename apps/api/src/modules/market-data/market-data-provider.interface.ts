/**
 * apps/api/src/modules/market-data/market-data-provider.interface.ts
 *
 * Market Data Provider 抽象インターフェース
 *
 * 参照設計:
 *   FXDE_OANDA_TO_PROVIDER_ADAPTER_DETAILED_DESIGN §6.1
 *
 * 責務:
 *   - 全 provider が実装すべき契約を定義する
 *   - FXDE 本体が外部 provider を直接知らない構造を実現する
 *   - apps/api 内部のみで使用する（@fxde/types に含めない）
 *
 * 注意:
 *   - MarketProviderId / CanonicalCandle / CanonicalTimeframe は @fxde/types から import する
 *   - class-validator 禁止
 */

import type { MarketProviderId, CanonicalCandle, CanonicalTimeframe } from '@fxde/types';

// ── Input 型 ──────────────────────────────────────────────────────────────

export interface FetchLatestBarInput {
  symbol:    string;
  timeframe: CanonicalTimeframe;
}

export interface FetchRangeInput {
  symbol:    string;
  timeframe: CanonicalTimeframe;
  from:      string;   // ISO8601 UTC
  to:        string;   // ISO8601 UTC
  limit?:    number;   // 省略時は provider デフォルト
}

// ── Health 型 ─────────────────────────────────────────────────────────────

export type ProviderHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'error'
  | 'unconfigured';

// ── Provider Interface ────────────────────────────────────────────────────

export interface MarketDataProvider {
  /** Provider 識別子（registry のキーとして使用）*/
  readonly providerId: MarketProviderId;

  /** env / config が揃っているか */
  isConfigured(): boolean;

  /** 指定 timeframe をサポートしているか */
  supportsTimeframe(tf: CanonicalTimeframe): boolean;

  /** 最新 1 本を取得。未取得・未設定時は null */
  fetchLatestBar(input: FetchLatestBarInput): Promise<CanonicalCandle | null>;

  /**
   * 指定レンジのローソク足を取得
   * limit 指定時は from 側から最大 limit 本まで
   */
  fetchRange(input: FetchRangeInput): Promise<CanonicalCandle[]>;

  /** Provider の死活確認 */
  healthCheck(): Promise<ProviderHealthStatus>;
}