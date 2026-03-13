/**
 * apps/api/src/modules/connectors/connectors.service.ts
 *
 * ConnectorStatusService
 * DB に保存しない。Redis 5分 TTL でステータスをキャッシュ。
 *
 * 参照仕様:
 *   SPEC_v51_part3 §12「コネクタ状態 API」
 *   SPEC_v51_part1 §8.2「overallHealth 判定ルール」
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

    // ── OANDA（任意副系）────────────────────────────────────────
    const oandaCheck = await this.marketData.checkConnection().catch((e) => ({
      ok: false, error: String(e),
    }));

    const oandaStatus: ConnectorStatusValue = oandaCheck.ok
      ? 'ok'
      : oandaCheck.error === 'unconfigured'
        ? 'unconfigured'
        : 'error';

    // ── Alpha Vantage（主系）── v5.1 では環境変数の有無のみ確認 ──
    const avKey = process.env.ALPHA_VANTAGE_KEY;
    const avStatus: ConnectorStatusValue = avKey ? 'ok' : 'unconfigured';

    // ── analysis 系（キー有無のみ確認）───────────────────────────
    const fredStatus:    ConnectorStatusValue = process.env.FRED_API_KEY    ? 'ok' : 'unconfigured';
    const newsStatus:    ConnectorStatusValue = process.env.NEWS_API_KEY    ? 'ok' : 'unconfigured';
    const stooqStatus:   ConnectorStatusValue = 'ok'; // Stooq はキーなし・常時利用可

    const connectors: ConnectorStatusItem[] = [
      {
        name:         'alpha_vantage',
        displayName:  'Alpha Vantage',
        type:         'price',
        status:       avStatus,
        lastSyncAt:   avStatus === 'ok' ? now : null,
        errorMessage: avStatus === 'unconfigured' ? 'ALPHA_VANTAGE_KEY 未設定' : null,
        isRequired:   true,
      },
      {
        name:         'oanda',
        displayName:  'OANDA API',
        type:         'price',
        status:       oandaStatus,
        lastSyncAt:   oandaStatus === 'ok' ? now : null,
        errorMessage: oandaStatus === 'error'
          ? (oandaCheck.error ?? null)
          : oandaStatus === 'unconfigured'
            ? 'OANDA_API_KEY / OANDA_ACCOUNT_ID 未設定'
            : null,
        isRequired:   false,  // 任意副系
      },
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

    // ── overallHealth 判定（SPEC §8.2 準拠）───────────────────────
    // critical = alpha_vantage が error または unconfigured
    // degraded = alpha_vantage は ok/cached だが analysis 系いずれかが error
    // healthy  = 全 isRequired=true が ok または cached
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';

    const requiredConnectors = connectors.filter((c) => c.isRequired);
    const avConn = requiredConnectors.find((c) => c.name === 'alpha_vantage');

    if (avConn && (avConn.status === 'error' || avConn.status === 'unconfigured')) {
      overallHealth = 'critical';
    } else {
      const analysisDegraded = requiredConnectors
        .filter((c) => c.name !== 'alpha_vantage')
        .some((c) => c.status === 'error');
      if (analysisDegraded) overallHealth = 'degraded';
    }

    return { connectors, overallHealth };
  }
}