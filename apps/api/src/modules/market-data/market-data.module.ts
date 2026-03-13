/**
 * apps/api/src/modules/market-data/market-data.module.ts
 */
import { Module }          from '@nestjs/common';
import { PrismaModule }    from '../../prisma/prisma.module';
import { OandaProvider }   from './oanda.provider';
import { MarketDataService } from './market-data.service';

@Module({
  imports:   [PrismaModule],
  providers: [OandaProvider, MarketDataService],
  exports:   [MarketDataService, OandaProvider],
})
export class MarketDataModule {}