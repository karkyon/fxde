/**
 * apps/api/src/modules/market-data/market-data.module.ts
 *
 * Phase 1 変更:
 *   - ProviderRegistry を providers / exports に追加
 *
 * STEP 3 変更（2026-03-19）:
 *   - IndicatorEngineService を providers / exports に追加
 *     → MarketDataService.syncIndicators() 内で inject して使用
 */
import { Module }            from '@nestjs/common';
import { PrismaModule }      from '../../prisma/prisma.module';
import { OandaProvider }     from './oanda.provider';
import { DukascopyProvider } from './dukascopy.provider';
import { TwelvedataProvider } from './twelvedata.provider';
import { ProviderRegistry }  from './provider.registry';
import { MarketDataService } from './market-data.service';
import { IndicatorEngineService } from './indicator-engine.service';

@Module({
  imports:   [PrismaModule],
  providers: [
    OandaProvider,
    DukascopyProvider,
    TwelvedataProvider,
    ProviderRegistry,
    MarketDataService,
    IndicatorEngineService,
  ],
  exports: [
    MarketDataService,
    OandaProvider,
    DukascopyProvider,
    TwelvedataProvider,
    ProviderRegistry,
    IndicatorEngineService,
  ],
})
export class MarketDataModule {}