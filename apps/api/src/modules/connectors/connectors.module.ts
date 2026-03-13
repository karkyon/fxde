/**
 * apps/api/src/modules/connectors/connectors.module.ts
 */
import { Module }            from '@nestjs/common';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService }    from './connectors.service';
import { MarketDataModule }     from '../market-data/market-data.module';

@Module({
  imports:     [MarketDataModule],
  controllers: [ConnectorsController],
  providers:   [ConnectorsService],
  exports:     [ConnectorsService],
})
export class ConnectorsModule {}