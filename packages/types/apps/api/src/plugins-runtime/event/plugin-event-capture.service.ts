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
 *
 * 追加（STEP2 Task2-3）:
 *   capturePatternDetections() — auto-chart-pattern-engine の signal を
 *     PatternDetection テーブルに保存。
 *     これにより snapshot.patterns（PatternDetection 参照）に
 *     auto-chart-pattern-engine の検出結果が反映される。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Timeframe }  from '@prisma/client';
import { PrismaService }      from '../../prisma/prisma.service';
import type { RuntimeSignal, RuntimeOverlay, RuntimeIndicator } from '@fxde/types';

// ── PatternDetection.patternCategory マッピング ───────────────────────────
// auto-chart-pattern-engine の meta.pattern → patternCategory / patternName
const PATTERN_META: Record<string, { patternName: string; patternCategory: string }> = {
  head_and_shoulders:         { patternName: 'HeadAndShoulders',        patternCategory: 'reversal' },
  inverse_head_and_shoulders: { patternName: 'InverseHeadAndShoulders', patternCategory: 'reversal' },
  double_top:                 { patternName: 'DoubleTop',               patternCategory: 'reversal' },
  double_bottom:              { patternName: 'DoubleBottom',            patternCategory: 'reversal' },
  triangle:                   { patternName: 'Triangle',                patternCategory: 'continuation' },
  ascending_triangle:         { patternName: 'Triangle',                patternCategory: 'continuation' },
  descending_triangle:        { patternName: 'Triangle',                patternCategory: 'continuation' },
  symmetrical_triangle:       { patternName: 'Triangle',                patternCategory: 'continuation' },
  channel:                    { patternName: 'Channel',                 patternCategory: 'continuation' },
};

/** Prisma Timeframe enum の有効値セット */
const VALID_TF = new Set<string>([
  'M1','M5','M15','M30','H1','H4','H8','D1','W1','MN',
]);

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
            direction:  sig.direction ?? null,
            detectedAt: sig.timestamp ?? now.toISOString(),
            context:    (sigMeta?.['context'] ?? null) as Prisma.InputJsonValue | null,
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

  // ── patternDetection ─────────────────────────────────────────────────────

  /**
   * auto-chart-pattern-engine の signals を PatternDetection テーブルに保存する。
   *
   * STEP2 Task2-3: これにより snapshot.patterns（PatternDetection 参照）に
   * auto-chart-pattern-engine の検出結果が反映される。
   *
   * 呼び出し条件:
   *   pluginKey === 'auto-chart-pattern-engine' の SUCCEEDED 時のみ。
   *   他 plugin からは呼ばない。
   *
   * PatternDetection フィールドマッピング:
   *   userId        — coordinator から受け取る
   *   symbol        — 引数
   *   timeframe     — 引数（Prisma Timeframe enum に変換）
   *   patternName   — PATTERN_META[meta.pattern].patternName
   *   patternCategory — PATTERN_META[meta.pattern].patternCategory
   *   direction     — sig.direction ('BUY'|'SELL'|'NEUTRAL') → VarChar(10)
   *   confidence    — sig.confidence ?? 0.5
   *   detectedAt    — sig.timestamp ?? now
   *   barIndex      — meta.headIdx ?? meta.rightIdx ?? meta.peakIdx ?? 0
   *   price         — sig.price ?? 0
   *   label         — sig.label
   */
  async capturePatternDetections(
    userId:    string,
    symbol:    string,
    timeframe: string,
    signals:   RuntimeSignal[],
  ): Promise<void> {
    if (signals.length === 0) return;

    // timeframe が Prisma enum に変換可能かチェック
    if (!VALID_TF.has(timeframe)) {
      this.logger.warn(
        `[PatternDetectionCapture] invalid timeframe "${timeframe}" → skip`,
      );
      return;
    }

    const tf  = timeframe as Timeframe;
    const now = new Date();

    try {
      for (const sig of signals) {
        const sigMeta   = sig.meta as Record<string, unknown> | undefined;
        const patternKey = (sigMeta?.['pattern'] as string | undefined) ?? '';
        const mapped    = PATTERN_META[patternKey];

        if (!mapped) {
          // 未マッピングのパターンはスキップ（warn のみ）
          this.logger.warn(
            `[PatternDetectionCapture] unknown pattern key "${patternKey}" → skip`,
          );
          continue;
        }

        // barIndex: detector が headIdx / rightIdx / peakIdx 等を meta に格納する
        const barIndex =
          (sigMeta?.['headIdx']  as number | undefined) ??
          (sigMeta?.['rightIdx'] as number | undefined) ??
          (sigMeta?.['peakIdx']  as number | undefined) ??
          0;

        await this.prisma.patternDetection.create({
          data: {
            userId,
            symbol,
            timeframe:       tf,
            patternName:     mapped.patternName,
            patternCategory: mapped.patternCategory,
            direction:       sig.direction ?? 'NEUTRAL',
            confidence:      sig.confidence ?? 0.5,
            detectedAt:      sig.timestamp ? new Date(sig.timestamp) : now,
            barIndex,
            price:           sig.price ?? 0,
            label:           sig.label,
          },
        });
      }

      this.logger.debug(
        `[PatternDetectionCapture] saved ${signals.length} pattern detection(s) ` +
        `for ${symbol}/${timeframe} userId=${userId}`,
      );
    } catch (err) {
      this.logger.warn(
        `[PatternDetectionCapture] failed for ${symbol}/${timeframe}: ${String(err)}`,
      );
    }
  }
}