/**
 * apps/api/src/plugins-runtime/plugins-runtime.module.ts
 *
 * Plugin Runtime Module
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §8.1「配置」
 *   fxde_plugin_runtime_完全設計書 §4「アーキテクチャ方針」
 *
 * 修正: PluginsRankingModule を imports に追加。
 *       EnabledPluginsResolverService が AdaptiveRankingService を DI できるようにする。
 *       循環依存なし（ranking は Prisma のみ依存）。
 */

import { Module }   from '@nestjs/common';
import { PrismaModule }         from '../prisma/prisma.module';
import { ChartModule }          from '../modules/chart/chart.module';
import { PluginsRankingModule } from '../modules/plugins-ranking/plugins-ranking.module';

import { PluginsRuntimeController }         from './plugins-runtime.controller';
import { PluginsRuntimeService }            from './plugins-runtime.service';
import { PluginsRuntimeAnalysisService }    from './plugins-runtime-analysis.service';
import { PluginRuntimeCoordinatorService }  from './coordinator/plugin-runtime-coordinator.service';
import { EnabledPluginsResolverService }    from './resolver/enabled-plugins-resolver.service';
import { ExecutionContextBuilderService }   from './context/execution-context-builder.service';
import { PluginExecutorService }            from './executor/plugin-executor.service';
import { ResultNormalizerService }          from './normalizer/result-normalizer.service';
import { PluginEventCaptureService }        from './event/plugin-event-capture.service';

@Module({
  imports: [
    PrismaModule,
    ChartModule,
    PluginsRankingModule,  // 追加: AdaptiveRankingService を resolver に DI するために必要
  ],
  controllers: [PluginsRuntimeController],
  providers: [
    PluginsRuntimeService,
    PluginsRuntimeAnalysisService,
    PluginRuntimeCoordinatorService,
    EnabledPluginsResolverService,
    ExecutionContextBuilderService,
    PluginExecutorService,
    ResultNormalizerService,
    PluginEventCaptureService,
  ],
  exports: [
    PluginEventCaptureService,
  ],
})
export class PluginsRuntimeModule {}