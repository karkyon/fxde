/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern/pattern-engine.service.ts
 *
 * Pattern Engine — detector orchestration
 *
 * 責務:
 *   - swing.util を使って peaks / troughs を導出
 *   - 各 detector を順次呼び出し
 *   - overlays / signals / indicators を集約して返す
 *
 * 設計方針:
 *   - 純関数ベース（class / NestJS provider 化なし）
 *   - Elliott Wave / backtest / statistics は実装しない
 *   - adapter から 1 回呼ばれる orchestration 関数のみを export
 */

import type { Candle } from '../../types/plugin-execution-context';
import { findPeaks, findTroughs }                         from './swing.util';
import { detectHeadAndShoulders, detectInverseHeadAndShoulders } from './head-shoulders.detector';
import { detectDoubleTop }                                from './double-top.detector';
import { detectDoubleBottom }                             from './double-bottom.detector';
import { detectTriangle }                                 from './triangle.detector';
import { detectChannel }                                  from './channel.detector';

const PLUGIN_KEY = 'auto-chart-pattern-engine';
const SLICE_SIZE  = 80;
const LOOKBACK    = 3;

export interface PatternEngineResult {
  overlays:   unknown[];
  signals:    unknown[];
  indicators: unknown[];
}

/**
 * candles を受け取り、全 detector を実行して結果を集約する。
 *
 * @param candles  生 Candle 配列（slice 前の全件）
 * @returns        overlays / signals / indicators
 */
export function runAutoChartPatternDetectors(
  candles: Candle[],
): PatternEngineResult {
  const slice   = candles.slice(-SLICE_SIZE);
  const peaks   = findPeaks(slice, LOOKBACK);
  const troughs = findTroughs(slice, LOOKBACK);

  const allOverlays: unknown[] = [];
  const allSignals:  unknown[] = [];

  // ── Head & Shoulders / Inverse（優先度高）────────────────────────────────
  const hs = detectHeadAndShoulders(slice, peaks);
  if (hs.signals.length > 0) {
    allOverlays.push(...hs.overlays);
    allSignals.push(...hs.signals);
  } else {
    const ihs = detectInverseHeadAndShoulders(slice, troughs);
    if (ihs.signals.length > 0) {
      allOverlays.push(...ihs.overlays);
      allSignals.push(...ihs.signals);
    }
  }

  // ── Double Top / Double Bottom ────────────────────────────────────────────
  const dt = detectDoubleTop(slice, peaks);
  if (dt.signals.length > 0) {
    allOverlays.push(...dt.overlays);
    allSignals.push(...dt.signals);
  } else {
    const db = detectDoubleBottom(slice, troughs);
    if (db.signals.length > 0) {
      allOverlays.push(...db.overlays);
      allSignals.push(...db.signals);
    }
  }

  // ── Triangle ──────────────────────────────────────────────────────────────
  const tri = detectTriangle(slice, peaks, troughs);
  allOverlays.push(...tri.overlays);
  allSignals.push(...tri.signals);

  // ── Channel（overlays のみ・signal なし）────────────────────────────────
  const ch = detectChannel(slice, peaks, troughs);
  allOverlays.push(...ch.overlays);

  // ── indicators: 検出パターン数サマリー ───────────────────────────────────
  const patternCount = allSignals.length;
  const indicators: unknown[] = [
    {
      id:        `${PLUGIN_KEY}-pattern-count`,
      pluginKey: PLUGIN_KEY,
      label:     'Patterns',
      value:     patternCount,
      status:    patternCount > 0 ? 'info' : 'neutral',
      meta:      {
        detectedPatterns: allSignals.map(
          (s) => (s as Record<string, unknown>)['label'],
        ),
      },
    },
  ];

  return { overlays: allOverlays, signals: allSignals, indicators };
}