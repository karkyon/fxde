/**
 * apps/api/src/plugins-runtime/event/plugin-event-capture.service.ts
 *
 * Plugin 実行結果から PluginEvent を DB に保存するサービス。
 * Coordinator から try/catch で独立して呼び出す。
 * 保存失敗は runtime 結果に影響させない。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma }             from '@prisma/client';
import { PrismaService }      from '../../prisma/prisma.service';
import type { RuntimeSignal } from '@fxde/types';

@Injectable()
export class PluginEventCaptureService {
  private readonly logger = new Logger(PluginEventCaptureService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * SUCCEEDED 結果の signals から PluginEvent を一括保存する。
   * runtime 本体と独立して try/catch で isolation する。
   */
  async captureSignalEvents(
    pluginKey: string,
    symbol:    string,
    timeframe: string,
    signals:   RuntimeSignal[],
  ): Promise<void> {
    if (signals.length === 0) return;

    const now = new Date();

    try {
      const data: Prisma.PluginEventCreateManyInput[] = signals.map((sig) => ({
        pluginKey,
        symbol,
        timeframe,
        eventType:  'signal',
        direction:  sig.direction ?? null,
        price:      sig.price ?? null,
        confidence: sig.confidence ?? null,
        // Prisma nullable JSON: null は Prisma.JsonNull で渡す
        metadata:   sig.meta
          ? (sig.meta as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        emittedAt:  sig.timestamp ? new Date(sig.timestamp) : now,
      }));

      await this.prisma.pluginEvent.createMany({ data });

      this.logger.debug(
        `[PluginEventCapture] saved ${data.length} signal event(s) for ${pluginKey}/${symbol}/${timeframe}`,
      );
    } catch (err) {
      // 保存失敗は runtime に巻き込まない
      this.logger.warn(
        `[PluginEventCapture] failed to save events for ${pluginKey}: ${String(err)}`,
      );
    }
  }
}