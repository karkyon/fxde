/**
 * apps/api/src/modules/market-data/provider.registry.ts
 *
 * Market Data Provider Registry
 *
 * 参照設計:
 *   FXDE_OANDA_TO_PROVIDER_ADAPTER_DETAILED_DESIGN §7
 *
 * 責務:
 *   - MarketDataProvider インスタンスを providerId をキーとして管理する
 *   - active provider を env から決定して返す
 *   - MarketDataService は必ず getActive() 経由で provider を取得すること
 *   - OandaProvider を直接 inject する箇所はこのクラスのみ
 *
 * active provider の決定:
 *   環境変数: MARKET_DATA_ACTIVE_PROVIDER=oanda | dukascopy
 *   未設定時: 'oanda'（後方互換）
 *
 * Phase 1.5 変更:
 *   - getActive() フォールバック時の挙動を強化
 *     フォールバック先 (oanda) が isConfigured()=false の場合は例外を投げる
 *     → 設定ミスとフォールバック誤作動を区別可能にする
 *   - フォールバック発生時のログを warn → error に格上げ
 *
 * 将来拡張:
 *   DukascopyProvider 追加時は constructor に inject して providers Map に登録する
 */

import { Injectable, Logger } from '@nestjs/common';
import type { MarketProviderId } from '@fxde/types';
import type { MarketDataProvider } from './market-data-provider.interface';
import { OandaProvider }           from './oanda.provider';
import { DukascopyProvider }       from './dukascopy.provider';
import { TwelvedataProvider }      from './twelvedata.provider';

@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);

  /** providerId → provider インスタンス のマップ */
  private readonly providers: Map<MarketProviderId, MarketDataProvider>;

  constructor(
    private readonly oanda:      OandaProvider,
    private readonly dukascopy:  DukascopyProvider,
    private readonly twelvedata:  TwelvedataProvider,
  ) {
    this.providers = new Map<MarketProviderId, MarketDataProvider>([
      ['oanda',      oanda],
      ['dukascopy',  dukascopy],
      ['twelvedata',  twelvedata],
    ]);
  }

  /**
   * providerId で provider を取得する
   * 未登録の providerId を渡すとエラー
   */
  get(providerId: MarketProviderId): MarketDataProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(
        `[ProviderRegistry] Provider not registered: "${providerId}". ` +
        `Available: ${Array.from(this.providers.keys()).join(', ')}`,
      );
    }
    return provider;
  }

  /**
   * active provider を返す
   * env: MARKET_DATA_ACTIVE_PROVIDER で決定
   *
   * Phase 1.5 変更:
   *   未登録 providerId が指定された場合:
   *     1. error ログを出力（warn から格上げ）
   *     2. フォールバック先 oanda が isConfigured() か確認
   *     3. isConfigured()=false なら例外を投げる（silent skip しない）
   *        → MARKET_DATA_ACTIVE_PROVIDER 設定ミスを即座に検出できる
   */
  getActive(): MarketDataProvider {
    const envValue = process.env.MARKET_DATA_ACTIVE_PROVIDER ?? 'oanda';

    // 登録済み providerId として有効か確認する
    if (this.providers.has(envValue as MarketProviderId)) {
      return this.providers.get(envValue as MarketProviderId)!;
    }

    // ── 未登録の providerId が指定された場合 ──────────────────────────────
    this.logger.error(
      `[ProviderRegistry] MARKET_DATA_ACTIVE_PROVIDER="${envValue}" は未登録。` +
      `登録済み: ${Array.from(this.providers.keys()).join(', ')}。` +
      `oanda へフォールバックを試みる。`,
    );

    // フォールバック: twelvedata → oanda の順で探す
    for (const fallbackId of ['twelvedata', 'oanda'] as MarketProviderId[]) {
      const fallback = this.providers.get(fallbackId);
      if (fallback && fallback.isConfigured()) {
        this.logger.error(
          `[ProviderRegistry] "${envValue}" 未登録 → "${fallbackId}" へフォールバック`,
        );
        return fallback;
      }
    }

    throw new Error(
      `[ProviderRegistry] MARKET_DATA_ACTIVE_PROVIDER="${envValue}" 未登録かつ ` +
      `フォールバック先 (twelvedata / oanda) も未設定。.env を確認してください。`,
    );
  }

  /**
   * 登録されている全 provider を返す
   * health チェック一覧取得などで使用する
   */
  list(): MarketDataProvider[] {
    return Array.from(this.providers.values());
  }
}