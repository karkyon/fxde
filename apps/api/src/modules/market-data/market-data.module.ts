/**
 * apps/api/src/modules/market-data/market-data.module.ts
 *
 * Phase 1 変更:
 *   - ProviderRegistry を providers / exports に追加
 *   - OandaProvider は ProviderRegistry が内部で inject するため引き続き providers に残す
 *   - exports に ProviderRegistry を追加（ConnectorsModule 等が必要な場合に備える）
 */
import { Module }            from '@nestjs/common';
import { PrismaModule }      from '../../prisma/prisma.module';
import { OandaProvider }       from './oanda.provider';
import { DukascopyProvider }   from './dukascopy.provider';
import { ProviderRegistry }    from './provider.registry';
import { MarketDataService }   from './market-data.service';

@Module({
  imports:   [PrismaModule],
  providers: [
    OandaProvider,
    DukascopyProvider,
    ProviderRegistry,
    MarketDataService,
  ],
  exports: [
    MarketDataService,
    OandaProvider,
    DukascopyProvider,
    ProviderRegistry,
  ],
})
export class MarketDataModule {}