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
 * 将来拡張:
 *   DukascopyProvider 追加時は constructor に inject して providers Map に登録する
 */

import { Injectable, Logger } from '@nestjs/common';
import type { MarketProviderId } from '@fxde/types';
import type { MarketDataProvider } from './market-data-provider.interface';
import { OandaProvider }           from './oanda.provider';

@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);

  /** providerId → provider インスタンス のマップ */
  private readonly providers: Map<MarketProviderId, MarketDataProvider>;

  constructor(
    private readonly oanda: OandaProvider,
    // Phase 2: DukascopyProvider を追加する
    // private readonly dukascopy: DukascopyProvider,
  ) {
    this.providers = new Map<MarketProviderId, MarketDataProvider>([
      ['oanda', oanda],
      // Phase 2: ['dukascopy', dukascopy],
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
   * 未設定 / 未登録の値は 'oanda' にフォールバック（後方互換）
   */
  getActive(): MarketDataProvider {
    const envValue = process.env.MARKET_DATA_ACTIVE_PROVIDER ?? 'oanda';

    // 登録済み providerId として有効か確認する
    if (!this.providers.has(envValue as MarketProviderId)) {
      this.logger.warn(
        `[ProviderRegistry] MARKET_DATA_ACTIVE_PROVIDER="${envValue}" は未登録。` +
        `oanda にフォールバック。`,
      );
      return this.providers.get('oanda')!;
    }

    return this.providers.get(envValue as MarketProviderId)!;
  }

  /**
   * 登録されている全 provider を返す
   * health チェック一覧取得などで使用する
   */
  list(): MarketDataProvider[] {
    return Array.from(this.providers.values());
  }
}