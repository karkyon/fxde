/**
 * apps/api/src/chart/chart.module.ts
 *
 * 参照仕様: SPEC_v51_part11 §1.3「NestJS モジュール配置」
 *           SPEC_v51_part11 §10.1「NestJS モジュール実装手順」
 *
 * Phase 2 変更:
 *   - MarketDataModule を import に追加（ChartService が MarketDataService を inject するため）
 */

import { Module }            from '@nestjs/common';
import { ChartController }   from './chart.controller';
import { ChartService }      from './chart.service';
import { PrismaModule }      from '../../prisma/prisma.module';
import { MarketDataModule }  from '../market-data/market-data.module';

@Module({
  imports:     [PrismaModule, MarketDataModule],
  controllers: [ChartController],
  providers:   [ChartService],
  exports:     [ChartService],
})
export class ChartModule {}