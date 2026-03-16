/**
 * apps/api/src/plugins-runtime/event/plugin-event-capture.service.ts
 *
 * Plugin 実行結果から PluginEvent を DB に保存するサービス。
 * Coordinator から try/catch で独立して呼び出す。
 * 保存失敗は runtime 結果に影響させない。
 *
 * 修正（Task E）:
 *   captureOverlayEvents()   — overlay イベントを PluginEvent に保存
 *   captureIndicatorEvents() — indicator イベントを PluginEvent に保存
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma }             from '@prisma/client';
import { PrismaService }      from '../../prisma/prisma.service';
import type { RuntimeSignal, RuntimeOverlay, RuntimeIndicator } from '@fxde/types';

@Injectable()
export class PluginEventCaptureService {
  private readonly logger = new Logger(PluginEventCaptureService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── signal ──────────────────────────────────────────────────────────────

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
      const data: Prisma.PluginEventCreateManyInput[] = signals.map((sig) => {
        // sig.meta から patternType を抽出（auto-chart-pattern-engine は meta.pattern に格納）
        const sigMeta = sig.meta as Record<string, unknown> | undefined;
        const patternType = sigMeta?.['pattern'] ?? null;

        return {
          pluginKey,
          symbol,
          timeframe,
          eventType:  'signal',
          direction:  sig.direction ?? null,
          price:      sig.price ?? null,
          confidence: sig.confidence ?? null,
          // Task4: patternType / symbol / timeframe / direction / detectedAt を metadata に付与
          metadata: {
            ...(sigMeta ?? {}),
            patternType,
            symbol,
            timeframe,
            direction:   sig.direction ?? null,
            detectedAt:  sig.timestamp ?? now.toISOString(),
          } as Prisma.InputJsonValue,
          emittedAt: sig.timestamp ? new Date(sig.timestamp) : now,
        };
      });

      await this.prisma.pluginEvent.createMany({ data });

      this.logger.debug(
        `[PluginEventCapture] saved ${data.length} signal event(s) for ${pluginKey}/${symbol}/${timeframe}`,
      );
    } catch (err) {
      this.logger.warn(
        `[PluginEventCapture] failed to save signal events for ${pluginKey}: ${String(err)}`,
      );
    }
  }

  // ── overlay ─────────────────────────────────────────────────────────────

  /**
   * SUCCEEDED 結果の overlays から PluginEvent を一括保存する。
   * eventType = 'overlay'
   * direction / price / confidence は overlay には不適用のため null。
   * metadata に { kind, label, geometry, meta } を格納する。
   */
  async captureOverlayEvents(
    pluginKey: string,
    symbol:    string,
    timeframe: string,
    overlays:  RuntimeOverlay[],
  ): Promise<void> {
    if (overlays.length === 0) return;

    const now = new Date();

    try {
      const data: Prisma.PluginEventCreateManyInput[] = overlays.map((ov) => ({
        pluginKey,
        symbol,
        timeframe,
        eventType:  'overlay',
        direction:  null,
        price:      null,
        confidence: null,
        metadata: {
          kind:     ov.kind,
          label:    ov.label,
          geometry: ov.geometry as Prisma.InputJsonValue,
          meta:     (ov.meta ?? null) as Prisma.InputJsonValue | null,
        } as Prisma.InputJsonValue,
        emittedAt: now,
      }));

      await this.prisma.pluginEvent.createMany({ data });

      this.logger.debug(
        `[PluginEventCapture] saved ${data.length} overlay event(s) for ${pluginKey}/${symbol}/${timeframe}`,
      );
    } catch (err) {
      this.logger.warn(
        `[PluginEventCapture] failed to save overlay events for ${pluginKey}: ${String(err)}`,
      );
    }
  }

  // ── indicator ────────────────────────────────────────────────────────────

  /**
   * SUCCEEDED 結果の indicators から PluginEvent を一括保存する。
   * eventType = 'indicator'
   * direction / price / confidence は indicator には不適用のため null。
   * metadata に { label, value, status, meta } を格納する。
   */
  async captureIndicatorEvents(
    pluginKey:  string,
    symbol:     string,
    timeframe:  string,
    indicators: RuntimeIndicator[],
  ): Promise<void> {
    if (indicators.length === 0) return;

    const now = new Date();

    try {
      const data: Prisma.PluginEventCreateManyInput[] = indicators.map((ind) => ({
        pluginKey,
        symbol,
        timeframe,
        eventType:  'indicator',
        direction:  null,
        price:      null,
        confidence: null,
        metadata: {
          label:  ind.label,
          value:  ind.value,
          status: ind.status,
          meta:   (ind.meta ?? null) as Prisma.InputJsonValue | null,
        } as Prisma.InputJsonValue,
        emittedAt: now,
      }));

      await this.prisma.pluginEvent.createMany({ data });

      this.logger.debug(
        `[PluginEventCapture] saved ${data.length} indicator event(s) for ${pluginKey}/${symbol}/${timeframe}`,
      );
    } catch (err) {
      this.logger.warn(
        `[PluginEventCapture] failed to save indicator events for ${pluginKey}: ${String(err)}`,
      );
    }
  }
}