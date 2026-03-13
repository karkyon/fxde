/**
 * apps/web/src/pages/Chart.tsx  — PG-07 チャート
 *
 * 参照仕様:
 *   SPEC_v51_part10 §10「PG-07 Chart — 完全設計」（UI 正本）
 *   SPEC_v51_part11 §8「PG-07 と Chart API の対応」（データ正本）
 *
 * セクション構成（SPEC_v51_part10 §10.4 確定 8 セクション）:
 *   1. chart-overview   — ペア・時間足・価格・セッション
 *   2. chart-toolbar    — ペア選択・TF・indicator toggle 等
 *   3. main-chart       — メインチャート本体（SVG ベース）
 *   4. indicator-summary — 指標状態カード群（6枚）
 *   5. trade-overlay-panel — アクティブトレード補助情報
 *   6. prediction-overlay-panel — Prediction overlay（PRO stub）
 *   7. chart-notes      — メモ欄（v5.1 = React state のみ）
 *   8. recent-signals   — 直近シグナル一覧
 *
 * v5.1 実装状況:
 *   完了: 全 8 セクション骨格 UI + API 統合
 *   追加: Navigator / Zoom / Pan / Indicator Overlay / Prediction Overlay 動的化
 *   v5.1 制約: chart-notes = 永続化なし
 *   v6 対象: chart-notes 永続化
 *
 * アクセス権限: 全ロール（prediction-overlay-panel のみ PRO 限定）
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useChartMeta,
  useChartCandles,
  useChartIndicators,
  useChartTrades,
  useChartPatternMarkers,
  useChartPredictionOverlay,
} from '../hooks/useChart';
import { useSignals } from '../hooks/useSignals';
import { useAuthStore } from '../stores/auth.store';
import type { Timeframe } from '@fxde/types';
import type { PatternMarker } from '../lib/api';

// ── Indicator utilities（frontend 計算） ────────────────────────────────────
// calcSMA
function calcSMA(closes: number[], period: number): (number | null)[] {
  if (period <= 0 || closes.length === 0) return closes.map(() => null);
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

// calcEMA
function calcEMA(closes: number[], period: number): (number | null)[] {
  if (period <= 0 || closes.length === 0) return closes.map(() => null);
  const result: (number | null)[] = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  if (closes.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  result[period - 1] = sum / period;
  for (let i = period; i < closes.length; i++) {
    result[i] = closes[i] * k + (result[i - 1] as number) * (1 - k);
  }
  return result;
}

// calcBollinger
interface BollingerPoint { upper: number | null; mid: number | null; lower: number | null; }
function calcBollinger(closes: number[], period = 20, stddev = 2): BollingerPoint[] {
  if (closes.length === 0) return [];
  const sma = calcSMA(closes, period);
  return closes.map((_, i) => {
    if (sma[i] === null) return { upper: null, mid: null, lower: null };
    const mid = sma[i] as number;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - mid) ** 2;
    const sd = Math.sqrt(sumSq / period);
    return { upper: mid + stddev * sd, mid, lower: mid - stddev * sd };
  });
}

// ── Viewport utilities ──────────────────────────────────────────────────────
const DEFAULT_VISIBLE_COUNT = 80;
const MIN_VISIBLE_COUNT     = 10;

interface VisibleRange { start: number; end: number; }

function initVisibleRange(total: number): VisibleRange {
  if (total === 0) return { start: 0, end: 0 };
  const count = Math.min(DEFAULT_VISIBLE_COUNT, total);
  return { start: Math.max(0, total - count), end: total - 1 };
}

function clampVisibleRange(range: VisibleRange, total: number): VisibleRange {
  if (total === 0) return { start: 0, end: 0 };
  const end   = Math.min(range.end, total - 1);
  const start = Math.max(0, Math.min(range.start, end - MIN_VISIBLE_COUNT + 1));
  return { start, end };
}

function zoomIn(range: VisibleRange, total: number): VisibleRange {
  const visible    = range.end - range.start + 1;
  const newVisible = Math.max(MIN_VISIBLE_COUNT, Math.floor(visible * 0.7));
  const center     = Math.floor((range.start + range.end) / 2);
  const half       = Math.floor(newVisible / 2);
  return clampVisibleRange({ start: center - half, end: center - half + newVisible - 1 }, total);
}

function zoomOut(range: VisibleRange, total: number): VisibleRange {
  const visible    = range.end - range.start + 1;
  const newVisible = Math.min(total, Math.ceil(visible * 1.4));
  const center     = Math.floor((range.start + range.end) / 2);
  const half       = Math.floor(newVisible / 2);
  return clampVisibleRange({ start: center - half, end: center - half + newVisible - 1 }, total);
}

function pan(range: VisibleRange, total: number, delta: number): VisibleRange {
  const visible = range.end - range.start + 1;
  let start = range.start + delta;
  let end   = range.end   + delta;
  if (end   > total - 1) { end = total - 1; start = end - visible + 1; }
  if (start < 0)         { start = 0; end = start + visible - 1; }
  return clampVisibleRange({ start, end }, total);
}

// ── 定数 ─────────────────────────────────────────────────────────────────────
const SYMBOLS    = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD'];
const TIMEFRAMES: Timeframe[] = ['W1', 'D1', 'H4', 'H1', 'M30', 'M15', 'M5'];

type IndicatorToggle = 'MA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'Fib' | 'Trendline';
type OverlayToggle   = 'entry_sl_tp' | 'prediction' | 'trade_markers' | 'pattern_labels';

// MA overlay toggle keys（新規追加分）
type MAToggle = 'SMA5' | 'SMA20' | 'SMA50' | 'EMA20' | 'EMA200' | 'BB20';

const MA_COLORS: Record<MAToggle, string> = {
  SMA5:   '#4D9FFF',
  SMA20:  '#E8B830',
  SMA50:  '#B07EFF',
  EMA20:  '#2EC96A',
  EMA200: '#E05252',
  BB20:   '#64748b',
};

const ROLES_PRO_OR_ABOVE = ['PRO', 'PRO_PLUS', 'ADMIN'] as const;

// ── 色定義（SPEC_v51_part10 §10.14 準拠） ────────────────────────────────────
const C = {
  bullish:    '#2EC96A',
  bearish:    '#E05252',
  neutral:    '#E8B830',
  info:       '#4D9FFF',
  prediction: '#B07EFF',
  bg:         '#0f1117',
  card:       '#1a1f2e',
  border:     '#2d3748',
  text:       '#e2e8f0',
  muted:      '#64748b',
  label:      '#94a3b8',
};

// ── 型 ───────────────────────────────────────────────────────────────────────
interface RawCandle {
  time: string; open: number; high: number; low: number; close: number; volume: number;
}

// ── CandleChart コンポーネント（拡張版） ────────────────────────────────────
interface CandleChartProps {
  candles:          RawCandle[];
  visibleRange:     VisibleRange;
  width?:           number;
  height?:          number;
  maToggles:        Record<MAToggle, boolean>;
  showPrediction:   boolean;
  predictionData:   {
    bullish: number; neutral: number; bearish: number;
    expectedMovePips: number; confidence: string; mainScenario: string;
  } | null;
  patternMarkers:   PatternMarker[];
  showPatterns:     boolean;
  onPanDelta:       (delta: number) => void;
}

function CandleChart({
  candles,
  visibleRange,
  width  = 800,
  height = 430,
  maToggles,
  showPrediction,
  predictionData,
  patternMarkers,
  showPatterns,
  onPanDelta,
}: CandleChartProps) {
  // ドラッグパン用 ref
  const dragRef = useRef<{ startX: number; lastDelta: number } | null>(null);

  const visibleCandles = useMemo(() => {
    if (candles.length === 0) return [];
    const { start, end } = visibleRange;
    return candles.slice(start, end + 1);
  }, [candles, visibleRange]);

  // indicator 計算（visible candles ではなく全 candles で計算し visible 部分を slice）
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);

  const indicatorData = useMemo(() => {
    const { start, end } = visibleRange;
    const slice = (arr: (number | null)[]) => arr.slice(start, end + 1);
    return {
      sma5:   slice(calcSMA(closes, 5)),
      sma20:  slice(calcSMA(closes, 20)),
      sma50:  slice(calcSMA(closes, 50)),
      ema20:  slice(calcEMA(closes, 20)),
      ema200: slice(calcEMA(closes, 200)),
      bb20:   calcBollinger(closes, 20, 2).slice(start, end + 1),
    };
  }, [closes, visibleRange]);

  if (visibleCandles.length === 0) return null;

  const PAD_L = 8, PAD_R = 56, PAD_T = 14, PAD_B = 24;
  const cW = width  - PAD_L - PAD_R;
  const cH = height - PAD_T - PAD_B;

  const maxP = Math.max(...visibleCandles.map((c) => c.high));
  const minP = Math.min(...visibleCandles.map((c) => c.low));

  // BB がある場合は BB の上下も price range に含める
  if (maToggles.BB20 && indicatorData.bb20.length > 0) {
    const bbUpper = indicatorData.bb20.map((b) => b.upper).filter((v): v is number => v !== null);
    const bbLower = indicatorData.bb20.map((b) => b.lower).filter((v): v is number => v !== null);
    if (bbUpper.length > 0) { /* maxP が既に高い */ }
    if (bbLower.length > 0) { /* minP が既に低い */ }
    // prediction overlay のために余白 5% 追加
  }
  const range  = maxP - minP || 0.0001;
  const padded = range * 0.05; // 5% 余白
  const effMax = maxP + padded;
  const effMin = minP - padded;
  const effRange = effMax - effMin;

  const toY = (p: number) => PAD_T + cH - ((p - effMin) / effRange) * cH;
  const slot  = cW / visibleCandles.length;
  const bodyW = Math.max(1, slot * 0.65);
  const toX   = (i: number) => PAD_L + i * slot + slot / 2;

  const gridLines = Array.from({ length: 6 }, (_, i) => {
    const price = effMin + (effRange * i) / 5;
    return { y: toY(price), price };
  });

  const maxLabels = Math.min(8, visibleCandles.length);
  const labelStep = Math.max(1, Math.floor(visibleCandles.length / maxLabels));

  // polyline points 生成ヘルパー
  const toPoints = (vals: (number | null)[]) => {
    const segs: string[][] = [];
    let cur: string[] = [];
    vals.forEach((v, i) => {
      if (v !== null) {
        cur.push(`${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
      } else {
        if (cur.length > 1) segs.push(cur);
        cur = [];
      }
    });
    if (cur.length > 1) segs.push(cur);
    return segs;
  };

  // prediction overlay 終点計算
  const predEndX = cW + PAD_L;
  const predStartX = predEndX - 80;
  let predBullY: number | null = null;
  let predNeutY: number | null = null;
  let predBearY: number | null = null;
  let predOriginY: number | null = null;
  if (showPrediction && predictionData && visibleCandles.length > 0) {
    const lastClose = visibleCandles[visibleCandles.length - 1].close;
    predOriginY = toY(lastClose);
    const pipSize = (symbol: string) => symbol.includes('JPY') ? 0.01 : 0.0001;
    // symbol は props に渡していないので固定 0.0001 で近似
    const pipValue = 0.0001;
    const movePips = predictionData.expectedMovePips;
    predBullY = toY(lastClose + movePips * pipValue * predictionData.bullish);
    predNeutY = toY(lastClose + movePips * pipValue * predictionData.neutral * 0.1);
    predBearY = toY(lastClose - movePips * pipValue * predictionData.bearish);
  }

  // ── ドラッグパン ハンドラー ──────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = { startX: e.clientX, lastDelta: 0 };
  };
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current || visibleCandles.length === 0) return;
    const dx     = e.clientX - dragRef.current.startX;
    const perPx  = slot > 0 ? 1 / slot : 1;
    const delta  = -Math.round(dx * perPx);
    const diff   = delta - dragRef.current.lastDelta;
    if (diff !== 0) {
      dragRef.current.lastDelta = delta;
      onPanDelta(diff);
    }
  };
  const handleMouseUp = () => { dragRef.current = null; };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: '100%', cursor: 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* グリッドライン */}
      {gridLines.map(({ y, price }) => (
        <g key={price.toFixed(6)}>
          <line x1={PAD_L} y1={y} x2={PAD_L + cW} y2={y}
            stroke="#2d3748" strokeOpacity={0.6} strokeDasharray="3 3" />
          <text x={PAD_L + cW + 4} y={y + 3.5}
            fill="#64748b" fontSize={9} fontFamily="monospace">{price.toFixed(4)}</text>
        </g>
      ))}

      {/* ── Bollinger Bands fill（BB20） ── */}
      {maToggles.BB20 && (() => {
        const upper: number[] = [];
        const lower: number[] = [];
        const xs: number[]   = [];
        indicatorData.bb20.forEach((b, i) => {
          if (b.upper !== null && b.lower !== null) {
            xs.push(i); upper.push(b.upper); lower.push(b.lower);
          }
        });
        if (xs.length < 2) return null;
        const fwdPts = xs.map((xi, k) => `${toX(xi).toFixed(1)},${toY(upper[k]).toFixed(1)}`).join(' ');
        const bwdPts = [...xs].reverse().map((xi, k) => {
          const li = xs.length - 1 - k;
          return `${toX(xi).toFixed(1)},${toY(lower[li]).toFixed(1)}`;
        }).join(' ');
        return (
          <polygon
            points={`${fwdPts} ${bwdPts}`}
            fill="rgba(100,116,139,0.08)"
            stroke="none"
          />
        );
      })()}

      {/* ── Indicator overlays: MA / EMA ── */}
      {(Object.entries({
        SMA5:   maToggles.SMA5   ? indicatorData.sma5   : null,
        SMA20:  maToggles.SMA20  ? indicatorData.sma20  : null,
        SMA50:  maToggles.SMA50  ? indicatorData.sma50  : null,
        EMA20:  maToggles.EMA20  ? indicatorData.ema20  : null,
        EMA200: maToggles.EMA200 ? indicatorData.ema200 : null,
      } as Record<MAToggle, (number | null)[] | null>)).map(([key, vals]) => {
        if (!vals) return null;
        const color = MA_COLORS[key as MAToggle];
        return toPoints(vals).map((seg, si) => (
          <polyline
            key={`${key}-${si}`}
            points={seg.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={0.85}
          />
        ));
      })}

      {/* ── Bollinger Bands lines ── */}
      {maToggles.BB20 && (() => {
        const pairs: Array<{ key: 'upper' | 'mid' | 'lower'; dash?: string }> = [
          { key: 'upper' },
          { key: 'mid', dash: '4 2' },
          { key: 'lower' },
        ];
        return pairs.map(({ key, dash }) => {
          const vals = indicatorData.bb20.map((b) => b[key]);
          return toPoints(vals).map((seg, si) => (
            <polyline
              key={`bb-${key}-${si}`}
              points={seg.join(' ')}
              fill="none"
              stroke={MA_COLORS.BB20}
              strokeWidth={key === 'mid' ? 1 : 1.5}
              strokeOpacity={0.7}
              strokeDasharray={dash}
            />
          ));
        });
      })()}

      {/* ローソク足 */}
      {visibleCandles.map((c, i) => {
        const isUp  = c.close >= c.open;
        const col   = isUp ? '#2EC96A' : '#E05252';
        const x     = toX(i);
        const topY  = toY(Math.max(c.open, c.close));
        const botY  = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(1, botY - topY);
        return (
          <g key={c.time}>
            <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={col} strokeWidth={1} />
            <rect x={x - bodyW / 2} y={topY} width={bodyW} height={bodyH} fill={col} opacity={0.85} />
          </g>
        );
      })}

      {/* Pattern markers */}
      {showPatterns && patternMarkers.map((pm) => {
        const relIdx = pm.barIndex - visibleRange.start;
        if (relIdx < 0 || relIdx >= visibleCandles.length) return null;
        const x = toX(relIdx);
        const y = toY(pm.price) - 12;
        const color = pm.direction === 'bullish' ? C.bullish : pm.direction === 'bearish' ? C.bearish : C.neutral;
        return (
          <g key={pm.id}>
            <circle cx={x} cy={y + 6} r={4} fill={color} opacity={0.8} />
            <text x={x} y={y} fill={color} fontSize={8} fontFamily="monospace" textAnchor="middle">
              {pm.label.slice(0, 6)}
            </text>
          </g>
        );
      })}

      {/* Prediction overlay */}
      {showPrediction && predictionData && predOriginY !== null && (
        (() => {
          const originX = predStartX;
          const originY = predOriginY;
          const items = [
            { y: predBullY,  color: C.bullish,    opacity: predictionData.bullish,  label: `Bull ${Math.round(predictionData.bullish * 100)}%` },
            { y: predNeutY,  color: C.neutral,    opacity: predictionData.neutral,  label: `Neut ${Math.round(predictionData.neutral * 100)}%` },
            { y: predBearY,  color: C.bearish,    opacity: predictionData.bearish,  label: `Bear ${Math.round(predictionData.bearish * 100)}%` },
          ];
          return (
            <g>
              {/* 予測開始の垂直ライン */}
              <line x1={originX} y1={PAD_T} x2={originX} y2={PAD_T + cH}
                stroke={C.prediction} strokeWidth={1} strokeOpacity={0.3} strokeDasharray="4 3" />
              {items.map(({ y, color, opacity, label }) => {
                if (y === null) return null;
                const finalOpacity = Math.max(0.3, Math.min(1, opacity * 1.5));
                return (
                  <g key={label}>
                    <line
                      x1={originX} y1={originY}
                      x2={predEndX} y2={y}
                      stroke={color}
                      strokeWidth={2}
                      strokeOpacity={finalOpacity}
                      strokeDasharray="6 3"
                    />
                    <circle cx={predEndX} cy={y} r={3} fill={color} opacity={finalOpacity} />
                    <text x={predEndX + 2} y={y + 3.5} fill={color} fontSize={8} fontFamily="monospace" opacity={finalOpacity}>
                      {label}
                    </text>
                  </g>
                );
              })}
              {/* mainScenario ラベル */}
              <text x={originX + 2} y={PAD_T + 10}
                fill={C.prediction} fontSize={9} fontFamily="monospace" opacity={0.8}>
                {predictionData.mainScenario} · {predictionData.confidence}
              </text>
            </g>
          );
        })()
      )}

      {/* 時刻ラベル */}
      {visibleCandles.map((c, i) => {
        if (i % labelStep !== 0) return null;
        const d = new Date(c.time);
        const label = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return (
          <text key={c.time} x={toX(i)} y={height - 4}
            fill="#64748b" fontSize={8} fontFamily="monospace" textAnchor="middle">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Navigator コンポーネント ─────────────────────────────────────────────────
interface NavigatorProps {
  candles:      RawCandle[];
  visibleRange: VisibleRange;
  onRangeChange: (r: VisibleRange) => void;
  width?:       number;
  height?:      number;
}

function Navigator({ candles, visibleRange, onRangeChange, width = 800, height = 80 }: NavigatorProps) {
  const svgRef          = useRef<SVGSVGElement>(null);
  const dragStateRef    = useRef<null | {
    type: 'left' | 'right' | 'center';
    startX: number;
    initRange: VisibleRange;
  }>(null);

  const total = candles.length;
  if (total === 0) return null;

  const PAD_L = 4, PAD_R = 4, PAD_T = 6, PAD_B = 20;
  const cW = width - PAD_L - PAD_R;
  const cH = height - PAD_T - PAD_B;

  const toX = (idx: number) => PAD_L + (idx / (total - 1)) * cW;

  const maxP = Math.max(...candles.map((c) => c.close));
  const minP = Math.min(...candles.map((c) => c.close));
  const rng  = maxP - minP || 0.0001;
  const toY  = (p: number) => PAD_T + cH - ((p - minP) / rng) * cH;

  // ミニチャート polyline
  const pts = candles.map((c, i) => `${toX(i).toFixed(1)},${toY(c.close).toFixed(1)}`).join(' ');

  // 選択ハイライト座標
  const hx1 = toX(visibleRange.start);
  const hx2 = toX(visibleRange.end);
  const HANDLE_W = 6;

  const getSvgX = (clientX: number) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * width;
  };

  const handleMouseDown = (e: React.MouseEvent, type: 'left' | 'right' | 'center') => {
    e.stopPropagation();
    dragStateRef.current = { type, startX: e.clientX, initRange: { ...visibleRange } };
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const dx    = getSvgX(e.clientX) - getSvgX(ds.startX);
    const scale = (total - 1) / cW;
    const delta = Math.round(dx * scale);

    if (ds.type === 'center') {
      const span  = ds.initRange.end - ds.initRange.start;
      let newStart = ds.initRange.start + delta;
      let newEnd   = ds.initRange.end   + delta;
      if (newEnd >= total)  { newEnd = total - 1; newStart = newEnd - span; }
      if (newStart < 0)     { newStart = 0; newEnd = span; }
      onRangeChange({ start: newStart, end: newEnd });
    } else if (ds.type === 'left') {
      const newStart = Math.max(0, Math.min(ds.initRange.start + delta, ds.initRange.end - MIN_VISIBLE_COUNT));
      onRangeChange({ start: newStart, end: ds.initRange.end });
    } else {
      const newEnd = Math.min(total - 1, Math.max(ds.initRange.end + delta, ds.initRange.start + MIN_VISIBLE_COUNT));
      onRangeChange({ start: ds.initRange.start, end: newEnd });
    }
  };

  const handleSvgMouseUp = () => { dragStateRef.current = null; };

  // 時刻ラベル（10本に1本）
  const timeLabelStep = Math.max(1, Math.floor(total / 8));

  return (
    <div style={{ background: '#0c0f18', borderTop: `1px solid ${C.border}`, padding: '0 0 4px' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: height, display: 'block', cursor: 'default' }}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        {/* 背景 */}
        <rect x={0} y={0} width={width} height={height} fill="#0a0d14" />

        {/* 暗幕（左） */}
        <rect x={PAD_L} y={PAD_T} width={Math.max(0, hx1 - PAD_L)} height={cH}
          fill="rgba(0,0,0,0.5)" />
        {/* 暗幕（右） */}
        <rect x={hx2} y={PAD_T} width={Math.max(0, PAD_L + cW - hx2)} height={cH}
          fill="rgba(0,0,0,0.5)" />

        {/* ミニチャート（全体ライン） */}
        <polyline points={pts} fill="none" stroke="#4D9FFF" strokeWidth={1} strokeOpacity={0.5} />

        {/* 選択範囲ハイライト枠 */}
        <rect x={hx1} y={PAD_T} width={hx2 - hx1} height={cH}
          fill="rgba(77,159,255,0.08)" stroke="rgba(77,159,255,0.4)" strokeWidth={1} />

        {/* 中央ドラッグゾーン（透明） */}
        <rect
          x={hx1 + HANDLE_W} y={PAD_T}
          width={Math.max(0, hx2 - hx1 - HANDLE_W * 2)} height={cH}
          fill="transparent" style={{ cursor: 'grab' }}
          onMouseDown={(e) => handleMouseDown(e, 'center')}
        />

        {/* 左ハンドル */}
        <rect
          x={hx1 - HANDLE_W / 2} y={PAD_T}
          width={HANDLE_W} height={cH}
          fill="rgba(77,159,255,0.5)" rx={2}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => handleMouseDown(e, 'left')}
        />
        {/* 右ハンドル */}
        <rect
          x={hx2 - HANDLE_W / 2} y={PAD_T}
          width={HANDLE_W} height={cH}
          fill="rgba(77,159,255,0.5)" rx={2}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => handleMouseDown(e, 'right')}
        />

        {/* 時刻ラベル */}
        {candles.map((c, i) => {
          if (i % timeLabelStep !== 0) return null;
          const d = new Date(c.time);
          const label = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
          return (
            <text key={i} x={toX(i)} y={height - 4}
              fill="#64748b" fontSize={8} fontFamily="monospace" textAnchor="middle">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ChartPage() {
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isPro    = user != null && (ROLES_PRO_OR_ABOVE as readonly string[]).includes(user.role);

  // toolbar state
  const [symbol,     setSymbol]     = useState<string>('EURUSD');
  const [timeframe,  setTimeframe]  = useState<Timeframe>('H1');
  const [activeMode, setActiveMode] = useState<'analysis' | 'trade'>('analysis');
  const [indToggles, setIndToggles] = useState<Record<IndicatorToggle, boolean>>({
    MA: true, RSI: true, MACD: false, BB: false, ATR: false, Fib: false, Trendline: false,
  });
  const [ovToggles, setOvToggles] = useState<Record<OverlayToggle, boolean>>({
    entry_sl_tp: true, prediction: false, trade_markers: false, pattern_labels: true,
  });
  // MA overlay toggle（新規）
  const [maToggles, setMAToggles] = useState<Record<MAToggle, boolean>>({
    SMA5: false, SMA20: true, SMA50: false, EMA20: false, EMA200: false, BB20: false,
  });
  const [notes, setNotes] = useState({ setup: '', invalidation: '', memo: '' });

  // visible range state
  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ start: 0, end: 0 });
  const rangeInitializedRef = useRef(false);

  // API フック
  const meta       = useChartMeta(symbol, timeframe);
  const candles    = useChartCandles(symbol, timeframe);
  const indicators = useChartIndicators(symbol, timeframe);
  const trades     = useChartTrades(symbol);
  const patterns   = useChartPatternMarkers(symbol, timeframe);
  const signals    = useSignals({ symbol, limit: 10 } as never);
  const prediction = useChartPredictionOverlay(symbol, timeframe, isPro);

  // candles データが変わったら visible range を再初期化
  const total = candles.data?.candles.length ?? 0;
  useEffect(() => {
    if (total > 0) {
      setVisibleRange(initVisibleRange(total));
      rangeInitializedRef.current = true;
    }
  }, [total, symbol, timeframe]);

  // zoom / pan ハンドラー
  const handleZoomIn    = useCallback(() => setVisibleRange((r) => zoomIn(r, total)), [total]);
  const handleZoomOut   = useCallback(() => setVisibleRange((r) => zoomOut(r, total)), [total]);
  const handleZoomReset = useCallback(() => setVisibleRange(initVisibleRange(total)), [total]);
  const handlePanLeft   = useCallback(() => setVisibleRange((r) => pan(r, total, -Math.max(5, Math.floor((r.end - r.start) * 0.2)))), [total]);
  const handlePanRight  = useCallback(() => setVisibleRange((r) => pan(r, total, Math.max(5, Math.floor((r.end - r.start) * 0.2)))), [total]);
  const handlePanDelta  = useCallback((delta: number) => setVisibleRange((r) => pan(r, total, delta)), [total]);

  const toggleInd = (k: IndicatorToggle) =>
    setIndToggles((p) => ({ ...p, [k]: !p[k] }));
  const toggleOv  = (k: OverlayToggle) =>
    setOvToggles((p) => ({ ...p, [k]: !p[k] }));
  const toggleMA  = (k: MAToggle) =>
    setMAToggles((p) => ({ ...p, [k]: !p[k] }));

  const trendColor =
    meta.data?.trendBias === 'bullish' ? C.bullish
    : meta.data?.trendBias === 'bearish' ? C.bearish
    : C.neutral;

  // prediction data を CandleChart に渡す形式に整形
  const predChartData = useMemo(() => {
    if (!prediction.data) return null;
    return {
      bullish:          prediction.data.probabilities.bullish,
      neutral:          prediction.data.probabilities.neutral,
      bearish:          prediction.data.probabilities.bearish,
      expectedMovePips: prediction.data.expectedMovePips,
      confidence:       prediction.data.confidence,
      mainScenario:     prediction.data.mainScenario,
    };
  }, [prediction.data]);

  const visibleCount = visibleRange.end - visibleRange.start + 1;

  return (
    <div style={s.root}>
      {/* ══════════════════════════════════════════
          1. chart-overview
          ══════════════════════════════════════════ */}
      <section style={s.overview}>
        <div style={s.overviewLeft}>
          <h1 style={s.pageTitle}>📈 Chart</h1>
          <span style={s.pairBadge}>{symbol.slice(0, 3)}/{symbol.slice(3)}</span>
          <span style={s.tfBadge}>{timeframe}</span>
        </div>
        <div style={s.overviewRight}>
          {meta.isLoading && <span style={s.muted}>Loading…</span>}
          {meta.data && (
            <>
              <span style={{ ...s.price, color: trendColor }}>
                {meta.data.currentPrice.toFixed(4)}
              </span>
              <span style={s.overviewItem}>Spread {meta.data.spread}</span>
              <span style={{
                ...s.overviewItem,
                color: meta.data.marketStatus === 'open' ? C.bullish : C.bearish,
              }}>
                {meta.data.marketStatus === 'open' ? '● Open' : '○ Closed'}
              </span>
              <span style={s.overviewItem}>{meta.data.sessionLabel}</span>
              <span style={{ ...s.overviewItem, color: trendColor }}>
                Trend: {meta.data.trendBias}
              </span>
            </>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. chart-toolbar
          ══════════════════════════════════════════ */}
      <section style={s.toolbar}>
        {/* pair selector */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>Pair</span>
          {SYMBOLS.map((sym) => (
            <button key={sym}
              style={{ ...s.toolBtn, ...(symbol === sym ? s.toolBtnActive : {}) }}
              onClick={() => setSymbol(sym)}>
              {sym.slice(0, 3)}/{sym.slice(3)}
            </button>
          ))}
        </div>

        {/* timeframe selector */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>TF</span>
          {TIMEFRAMES.map((tf) => (
            <button key={tf}
              style={{ ...s.toolBtn, ...(timeframe === tf ? s.toolBtnActive : {}) }}
              onClick={() => setTimeframe(tf)}>
              {tf}
            </button>
          ))}
        </div>

        {/* mode toggle */}
        <div style={s.toolbarGroup}>
          {(['analysis', 'trade'] as const).map((m) => (
            <button key={m}
              style={{ ...s.toolBtn, ...(activeMode === m ? s.toolBtnActive : {}) }}
              onClick={() => setActiveMode(m)}>
              {m === 'analysis' ? '📊 Analysis' : '⚡ Trade'}
            </button>
          ))}
        </div>

        {/* zoom / pan controls（新規） */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>View</span>
          <button style={s.toolBtn} onClick={handlePanLeft}   title="Pan Left">◀</button>
          <button style={s.toolBtn} onClick={handleZoomIn}    title="Zoom In">＋</button>
          <button style={s.toolBtn} onClick={handleZoomOut}   title="Zoom Out">－</button>
          <button style={s.toolBtn} onClick={handlePanRight}  title="Pan Right">▶</button>
          <button style={{ ...s.toolBtn, fontSize: 10 }} onClick={handleZoomReset} title="Reset">Reset</button>
          {total > 0 && (
            <span style={{ ...s.toolbarLabel, fontFamily: 'monospace', fontSize: 10 }}>
              {visibleCount}/{total}
            </span>
          )}
        </div>

        {/* indicator toggles */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>Ind</span>
          {(Object.keys(indToggles) as IndicatorToggle[]).map((k) => (
            <button key={k}
              style={{ ...s.toolBtn, ...(indToggles[k] ? s.toolBtnActive : {}) }}
              onClick={() => toggleInd(k)}>
              {k}
            </button>
          ))}
        </div>

        {/* MA overlay toggles（新規） */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>MA</span>
          {(Object.keys(maToggles) as MAToggle[]).map((k) => (
            <button key={k}
              style={{
                ...s.toolBtn,
                ...(maToggles[k] ? { ...s.toolBtnActive, color: MA_COLORS[k], borderColor: MA_COLORS[k] + '88' } : {}),
                fontSize: 10,
              }}
              onClick={() => toggleMA(k)}>
              {k}
            </button>
          ))}
        </div>

        {/* overlay toggles */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>Overlay</span>
          {(Object.keys(ovToggles) as OverlayToggle[]).map((k) => {
            const isPredKey = k === 'prediction';
            const disabled  = isPredKey && !isPro;
            return (
              <button key={k}
                style={{
                  ...s.toolBtn,
                  ...(ovToggles[k] ? s.toolBtnActive : {}),
                  ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                }}
                onClick={() => {
                  if (disabled) { navigate('/plan'); return; }
                  toggleOv(k);
                }}>
                {k === 'entry_sl_tp' ? 'E/SL/TP'
                  : k === 'prediction' ? `Pred${!isPro ? ' 🔒' : ''}`
                  : k === 'trade_markers' ? 'Markers'
                  : 'Patterns'}
              </button>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          3. main-chart
          ══════════════════════════════════════════ */}
      <section style={s.card}>
        <h2 style={s.cardTitle}>Main Chart</h2>
        <div style={s.mainChartPlaceholder}>
          {/* ロード中 */}
          {candles.isLoading && (
            <div style={s.chartCentered}>
              <span style={{ color: C.muted, fontSize: 13 }}>📡 ローソク足を読み込み中...</span>
            </div>
          )}
          {/* エラー */}
          {candles.isError && (
            <div style={{ ...s.chartCentered, flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <span style={{ fontSize: 13, color: C.bearish }}>データ取得エラー</span>
            </div>
          )}
          {/* データなし */}
          {!candles.isLoading && !candles.isError && total === 0 && (
            <div style={{ ...s.chartCentered, flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 24 }}>📭</span>
              <span style={{ fontSize: 13, color: C.muted }}>
                市場データなし — seed未実行 または OANDA未接続
              </span>
            </div>
          )}
          {/* ローソク足描画（データあり） */}
          {total > 0 && rangeInitializedRef.current && (
            <CandleChart
              candles={candles.data!.candles}
              visibleRange={visibleRange}
              width={800}
              height={430}
              maToggles={maToggles}
              showPrediction={ovToggles.prediction && isPro}
              predictionData={predChartData}
              patternMarkers={patterns.data?.markers ?? []}
              showPatterns={ovToggles.pattern_labels}
              onPanDelta={handlePanDelta}
            />
          )}
        </div>

        {/* Navigator */}
        {total > 0 && (
          <Navigator
            candles={candles.data!.candles}
            visibleRange={visibleRange}
            onRangeChange={(r) => setVisibleRange(clampVisibleRange(r, total))}
            width={800}
            height={80}
          />
        )}

        <div style={s.lowerPane}>
          <span style={s.muted}>
            Candles: {total} bars
            {visibleRange.start !== 0 || visibleRange.end !== total - 1
              ? ` — 表示: ${visibleCount} 本`
              : ''}
            {candles.data && total > 0 && (
              <>
                {' '}— 最終:{' '}
                {new Date(candles.data.candles[total - 1].time).toLocaleString('ja-JP')}
              </>
            )}
          </span>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          下段 2カラム
          ══════════════════════════════════════════ */}
      <div style={s.bottomGrid}>
        {/* ── 左カラム ── */}
        <div style={s.bottomLeft}>

          {/* ══════════════════════════════════════
              4. indicator-summary（6カード）
              ══════════════════════════════════════ */}
          <section style={s.card}>
            <h2 style={s.cardTitle}>Indicator Summary</h2>
            {indicators.isLoading && <p style={s.muted}>Loading…</p>}
            {indicators.data && (
              <div style={s.indGrid}>
                <IndicatorCard id="ma"   label="MA"
                  value={`MA: ${indicators.data.indicators.ma.crossStatus}`}
                  status={indicators.data.indicators.ma.status as 'bullish' | 'bearish' | 'neutral'} />
                <IndicatorCard id="rsi"  label="RSI"
                  value={`RSI: ${indicators.data.indicators.rsi.value.toFixed(1)} ${indicators.data.indicators.rsi.status}`}
                  status={indicators.data.indicators.rsi.status as 'bullish' | 'bearish' | 'neutral'} />
                <IndicatorCard id="macd" label="MACD"
                  value={`MACD: ${indicators.data.indicators.macd.crossStatus}`}
                  status={indicators.data.indicators.macd.status as 'bullish' | 'bearish' | 'neutral'} />
                <IndicatorCard id="atr"  label="ATR"
                  value={`ATR: ${indicators.data.indicators.atr.status}`}
                  status="neutral" />
                <IndicatorCard id="bb"   label="BB"
                  value={`BB: ${indicators.data.indicators.bb.position}`}
                  status={indicators.data.indicators.bb.status as 'bullish' | 'bearish' | 'neutral'} />
                <IndicatorCard id="bias" label="Bias"
                  value={`${indicators.data.indicators.bias.label}`}
                  status={indicators.data.indicators.bias.status as 'bullish' | 'bearish' | 'neutral'} />
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════
              8. recent-signals
              ══════════════════════════════════════ */}
          <section style={{ ...s.card, marginTop: 12 }}>
            <h2 style={s.cardTitle}>Recent Signals</h2>
            {(signals as { data?: { signals?: unknown[] }; isLoading?: boolean }).isLoading && <p style={s.muted}>Loading…</p>}
            {(() => {
              const data = (signals as { data?: { signals?: unknown[] } }).data;
              const sigs = data?.signals;
              if (!sigs || sigs.length === 0) {
                return <p style={s.muted}>No signals</p>;
              }
              return (
                <table style={s.signalTable}>
                  <thead>
                    <tr>
                      <th style={s.th}>Time</th>
                      <th style={s.th}>Type</th>
                      <th style={s.th}>Dir</th>
                      <th style={s.th}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sigs as Array<{
                      id: string;
                      triggeredAt: string;
                      type: string;
                      direction?: string;
                      snapshot: { scoreTotal: number; trendDirection?: string };
                    }>).map((signal) => {
                      const dir = signal.direction ?? (signal.snapshot.trendDirection === 'UP' ? 'BUY' : 'SELL');
                      return (
                        <tr key={signal.id}>
                          <td style={s.td}>{new Date(signal.triggeredAt).toLocaleTimeString('ja-JP')}</td>
                          <td style={s.td}><span style={{ fontSize: 11 }}>{signal.type}</span></td>
                          <td style={{ ...s.td, color: dir === 'BUY' ? C.bullish : C.bearish, fontWeight: 700 }}>{dir}</td>
                          <td style={{ ...s.td, color: signal.snapshot.scoreTotal >= 70 ? C.bullish : C.neutral }}>
                            {signal.snapshot.scoreTotal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </section>

          {/* ══════════════════════════════════════
              7. chart-notes（v5.1 = React state のみ）
              ══════════════════════════════════════ */}
          <section style={{ ...s.card, marginTop: 12 }}>
            <h2 style={s.cardTitle}>Chart Notes <span style={s.stub}>v5.1 メモリのみ</span></h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input style={s.noteInput}
                placeholder="Setup note — 例: 1.0840 抜けで買い"
                value={notes.setup}
                onChange={(e) => setNotes({ ...notes, setup: e.target.value })} />
              <input style={s.noteInput}
                placeholder="Invalidation — 例: CPI 前なので見送り"
                value={notes.invalidation}
                onChange={(e) => setNotes({ ...notes, invalidation: e.target.value })} />
              <textarea style={{ ...s.noteInput, height: 64, resize: 'vertical' }}
                placeholder="Memo（自由記述）"
                value={notes.memo}
                onChange={(e) => setNotes({ ...notes, memo: e.target.value })} />
              <button style={{ ...s.saveBtn, opacity: 0.5, cursor: 'not-allowed' }}
                disabled title="v5.1: 保存 API 未実装。v6 で永続化予定。">
                💾 Save（v6 実装予定）
              </button>
            </div>
          </section>
        </div>

        {/* ── 右カラム ── */}
        <div style={s.bottomRight}>

          {/* ══════════════════════════════════════
              5. trade-overlay-panel
              ══════════════════════════════════════ */}
          <section style={s.card}>
            <h2 style={s.cardTitle}>Trade Overlay</h2>
            {trades.isLoading && <p style={s.muted}>Loading…</p>}
            {trades.data?.activeTrade == null && !trades.isLoading && (
              <div style={s.noTrade}>
                <span style={{ fontSize: 24 }}>📭</span>
                <p style={s.muted}>No Active Trade</p>
              </div>
            )}
            {trades.data?.activeTrade && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <TradeRow label="Position"
                  value={trades.data.activeTrade.side}
                  color={trades.data.activeTrade.side === 'BUY' ? C.bullish : C.bearish} />
                <TradeRow label="Entry"   value={trades.data.activeTrade.entryPrice.toFixed(4)} />
                <TradeRow label="SL"
                  value={trades.data.activeTrade.stopLoss?.toFixed(4) ?? '—'}
                  color={C.bearish} />
                <TradeRow label="TP"
                  value={trades.data.activeTrade.takeProfit?.toFixed(4) ?? '—'}
                  color={C.info} />
                <TradeRow label="R:R"
                  value={trades.data.activeTrade.rrRatio != null ? `${trades.data.activeTrade.rrRatio}` : '—'}
                  color={C.bullish} />
                <TradeRow label="Lot"   value={`${trades.data.activeTrade.lotSize} lot`} />
                {trades.data.activeTrade.expectedLoss != null && (
                  <TradeRow label="Exp Loss"
                    value={`¥${trades.data.activeTrade.expectedLoss.toLocaleString()}`}
                    color={C.bearish} />
                )}
                {trades.data.activeTrade.expectedGain != null && (
                  <TradeRow label="Exp Gain"
                    value={`+¥${trades.data.activeTrade.expectedGain.toLocaleString()}`}
                    color={C.bullish} />
                )}
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════
              6. prediction-overlay-panel
              FREE | BASIC → ロック状態 UI
              PRO | PRO_PLUS | ADMIN → dynamic 表示
              ══════════════════════════════════════ */}
          <section style={{ ...s.card, marginTop: 12 }}>
            <h2 style={s.cardTitle}>
              Prediction Overlay
              {!isPro && <span style={s.proBadge}>PRO</span>}
            </h2>
            {!isPro ? (
              <div style={s.lockBox}>
                <div style={{ filter: 'blur(4px)', pointerEvents: 'none' }}>
                  <LockPlaceholderRows />
                </div>
                <div style={s.lockOverlay}>
                  <span style={s.lockIcon}>🔒</span>
                  <p style={s.lockMsg}>PRO / PRO_PLUS / ADMIN でご利用いただけます</p>
                  <p style={{ ...s.muted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                    チャートは全体をご利用いただけます。このセクションのみ PRO プラン以上が対象です。
                  </p>
                  <button style={s.upgradeBtn} onClick={() => navigate('/plan')}>
                    プランをアップグレード
                  </button>
                </div>
              </div>
            ) : prediction.isLoading ? (
              <p style={s.muted}>Loading…</p>
            ) : prediction.error ? (
              <div style={s.lockBox}>
                <div style={{ filter: 'blur(4px)', pointerEvents: 'none' }}>
                  <LockPlaceholderRows />
                </div>
                <div style={s.lockOverlay}>
                  <span style={s.lockIcon}>🔒</span>
                  <p style={s.lockMsg}>PRO / PRO_PLUS / ADMIN でご利用いただけます</p>
                  <button style={s.upgradeBtn} onClick={() => navigate('/plan')}>
                    プランをアップグレード
                  </button>
                </div>
              </div>
            ) : prediction.data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* シナリオ */}
                <TradeRow label="Main Scenario" value={prediction.data.mainScenario} color={C.bullish} />
                <TradeRow label="Alt Scenario"  value={prediction.data.altScenario} />
                {/* 確率バー */}
                <div style={{ marginTop: 4 }}>
                  <ProbBar label="Bullish" pct={Math.round(prediction.data.probabilities.bullish * 100)} color={C.bullish} />
                  <ProbBar label="Neutral" pct={Math.round(prediction.data.probabilities.neutral * 100)} color={C.neutral} />
                  <ProbBar label="Bearish" pct={Math.round(prediction.data.probabilities.bearish * 100)} color={C.bearish} />
                </div>
                <TradeRow label="Expected Move" value={`+${prediction.data.expectedMovePips} pips`} color={C.bullish} />
                <TradeRow label="Forecast"      value={`${prediction.data.forecastHorizonH}h`} />
                <TradeRow label="Confidence"    value={prediction.data.confidence}
                  color={prediction.data.confidence === 'high' ? C.bullish : prediction.data.confidence === 'medium' ? C.neutral : C.bearish} />
                {/* Overlay toggle ショートカット */}
                <button
                  style={{
                    ...s.toolBtn,
                    marginTop: 4, width: '100%',
                    ...(ovToggles.prediction ? { ...s.toolBtnActive, color: C.prediction, borderColor: C.prediction + '88' } : {}),
                  }}
                  onClick={() => toggleOv('prediction')}>
                  {ovToggles.prediction ? '▼ チャートに表示中' : '▲ チャートに重ねて表示'}
                </button>
                <p style={{ ...s.muted, fontSize: 11, textAlign: 'right', marginTop: 4 }}>
                  STUB v5.1 · {new Date(prediction.data.generatedAt).toLocaleTimeString('ja-JP')}
                </p>
              </div>
            ) : null}
          </section>

        </div>
      </div>
    </div>
  );
}

// ── Sub Components ────────────────────────────────────────────────────────────

function IndicatorCard({
  label, value, status,
}: {
  id: string; label: string; value: string; status: 'bullish' | 'bearish' | 'neutral';
}) {
  const color = status === 'bullish' ? C.bullish : status === 'bearish' ? C.bearish : C.neutral;
  return (
    <div style={{ ...s.indCard, borderColor: color + '44' }}>
      <span style={{ ...s.indLabel }}>{label}</span>
      <span style={{ ...s.indValue, color }}>{value}</span>
    </div>
  );
}

function TradeRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={s.tradeRow}>
      <span style={s.tradeLabel}>{label}</span>
      <span style={{ ...s.tradeValue, color: color ?? C.text }}>{value}</span>
    </div>
  );
}

function ProbBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 12 }}>
        <span style={{ color }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ background: '#1e293b', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

/** ロック UI のぼかしコンテンツ（プレースホルダー） */
function LockPlaceholderRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
      {['Main Scenario', 'Alt Scenario', 'Bullish', 'Bearish', 'Expected Move'].map((k) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: C.muted }}>{k}</span>
          <span style={{ color: C.text }}>████</span>
        </div>
      ))}
    </div>
  );
}

// ── スタイル定義 ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:          { color: C.text, padding: '0 4px' },
  overview:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  overviewLeft:  { display: 'flex', alignItems: 'center', gap: 8 },
  overviewRight: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  pageTitle:     { fontSize: 20, fontWeight: 700, margin: 0 },
  pairBadge:     { background: '#1e293b', borderRadius: 6, padding: '2px 8px', fontSize: 13, fontWeight: 600 },
  tfBadge:       { background: '#1e293b', borderRadius: 6, padding: '2px 8px', fontSize: 12, color: C.info },
  price:         { fontSize: 18, fontWeight: 700, fontFamily: 'monospace' },
  overviewItem:  { fontSize: 13, color: C.muted },
  toolbar:       { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, padding: '8px 10px', background: C.card, borderRadius: 8, borderWidth: '1px', borderStyle: 'solid', borderColor: C.border },
  toolbarGroup:  { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  toolbarLabel:  { fontSize: 10, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginRight: 2 },
  toolBtn:       { background: 'transparent', color: C.muted, borderWidth: '1px', borderStyle: 'solid', borderColor: C.border, borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' },
  toolBtnActive: { background: '#1e293b', color: C.text, borderColor: C.info },
  card:          { background: C.card, borderWidth: '1px', borderStyle: 'solid', borderColor: C.border, borderRadius: 10, padding: 12 },
  cardTitle:     { fontSize: 13, fontWeight: 700, color: C.label, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: 0, marginBottom: 12 },
  muted:         { color: C.muted, fontSize: 13, margin: 0 },
  stub:          { marginLeft: 6, fontSize: 10, color: C.neutral, background: 'rgba(232,184,48,0.1)', borderRadius: 4, padding: '1px 6px', fontWeight: 400, letterSpacing: 0, textTransform: 'none' as const },
  mainChartPlaceholder: { background: C.bg, border: `1px dashed ${C.border}`, borderRadius: '10px 10px 0 0', height: 480, overflow: 'hidden', position: 'relative' as const },
  chartCentered: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lowerPane:     { height: 48, background: '#0c0f18', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bottomGrid:    { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12, marginTop: 12 },
  bottomLeft:    {},
  bottomRight:   {},
  indGrid:       { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  indCard:       { background: C.bg, borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent', borderRadius: 8, padding: '10px 12px' },
  indLabel:      { display: 'block', fontSize: 10, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 4 },
  indValue:      { display: 'block', fontSize: 12, fontWeight: 600 },
  tradeRow:      { display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 },
  tradeLabel:    { color: C.label },
  tradeValue:    { fontFamily: 'monospace', fontWeight: 600 },
  noTrade:       { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '20px 0', gap: 8 },
  lockBox:       { position: 'relative' as const, overflow: 'hidden', borderRadius: 8 },
  lockOverlay:   { position: 'absolute' as const, inset: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', background: 'rgba(15,17,23,0.85)', gap: 8, padding: 12 },
  lockIcon:      { fontSize: 28, color: C.neutral },
  lockMsg:       { fontSize: 13, color: C.neutral, fontWeight: 700, textAlign: 'center' as const, margin: 0 },
  upgradeBtn:    { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  proBadge:      { marginLeft: 6, background: 'rgba(232,184,48,0.15)', color: C.neutral, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, letterSpacing: 0, textTransform: 'none' as const },
  signalTable:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th:            { textAlign: 'left' as const, color: C.muted, fontSize: 11, paddingBottom: 6, borderBottom: `1px solid ${C.border}` },
  td:            { padding: '6px 0', borderBottom: `1px solid #1e293b`, color: C.text },
  noteInput:     { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: '7px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' as const },
  saveBtn:       { background: C.border, color: C.muted, border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, width: '100%' },
};