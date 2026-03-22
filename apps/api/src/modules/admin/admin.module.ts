/**
 * apps/api/src/modules/admin/admin.module.ts
 *
 * 参照仕様: SPEC_v51_part3 §13「管理者 API」
 */
import { Module }          from '@nestjs/common';
import { PrismaModule }    from '../../prisma/prisma.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';

@Module({
  imports:     [PrismaModule, MarketDataModule],
  controllers: [AdminController],
  providers:   [AdminService],
})
export class AdminModule {}