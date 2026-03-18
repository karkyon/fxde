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
import { OandaProvider }     from './oanda.provider';
import { ProviderRegistry }  from './provider.registry';
import { MarketDataService } from './market-data.service';

@Module({
  imports:   [PrismaModule],
  providers: [
    OandaProvider,      // ProviderRegistry が inject するため必須
    ProviderRegistry,   // Phase 1 追加: active provider 管理
    MarketDataService,
  ],
  exports: [
    MarketDataService,
    OandaProvider,      // 既存 export 維持（ConnectorsModule 等が参照している可能性があるため）
    ProviderRegistry,   // Phase 1 追加: 将来 ConnectorsModule から health 取得に使う
  ],
})
export class MarketDataModule {}