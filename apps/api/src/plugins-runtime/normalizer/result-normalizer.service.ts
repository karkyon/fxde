/**
 * apps/api/src/plugins-runtime/normalizer/result-normalizer.service.ts
 */

import { Injectable } from '@nestjs/common';
import type {
  RuntimeOverlay,
  RuntimeSignal,
  RuntimeIndicator,
} from '@fxde/types';
import type { PluginRawOutput } from '../types/plugin-execution-context';

@Injectable()
export class ResultNormalizerService {
  normalize(
    pluginKey: string,
    raw: PluginRawOutput,
  ): {
    overlays:   RuntimeOverlay[];
    signals:    RuntimeSignal[];
    indicators: RuntimeIndicator[];
  } {
    return {
      overlays:   this._normalizeOverlays(pluginKey, raw.overlays ?? []),
      signals:    this._normalizeSignals(pluginKey, raw.signals ?? []),
      indicators: this._normalizeIndicators(pluginKey, raw.indicators ?? []),
    };
  }

  private _normalizeOverlays(pluginKey: string, items: unknown[]): RuntimeOverlay[] {
    const result: RuntimeOverlay[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (typeof item !== 'object' || item === null) continue;
      const o = item as Record<string, unknown>;
      result.push({
        id:        (o['id'] as string) ?? `${pluginKey}-overlay-${i}`,
        pluginKey,
        kind:      ((o['kind'] as RuntimeOverlay['kind']) ?? 'zone'),
        label:     (o['label'] as string) ?? '',
        visible:   (o['visible'] as boolean) ?? true,
        priority:  (o['priority'] as number) ?? 0,
        style:     o['style'] as RuntimeOverlay['style'],
        geometry:  (o['geometry'] as Record<string, unknown>) ?? {},
        meta:      o['meta'] as Record<string, unknown> | undefined,
      });
    }
    return result;
  }

  private _normalizeSignals(pluginKey: string, items: unknown[]): RuntimeSignal[] {
    const result: RuntimeSignal[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (typeof item !== 'object' || item === null) continue;
      const s = item as Record<string, unknown>;
      result.push({
        id:         (s['id'] as string) ?? `${pluginKey}-signal-${i}`,
        pluginKey,
        label:      (s['label'] as string) ?? '',
        direction:  (s['direction'] as RuntimeSignal['direction']) ?? 'NEUTRAL',
        confidence: (s['confidence'] as number | null) ?? null,
        timestamp:  (s['timestamp'] as string | null) ?? null,
        price:      (s['price'] as number | null) ?? null,
        meta:       s['meta'] as Record<string, unknown> | undefined,
      });
    }
    return result;
  }

  private _normalizeIndicators(pluginKey: string, items: unknown[]): RuntimeIndicator[] {
    const result: RuntimeIndicator[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (typeof item !== 'object' || item === null) continue;
      const ind = item as Record<string, unknown>;
      result.push({
        id:        (ind['id'] as string) ?? `${pluginKey}-indicator-${i}`,
        pluginKey,
        label:     (ind['label'] as string) ?? '',
        value:     (ind['value'] as string | number | boolean | null) ?? null,
        status:    (ind['status'] as RuntimeIndicator['status']) ?? 'neutral',
        meta:      ind['meta'] as Record<string, unknown> | undefined,
      });
    }
    return result;
  }
}