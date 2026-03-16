/**
 * apps/api/src/app.module.ts
 *
 * 変更内容:
 *   [Phase12 Rate Limiting] APP_GUARD として ThrottlerGuard をグローバル登録
 *   - 全エンドポイントに 120req/分 のデフォルト制限を適用
 *   - auth: 10req/分（既存 AuthController の @UseGuards(ThrottlerGuard) は維持）
 *   - AI Summary / snapshot capture: 個別 @Throttle デコレータで制限
 *
 * 参照仕様: SPEC_v51_part3 §16「レート制限設定」
 */

import { Module, NestModule, MiddlewareConsumer }          from '@nestjs/common';
import { ConfigModule }    from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD }       from '@nestjs/core';
import { BullModule }      from '@nestjs/bullmq';
import { PrismaModule }    from './prisma/prisma.module';
import { AuthModule }      from './modules/auth/auth.module';
import { UsersModule }     from './modules/users/users.module';
import { SettingsModule }  from './modules/settings/settings.module';
import { SymbolsModule }   from './modules/symbols/symbols.module';
import { TradesModule }    from './modules/trades/trades.module';
import { SnapshotsModule } from './modules/snapshots/snapshots.module';
import { SignalsModule }   from './modules/signals/signals.module';
import { PredictionsModule }  from './modules/predictions/predictions.module';
import { ChartModule }        from './modules/chart/chart.module';
import { AiSummaryModule }    from './ai-summary/ai-summary.module';
import { ConnectorsModule }   from './modules/connectors/connectors.module';
import { MarketDataModule }   from './modules/market-data/market-data.module';
import { PluginsRankingModule } from './modules/plugins-ranking/plugins-ranking.module';
import { PluginsModule }      from './modules/plugins/plugins.module';
import { PluginsRuntimeModule } from './plugins-runtime/plugins-runtime.module';
import { AdminModule }          from './modules/admin/admin.module';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'global',  ttl: 60_000, limit: 120 }, // 全エンドポイント: 120req/分
      { name: 'auth',    ttl: 60_000, limit: 10  }, // Auth エンドポイント: 10req/分
      { name: 'capture', ttl: 60_000, limit: 20  }, // snapshot capture: 20req/分
    ]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6386',
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SymbolsModule,
    TradesModule,
    SnapshotsModule,
    SignalsModule,
    PredictionsModule,
    ChartModule,
    AiSummaryModule,
    ConnectorsModule,
    MarketDataModule,
    PluginsRankingModule,  // PluginsModule より前（ルート解決順）
    PluginsModule,
    PluginsRuntimeModule,
    AdminModule,
  ],
  providers: [
    // Phase12: グローバル Throttler Guard
    // 全 controller に自動適用。個別に @SkipThrottle() / @Throttle() で上書き可能。
    {
      provide:  APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}