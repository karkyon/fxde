/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern-engine.adapter.ts
 *
 * Auto Chart Pattern Engine — pattern detection adapter
 *
 * 検出対象:
 *   - Head and Shoulders / Inverse Head and Shoulders
 *   - Double Top / Double Bottom
 *   - Triangle (Ascending / Descending / Symmetrical)
 *   - Channel (Up / Down / Horizontal)
 *
 * 出力:
 *   overlays: line(ネックライン/トレンドライン) / box(チャネル帯) / marker(頭・肩・頂点)
 *   signals:  ブレイク方向（BUY/SELL）
 *   indicators: 検出パターン数サマリー
 *
 * Reliability Engine 連携:
 *   PluginEventCaptureService.captureSignalEvents() が coordinator で自動呼び出しされるため
 *   このアダプタは追加実装不要。
 */

import type { PluginExecutionContext, PluginRawOutput, Candle } from '../types/plugin-execution-context';

const PLUGIN_KEY = 'auto-chart-pattern-engine';

// ── ユーティリティ ───────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** ピーク/トラフ検出（左右 lookback 本より高い/低い点） */
function findPeaks(candles: Candle[], lookback = 3): number[] {
  const peaks: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    let isPeak = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= h) { isPeak = false; break; }
    }
    if (isPeak) peaks.push(i);
  }
  return peaks;
}

function findTroughs(candles: Candle[], lookback = 3): number[] {
  const troughs: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const l = candles[i].low;
    let isTrough = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= l) { isTrough = false; break; }
    }
    if (isTrough) troughs.push(i);
  }
  return troughs;
}

/** 直線の傾き（point1 → point2） */
function slope(x1: number, y1: number, x2: number, y2: number): number {
  return x2 === x1 ? 0 : (y2 - y1) / (x2 - x1);
}

// ── Head and Shoulders / Inverse ────────────────────────────────────────────

