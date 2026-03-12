/**
 * apps/api/src/app.module.ts
 *
 * 変更内容:
 *   [predictions] PredictionsModule を import 追加
 *   [BullMQ]      BullMQModule.forRoot を追加
 *                 PredictionsModule が BullMQModule.forFeature を使うために必要。
 *                 既存モジュールで BullMQ を使うものがあれば共通 forRoot として機能する。
 *
 * 参照仕様:
 *   SPEC_v51_part3 §10「Predictions API」
 *   SPEC_v51_part4 §5.1「キュー一覧」§5.5「prediction-dispatch ワーカー」
 *   SPEC_v51_part8 §9.1「v5.1 サービス構成」
 */

import { Module }          from '@nestjs/common';
import { ConfigModule }    from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule  }    from '@nestjs/bullmq';
import { PrismaModule }    from './prisma/prisma.module';
import { AuthModule }      from './modules/auth/auth.module';
import { UsersModule }     from './modules/users/users.module';
import { SettingsModule }  from './modules/settings/settings.module';
import { SymbolsModule }   from './modules/symbols/symbols.module';
import { TradesModule }    from './modules/trades/trades.module';
import { SnapshotsModule } from './modules/snapshots/snapshots.module';
import { SignalsModule }    from './modules/signals/signals.module';
import { PredictionsModule } from './modules/predictions/predictions.module';
import { ChartModule }     from './modules/chart/chart.module';
import { AiSummaryModule } from './ai-summary/ai-summary.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'global',  ttl: 60_000, limit: 120 },
      { name: 'auth',    ttl: 60_000, limit: 10  },
      { name: 'capture', ttl: 60_000, limit: 20  },
    ]),
    // BullMQ ルート設定（全モジュール共通）
    // PredictionsModule の forFeature / prediction-dispatch キュー使用に必要
    // 参照: SPEC_v51_part4 §5.1 REDIS_URL 環境変数
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
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
  ],
})
export class AppModule {}