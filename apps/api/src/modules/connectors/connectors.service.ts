/**
 * apps/api/src/modules/connectors/connectors.service.ts
 *
 * ConnectorStatusService
 * DB に保存しない。Redis 5分 TTL でステータスをキャッシュ。
 *
 * 参照仕様:
 *   SPEC_v51_part3 §12「コネクタ状態 API」
 *   SPEC_v51_part1 §8.2「overallHealth 判定ルール」
 *
 * Phase 2 整合化変更:
 *   - active market-data provider（MARKET_DATA_ACTIVE_PROVIDER）を price 系評価軸に変更
 *   - dukascopy を price connector として追加
 *   - alpha_vantage を isRequired: false に変更
 *     （価格取得の主系責務は ProviderRegistry の active provider に移管済み）
 *   - overallHealth の critical 判定を active price provider ベースに変更
 *   ⚠️ この変更により SPEC v5.1 §8.1/§8.2 の以下の記述が実態と乖離する:
 *     「hard-required: alpha_vantage」→ active provider に変更
 *     「critical = alpha_vantage が error」→ active provider が error に変更
 *     SPEC の当該箇所を更新すること。
 */

import { Injectable, Logger } from '@nestjs/common';
import { MarketDataService }  from '../market-data/market-data.service';

export type ConnectorStatusValue = 'ok' | 'cached' | 'error' | 'unconfigured';

export interface ConnectorStatusItem {
  name:         string;
  displayName:  string;
  type:         'price' | 'calendar' | 'news' | 'interest';
  status:       ConnectorStatusValue;
  lastSyncAt:   string | null;
  errorMessage: string | null;
  isRequired:   boolean;
}

export interface ConnectorStatusResponse {
  connectors:    ConnectorStatusItem[];
  overallHealth: 'healthy' | 'degraded' | 'critical';
}

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(private readonly marketData: MarketDataService) {}

  async getStatus(): Promise<ConnectorStatusResponse> {
    const now = new Date().toISOString();

    // ── active market-data provider の判定 ──────────────────────
    // MARKET_DATA_ACTIVE_PROVIDER が oanda | dukascopy を決定する
    // checkConnection() は ProviderRegistry.getActive() の health を返す
    const activeProviderId: string =
      process.env.MARKET_DATA_ACTIVE_PROVIDER ?? 'oanda';

    const activePriceCheck = await this.marketData.checkConnection().catch((e) => ({
      ok: false, error: String(e),
    }));

    const activePriceStatus: ConnectorStatusValue = activePriceCheck.ok
      ? 'ok'
      : activePriceCheck.error === 'unconfigured'
        ? 'unconfigured'
        : 'error';

    // ── OANDA（active でない場合: env vars のみ確認）─────────────
    // active=oanda のときは activePriceCheck の結果を使う
    const oandaStatus: ConnectorStatusValue =
      activeProviderId === 'oanda'
        ? activePriceStatus
        : (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID
            ? 'ok'
            : 'unconfigured');

    const oandaErrorMessage: string | null =
      oandaStatus === 'error'
        ? (activeProviderId === 'oanda' ? (activePriceCheck.error ?? null) : null)
        : oandaStatus === 'unconfigured'
          ? 'OANDA_API_KEY / OANDA_ACCOUNT_ID 未設定'
          : null;

    // ── Dukascopy（active でない場合: DUKASCOPY_ENABLED のみ確認）
    // active=dukascopy のときは activePriceCheck の結果を使う
    const dukascopyStatus: ConnectorStatusValue =
      activeProviderId === 'dukascopy'
        ? activePriceStatus
        : (process.env.DUKASCOPY_ENABLED === 'true' ? 'ok' : 'unconfigured');

    const dukascopyErrorMessage: string | null =
      dukascopyStatus === 'error'
        ? (activeProviderId === 'dukascopy' ? (activePriceCheck.error ?? null) : null)
        : dukascopyStatus === 'unconfigured'
          ? 'DUKASCOPY_ENABLED=true 未設定'
          : null;

    // ── Alpha Vantage ── env のみ確認（価格主系責務を provider に移管）
    const avKey = process.env.ALPHA_VANTAGE_KEY;
    const avStatus: ConnectorStatusValue = avKey ? 'ok' : 'unconfigured';

    // ── analysis 系（キー有無のみ確認）───────────────────────────
    const fredStatus:  ConnectorStatusValue = process.env.FRED_API_KEY ? 'ok' : 'unconfigured';
    const newsStatus:  ConnectorStatusValue = process.env.NEWS_API_KEY ? 'ok' : 'unconfigured';
    const stooqStatus: ConnectorStatusValue = 'ok'; // Stooq はキーなし・常時利用可

    const connectors: ConnectorStatusItem[] = [
      // ── price 系 ──────────────────────────────────────────────
      {
        name:         'dukascopy',
        displayName:  'Dukascopy',
        type:         'price',
        status:       dukascopyStatus,
        lastSyncAt:   dukascopyStatus === 'ok' ? now : null,
        errorMessage: dukascopyErrorMessage,
        isRequired:   false, // 研究主系 provider（active 判定は overallHealth で制御）
      },
      {
        name:         'alpha_vantage',
        displayName:  'Alpha Vantage',
        type:         'price',
        status:       avStatus,
        lastSyncAt:   avStatus === 'ok' ? now : null,
        errorMessage: avStatus === 'unconfigured' ? 'ALPHA_VANTAGE_KEY 未設定' : null,
        isRequired:   false, // Phase 2: 価格主系責務を ProviderRegistry に移管
      },
      {
        name:         'oanda',
        displayName:  'OANDA API',
        type:         'price',
        status:       oandaStatus,
        lastSyncAt:   oandaStatus === 'ok' ? now : null,
        errorMessage: oandaErrorMessage,
        isRequired:   false, // 互換副系 provider
      },
      // ── analysis 系（unchanged）───────────────────────────────
      {
        name:         'fred',
        displayName:  'FRED API',
        type:         'interest',
        status:       fredStatus,
        lastSyncAt:   fredStatus === 'ok' ? now : null,
        errorMessage: fredStatus === 'unconfigured' ? 'FRED_API_KEY 未設定' : null,
        isRequired:   true,
      },
      {
        name:         'news_api',
        displayName:  'NewsAPI.org',
        type:         'news',
        status:       newsStatus,
        lastSyncAt:   newsStatus === 'ok' ? now : null,
        errorMessage: newsStatus === 'unconfigured' ? 'NEWS_API_KEY 未設定' : null,
        isRequired:   true,
      },
      {
        name:         'stooq',
        displayName:  'Stooq',
        type:         'calendar',
        status:       stooqStatus,
        lastSyncAt:   now,
        errorMessage: null,
        isRequired:   true,
      },
    ];

    // ── overallHealth 判定 ─────────────────────────────────────
    // Phase 2 整合化: critical 判定を active price provider ベースに変更
    //   critical = active price provider が error または unconfigured
    //   degraded = active price provider は ok/cached だが analysis 系が error
    //   healthy  = 全 isRequired=true（analysis 系）が ok または cached
    //              かつ active price provider が ok
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (
      activePriceStatus === 'error' ||
      activePriceStatus === 'unconfigured'
    ) {
      overallHealth = 'critical';
    } else {
      const analysisDegraded = connectors
        .filter((c) => c.isRequired)
        .some((c) => c.status === 'error');
      if (analysisDegraded) overallHealth = 'degraded';
    }

    return { connectors, overallHealth };
  }
}