function detectHeadAndShoulders(
  candles: Candle[],
  peaks: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (peaks.length < 3) return { overlays, signals };

  for (let i = 0; i < peaks.length - 2; i++) {
    const lShI = peaks[i];
    const headI = peaks[i + 1];
    const rShI  = peaks[i + 2];

    const lSh  = candles[lShI].high;
    const head = candles[headI].high;
    const rSh  = candles[rShI].high;

    // 頭が両肩より有意に高い (>= 0.2% higher)
    if (head <= lSh * 1.002 || head <= rSh * 1.002) continue;
    // 両肩の高さが近い (within 1.5%)
    if (Math.abs(lSh - rSh) / Math.max(lSh, rSh) > 0.015) continue;
    // 間隔が十分（最低5本以上離れている）
    if (headI - lShI < 5 || rShI - headI < 5) continue;

    // ネックライン: 左肩後のトラフ と 右肩前のトラフ の平均
    const neckY = (candles[lShI].low + candles[rShI].low) / 2;

    // marker: 左肩・頭・右肩
    overlays.push({
      id: `${PLUGIN_KEY}-hs-lsh-${lShI}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'L.Sh', visible: true, priority: 20,
      style: { color: '#E05252' },
      geometry: { time: candles[lShI].time, price: lSh, shape: 'triangle_down' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-hs-head-${headI}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'Head', visible: true, priority: 21,
      style: { color: '#E05252' },
      geometry: { time: candles[headI].time, price: head, shape: 'triangle_down' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-hs-rsh-${rShI}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'R.Sh', visible: true, priority: 20,
      style: { color: '#E05252' },
      geometry: { time: candles[rShI].time, price: rSh, shape: 'triangle_down' },
    });
    // ネックライン（水平線）
    overlays.push({
      id: `${PLUGIN_KEY}-hs-neck-${headI}`, pluginKey: PLUGIN_KEY,
      kind: 'line', label: 'Neckline', visible: true, priority: 22,
      style: { color: '#E05252', lineStyle: 'dashed', lineWidth: 1 },
      geometry: { price: round4(neckY) },
    });

    signals.push({
      id:        `${PLUGIN_KEY}-hs-signal-${headI}`,
      pluginKey: PLUGIN_KEY,
      label:     'Head & Shoulders',
      direction: 'SELL' as const,
      confidence: 0.70,
      timestamp: candles[rShI].time,
      price:     round4(neckY),
      meta: { pattern: 'head_and_shoulders', headIdx: headI },
    });

    // 1件検出で十分
    break;
  }
  return { overlays, signals };
}

function detectInverseHeadAndShoulders(
  candles: Candle[],
  troughs: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (troughs.length < 3) return { overlays, signals };

  for (let i = 0; i < troughs.length - 2; i++) {
    const lShI  = troughs[i];
    const headI = troughs[i + 1];
    const rShI  = troughs[i + 2];

    const lSh  = candles[lShI].low;
    const head = candles[headI].low;
    const rSh  = candles[rShI].low;

    if (head >= lSh * 0.998 || head >= rSh * 0.998) continue;
    if (Math.abs(lSh - rSh) / Math.min(lSh, rSh) > 0.015) continue;
    if (headI - lShI < 5 || rShI - headI < 5) continue;

    const neckY = (candles[lShI].high + candles[rShI].high) / 2;

    overlays.push({
      id: `${PLUGIN_KEY}-ihs-lsh-${lShI}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'L.Sh', visible: true, priority: 20,
      style: { color: '#2EC96A' },
      geometry: { time: candles[lShI].time, price: lSh, shape: 'triangle_up' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-ihs-head-${headI}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'Head', visible: true, priority: 21,
      style: { color: '#2EC96A' },
      geometry: { time: candles[headI].time, price: head, shape: 'triangle_up' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-ihs-rsh-${rShI}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'R.Sh', visible: true, priority: 20,
      style: { color: '#2EC96A' },
      geometry: { time: candles[rShI].time, price: rSh, shape: 'triangle_up' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-ihs-neck-${headI}`, pluginKey: PLUGIN_KEY,
      kind: 'line', label: 'Neckline', visible: true, priority: 22,
      style: { color: '#2EC96A', lineStyle: 'dashed', lineWidth: 1 },
      geometry: { price: round4(neckY) },
    });

    signals.push({
      id:        `${PLUGIN_KEY}-ihs-signal-${headI}`,
      pluginKey: PLUGIN_KEY,
      label:     'Inv. Head & Shoulders',
      direction: 'BUY' as const,
      confidence: 0.70,
      timestamp: candles[rShI].time,
      price:     round4(neckY),
      meta: { pattern: 'inverse_head_and_shoulders', headIdx: headI },
    });

    break;
  }
  return { overlays, signals };
}

// ── Double Top / Double Bottom ────────────────────────────────────────────────

function detectDoubleTop(
  candles: Candle[],
  peaks: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (peaks.length < 2) return { overlays, signals };

  for (let i = 0; i < peaks.length - 1; i++) {
    const p1I = peaks[i];
    const p2I = peaks[i + 1];
    const p1  = candles[p1I].high;
    const p2  = candles[p2I].high;

    // 2頂点の高さが近い (within 0.8%)
    if (Math.abs(p1 - p2) / Math.max(p1, p2) > 0.008) continue;
    // 間隔: 8〜40本
    const gap = p2I - p1I;
    if (gap < 8 || gap > 40) continue;

    const topY = (p1 + p2) / 2;
    // ネックライン: 2頂点間の最安値
    let neckY = Infinity;
    for (let j = p1I; j <= p2I; j++) {
      if (candles[j].low < neckY) neckY = candles[j].low;
    }

    overlays.push({
      id: `${PLUGIN_KEY}-dt-p1-${p1I}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'Top', visible: true, priority: 20,
      style: { color: '#E05252' },
      geometry: { time: candles[p1I].time, price: round4(p1), shape: 'diamond' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-dt-p2-${p2I}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'Top', visible: true, priority: 20,
      style: { color: '#E05252' },
      geometry: { time: candles[p2I].time, price: round4(p2), shape: 'diamond' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-dt-resist-${p1I}`, pluginKey: PLUGIN_KEY,
      kind: 'line', label: 'Resistance', visible: true, priority: 21,
      style: { color: '#E05252', lineStyle: 'dashed', lineWidth: 1 },
      geometry: { price: round4(topY) },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-dt-neck-${p1I}`, pluginKey: PLUGIN_KEY,
      kind: 'line', label: 'Neckline', visible: true, priority: 22,
      style: { color: '#E8B830', lineStyle: 'dotted', lineWidth: 1 },
      geometry: { price: round4(neckY) },
    });

    signals.push({
      id:        `${PLUGIN_KEY}-dt-signal-${p2I}`,
      pluginKey: PLUGIN_KEY,
      label:     'Double Top',
      direction: 'SELL' as const,
      confidence: 0.65,
      timestamp: candles[p2I].time,
      price:     round4(neckY),
      meta: { pattern: 'double_top' },
    });
    break;
  }
  return { overlays, signals };
}

function detectDoubleBottom(
  candles: Candle[],
  troughs: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (troughs.length < 2) return { overlays, signals };

  for (let i = 0; i < troughs.length - 1; i++) {
    const t1I = troughs[i];
    const t2I = troughs[i + 1];
    const t1  = candles[t1I].low;
    const t2  = candles[t2I].low;

    if (Math.abs(t1 - t2) / Math.min(t1, t2) > 0.008) continue;
    const gap = t2I - t1I;
    if (gap < 8 || gap > 40) continue;

    const botY = (t1 + t2) / 2;
    let neckY = -Infinity;
    for (let j = t1I; j <= t2I; j++) {
      if (candles[j].high > neckY) neckY = candles[j].high;
    }

    overlays.push({
      id: `${PLUGIN_KEY}-db-t1-${t1I}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'Bot', visible: true, priority: 20,
      style: { color: '#2EC96A' },
      geometry: { time: candles[t1I].time, price: round4(t1), shape: 'diamond' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-db-t2-${t2I}`, pluginKey: PLUGIN_KEY,
      kind: 'marker', label: 'Bot', visible: true, priority: 20,
      style: { color: '#2EC96A' },
      geometry: { time: candles[t2I].time, price: round4(t2), shape: 'diamond' },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-db-support-${t1I}`, pluginKey: PLUGIN_KEY,
      kind: 'line', label: 'Support', visible: true, priority: 21,
      style: { color: '#2EC96A', lineStyle: 'dashed', lineWidth: 1 },
      geometry: { price: round4(botY) },
    });
    overlays.push({
      id: `${PLUGIN_KEY}-db-neck-${t1I}`, pluginKey: PLUGIN_KEY,
      kind: 'line', label: 'Neckline', visible: true, priority: 22,
      style: { color: '#E8B830', lineStyle: 'dotted', lineWidth: 1 },
      geometry: { price: round4(neckY) },
    });

    signals.push({
      id:        `${PLUGIN_KEY}-db-signal-${t2I}`,
      pluginKey: PLUGIN_KEY,
      label:     'Double Bottom',
      direction: 'BUY' as const,
      confidence: 0.65,
      timestamp: candles[t2I].time,
      price:     round4(neckY),
      meta: { pattern: 'double_bottom' },
    });
    break;
  }
  return { overlays, signals };
}

// ── Triangle ─────────────────────────────────────────────────────────────────

function detectTriangle(
  candles: Candle[],
  peaks: number[],
  troughs: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];

  // 直近のピーク/トラフを最低2点ずつ使用
  if (peaks.length < 2 || troughs.length < 2) return { overlays, signals };

  const rPeaks   = peaks.slice(-2);
  const rTroughs = troughs.slice(-2);

  const p1I = rPeaks[0];   const p2I = rPeaks[1];
  const t1I = rTroughs[0]; const t2I = rTroughs[1];

  const p1H = candles[p1I].high; const p2H = candles[p2I].high;
  const t1L = candles[t1I].low;  const t2L = candles[t2I].low;

  const upperSlope = slope(p1I, p1H, p2I, p2H);
  const lowerSlope = slope(t1I, t1L, t2I, t2L);

  const upperDescent = p2H < p1H * 0.999;
  const lowerAscent  = t2L > t1L * 1.001;
  const upperFlat    = Math.abs(p2H - p1H) / p1H < 0.003;
  const lowerFlat    = Math.abs(t2L - t1L) / t1L < 0.003;

  let triangleType: 'ascending' | 'descending' | 'symmetrical' | null = null;
  if (upperFlat && lowerAscent)   triangleType = 'ascending';
  else if (lowerFlat && upperDescent) triangleType = 'descending';
  else if (upperDescent && lowerAscent) triangleType = 'symmetrical';

  if (!triangleType) return { overlays, signals };

  const lastI = candles.length - 1;

  // 収束点の x 座標（直線の交点）
  // upper: y = p1H + upperSlope*(x - p1I)
  // lower: y = t1L + lowerSlope*(x - t1I)
  let apexI = lastI + 10;
  if (Math.abs(upperSlope - lowerSlope) > 0.000001) {
    apexI = Math.round(
      (t1L - p1H + upperSlope * p1I - lowerSlope * t1I) / (upperSlope - lowerSlope),
    );
  }
  const apexX = Math.min(apexI, lastI + 20);

  const upperY1 = round4(p1H);
  const upperY2 = round4(p1H + upperSlope * (apexX - p1I));
  const lowerY1 = round4(t1L);
  const lowerY2 = round4(t1L + lowerSlope * (apexX - t1I));

  const color = triangleType === 'ascending'   ? '#2EC96A'
              : triangleType === 'descending'  ? '#E05252'
              : '#E8B830';

  const signalDir = triangleType === 'ascending'  ? 'BUY'
                  : triangleType === 'descending' ? 'SELL'
                  : 'NEUTRAL' as const;

  overlays.push({
    id: `${PLUGIN_KEY}-tri-upper-${p1I}`, pluginKey: PLUGIN_KEY,
    kind: 'line', label: `${triangleType} tri`, visible: true, priority: 15,
    style: { color, lineStyle: 'dashed', lineWidth: 1 },
    geometry: {
      x1Time: candles[p1I].time,  y1: upperY1,
      x2Time: candles[Math.min(apexX, lastI)].time, y2: upperY2,
    },
  });
  overlays.push({
    id: `${PLUGIN_KEY}-tri-lower-${t1I}`, pluginKey: PLUGIN_KEY,
    kind: 'line', label: '', visible: true, priority: 15,
    style: { color, lineStyle: 'dashed', lineWidth: 1 },
    geometry: {
      x1Time: candles[t1I].time,  y1: lowerY1,
      x2Time: candles[Math.min(apexX, lastI)].time, y2: lowerY2,
    },
  });

  if (signalDir !== 'NEUTRAL') {
    signals.push({
      id:        `${PLUGIN_KEY}-tri-signal-${lastI}`,
      pluginKey: PLUGIN_KEY,
      label:     `${triangleType.charAt(0).toUpperCase()}${triangleType.slice(1)} Triangle`,
      direction: signalDir,
      confidence: 0.58,
      timestamp: candles[lastI].time,
      price:     round4((candles[lastI].high + candles[lastI].low) / 2),
      meta: { pattern: `triangle_${triangleType}` },
    });
  }

  return { overlays, signals };
}

// ── Channel ───────────────────────────────────────────────────────────────────

function detectChannel(
  candles: Candle[],
  peaks: number[],
  troughs: number[],
): { overlays: unknown[] } {
  const overlays: unknown[] = [];
  if (peaks.length < 2 || troughs.length < 2) return { overlays };

  const rPeaks   = peaks.slice(-3);
  const rTroughs = troughs.slice(-3);

  const p1I = rPeaks[0];   const p2I = rPeaks[rPeaks.length - 1];
  const t1I = rTroughs[0]; const t2I = rTroughs[rTroughs.length - 1];

  const upperSlope = slope(p1I, candles[p1I].high, p2I, candles[p2I].high);
  const lowerSlope = slope(t1I, candles[t1I].low,  t2I, candles[t2I].low);

  // 上下の傾きが平行に近い (差が小さい)
  const slopeDiff = Math.abs(upperSlope - lowerSlope);
  const avgPrice  = (candles[p1I].high + candles[t1I].low) / 2;
  if (slopeDiff / (avgPrice || 1) > 0.0005) return { overlays };

  const lastI = candles.length - 1;
  const channelDir = upperSlope > 0.0001 ? 'up'
                   : upperSlope < -0.0001 ? 'down'
                   : 'horizontal';
  const color = channelDir === 'up'   ? '#2EC96A'
              : channelDir === 'down' ? '#E05252'
              : '#94a3b8';

  const upperEnd = round4(candles[p1I].high + upperSlope * (lastI - p1I));
  const lowerEnd = round4(candles[t1I].low  + lowerSlope * (lastI - t1I));

  overlays.push({
    id: `${PLUGIN_KEY}-ch-upper-${p1I}`, pluginKey: PLUGIN_KEY,
    kind: 'line', label: `${channelDir} channel`, visible: true, priority: 10,
    style: { color, lineStyle: 'solid', lineWidth: 1.5, opacity: 0.7 },
    geometry: {
      x1Time: candles[p1I].time, y1: round4(candles[p1I].high),
      x2Time: candles[lastI].time, y2: upperEnd,
    },
  });
  overlays.push({
    id: `${PLUGIN_KEY}-ch-lower-${t1I}`, pluginKey: PLUGIN_KEY,
    kind: 'line', label: '', visible: true, priority: 10,
    style: { color, lineStyle: 'solid', lineWidth: 1.5, opacity: 0.7 },
    geometry: {
      x1Time: candles[t1I].time, y1: round4(candles[t1I].low),
      x2Time: candles[lastI].time, y2: lowerEnd,
    },
  });

  return { overlays };
}

// ── メインエントリポイント ────────────────────────────────────────────────────

export async function executeAutoChartPatternEngine(
  ctx: PluginExecutionContext,
): Promise<PluginRawOutput> {
  const candles = ctx.candles ?? [];

  // 最低 30 本必要
  if (candles.length < 30) {
    return { overlays: [], signals: [], indicators: [] };
  }

  // 直近 80 本で検出（パフォーマンス考慮）
  const slice = candles.slice(-80);

  const peaks   = findPeaks(slice, 3);
  const troughs = findTroughs(slice, 3);

  const allOverlays: unknown[] = [];
  const allSignals:  unknown[] = [];

  // 各パターン検出（最初に見つかった1件を採用）
  const hs  = detectHeadAndShoulders(slice, peaks);
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

  const tri = detectTriangle(slice, peaks, troughs);
  allOverlays.push(...tri.overlays);
  allSignals.push(...tri.signals);

  const ch = detectChannel(slice, peaks, troughs);
  allOverlays.push(...ch.overlays);

  // indicator: 検出パターン数サマリー
  const patternCount = allSignals.length;
  const indicators: unknown[] = [
    {
      id:        `${PLUGIN_KEY}-pattern-count`,
      pluginKey: PLUGIN_KEY,
      label:     'Patterns',
      value:     patternCount,
      status:    patternCount > 0 ? 'info' : 'neutral',
      meta:      { detectedPatterns: allSignals.map((s: unknown) => (s as Record<string, unknown>)['label']) },
    },
  ];

  return { overlays: allOverlays, signals: allSignals, indicators };
}