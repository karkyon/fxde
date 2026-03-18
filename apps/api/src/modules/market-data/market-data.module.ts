/**
 * apps/api/src/modules/market-data/market-data.module.ts
 *
 * Phase 1 変更:
 *   - ProviderRegistry を providers / exports に追加
 *   - OandaProvider は ProviderRegistry が内部で inject するため引き続き providers に残す
 *   - exports に ProviderRegistry を追加（ConnectorsModule 等が必要な場合に備える）
 *
 * Phase 2 変更（Task2-1 対応）:
 *   - IndicatorEngineService を providers / exports に追加
 *     → price-sync 完了後に indicator 計算 → indicator_cache 書き込みを行う
 *     → MarketDataService が syncIndicators() 内で inject して使用する
 */
import { Module }            from '@nestjs/common';
import { PrismaModule }      from '../../prisma/prisma.module';
import { OandaProvider }       from './oanda.provider';
import { DukascopyProvider }   from './dukascopy.provider';
import { ProviderRegistry }    from './provider.registry';
import { MarketDataService }   from './market-data.service';
import { IndicatorEngineService } from './indicator-engine.service';

@Module({
  imports:   [PrismaModule],
  providers: [
    OandaProvider,
    DukascopyProvider,
    ProviderRegistry,
    MarketDataService,
    IndicatorEngineService,  // Phase 2 追加
  ],
  exports: [
    MarketDataService,
    OandaProvider,
    DukascopyProvider,
    ProviderRegistry,
    IndicatorEngineService,  // Phase 2 追加（snapshots / chart が必要な場合に備える）
  ],
})
export class MarketDataModule {}