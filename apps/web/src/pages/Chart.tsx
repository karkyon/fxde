/**
 * apps/web/src/pages/Chart.tsx  — PG-07 チャート
 *
 * 参照仕様:
 *   SPEC_v51_part10 §10「PG-07 Chart — 完全設計」（UI 正本）
 *   SPEC_v51_part11 §8「PG-07 と Chart API の対応」（データ正本）
 *
 * 修正履歴 v3:
 *   - OHLC Header: main-chart SVG 内左上 overlay に正しく配置
 *   - Crosshair: SVG viewBox 座標変換を svgRef ベースに統一。plot area オフセット考慮。
 *     candle index = floor ベースに修正。candle center X へスナップ。端クランプ追加。
 *   - Fullscreen: chartWorkspaceRef で toolbar+chart+navigator を丸ごと包む。
 *     fullscreen 時は flex-column+flex:1 で SVG が残り高さを100%使用。
 *     固定 height を fullscreen 時は除去。
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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

// 追加: useChartPluginRuntime import
import { useChartPluginRuntime } from '../hooks/useChartPluginRuntime';
//
// 追加: @fxde/types から runtime 型を import
import type { RuntimeOverlay, RuntimeSignal, RuntimeIndicator } from '@fxde/types';

// ─────────────────────────────────────────────────────────────────────────────
// Indicator utilities（frontend 計算）
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Viewport utilities
// ─────────────────────────────────────────────────────────────────────────────

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

/** pivotFrac(0〜1)を中心にズーム */
function zoomAroundX(range: VisibleRange, total: number, factor: number, pivotFrac: number): VisibleRange {
  const visible    = range.end - range.start + 1;
  const newVisible = Math.min(total, Math.max(MIN_VISIBLE_COUNT, Math.round(visible * factor)));
  const pivotIdx   = range.start + pivotFrac * (visible - 1);
  let newStart = Math.round(pivotIdx - pivotFrac * (newVisible - 1));
  let newEnd   = newStart + newVisible - 1;
  if (newEnd > total - 1) { newEnd = total - 1; newStart = newEnd - newVisible + 1; }
  if (newStart < 0)       { newStart = 0; newEnd = newVisible - 1; }
  return clampVisibleRange({ start: newStart, end: newEnd }, total);
}

function pan(range: VisibleRange, total: number, delta: number): VisibleRange {
  const visible = range.end - range.start + 1;
  let start = range.start + delta;
  let end   = range.end + delta;
  if (end   > total - 1) { end = total - 1; start = end - visible + 1; }
  if (start < 0)         { start = 0; end = start + visible - 1; }
  return clampVisibleRange({ start, end }, total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Format utilities
// ─────────────────────────────────────────────────────────────────────────────

function formatPrice(price: number, symbol: string): string {
  const isJpy = symbol.toUpperCase().includes('JPY');
  return isJpy ? price.toFixed(3) : price.toFixed(5);
}

function formatChartDate(time: string, timeframe: Timeframe): string {
  const d   = new Date(time);
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const dd  = String(d.getDate()).padStart(2, '0');
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  if (['W1', 'D1'].includes(timeframe)) return `${d.getFullYear()}-${mm}-${dd}`;
  return `${mm}/${dd} ${hh}:${min}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart geometry（SVG viewBox 座標変換）
// ─────────────────────────────────────────────────────────────────────────────

// PAD は SVG viewBox 内の padding（固定）
const CHART_PAD_L = 8;
const CHART_PAD_R = 60;  // 右軸ラベル用
const CHART_PAD_T = 32;  // OHLC header 用
const CHART_PAD_B = 24;

interface ChartGeo {
  cW:       number;
  cH:       number;
  effMin:   number;
  effMax:   number;
  effRange: number;
  slot:     number;
  bodyW:    number;
  toY:      (p: number) => number;
  toX:      (i: number) => number;
  toPrice:  (svgY: number) => number;
  /** svgX から candle index（0-based in visible）へ変換。clamp 済み */
  toIndex:  (svgX: number, n: number) => number;
}

function buildChartGeo(
  visibleCandles: RawCandle[],
  svgW: number,
  svgH: number,
): ChartGeo | null {
  if (visibleCandles.length === 0) return null;
  const cW = svgW - CHART_PAD_L - CHART_PAD_R;
  const cH = svgH - CHART_PAD_T  - CHART_PAD_B;

  const maxP   = Math.max(...visibleCandles.map((c) => c.high));
  const minP   = Math.min(...visibleCandles.map((c) => c.low));
  const padded = (maxP - minP || 0.0001) * 0.05;
  const effMax = maxP + padded;
  const effMin = minP - padded;
  const effRange = effMax - effMin;

  const n     = visibleCandles.length;
  const slot  = cW / n;
  const bodyW = Math.max(1, slot * 0.65);

  // candle center x in SVG viewBox
  const toX = (i: number) => CHART_PAD_L + i * slot + slot / 2;
  const toY = (p: number) => CHART_PAD_T + cH - ((p - effMin) / effRange) * cH;
  const toPrice = (svgY: number) =>
    effMin + ((CHART_PAD_T + cH - svgY) / cH) * effRange;

  /**
   * svgX（viewBox 座標）から candle index を求める
   * - 各 slot の左端 = CHART_PAD_L + i*slot
   * - floor で属するスロットを確定 → clamp [0, n-1]
   */
  const toIndex = (svgX: number, _n: number) => {
    const raw = Math.floor((svgX - CHART_PAD_L) / slot);
    return Math.max(0, Math.min(_n - 1, raw));
  };

  return { cW, cH, effMin, effMax, effRange, slot, bodyW, toY, toX, toPrice, toIndex };
}

/**
 * DOM client 座標 → SVG viewBox 座標 変換
 * getBoundingClientRect() は CSS ピクセルでの表示サイズを返す。
 * SVG は viewBox で独自座標を持つため、比率で変換する。
 */
function clientToSvgCoords(
  clientX: number,
  clientY: number,
  svgEl: SVGSVGElement,
  viewBoxW: number,
  viewBoxH: number,
): { x: number; y: number } {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width)  * viewBoxW,
    y: ((clientY - rect.top)  / rect.height) * viewBoxH,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const SYMBOLS    = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD'];
const TIMEFRAMES: Timeframe[] = ['W1', 'D1', 'H4', 'H1', 'M30', 'M15', 'M5'];

type IndicatorToggle = 'MA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'Fib' | 'Trendline';
type OverlayToggle   = 'entry_sl_tp' | 'prediction' | 'trade_markers' | 'pattern_labels';
type MAToggle        = 'SMA5' | 'SMA20' | 'SMA50' | 'EMA20' | 'EMA200' | 'BB20';

const MA_COLORS: Record<MAToggle, string> = {
  SMA5:   '#4D9FFF',
  SMA20:  '#E8B830',
  SMA50:  '#B07EFF',
  EMA20:  '#2EC96A',
  EMA200: '#E05252',
  BB20:   '#64748b',
};

const ROLES_PRO_OR_ABOVE = ['PRO', 'PRO_PLUS', 'ADMIN'] as const;

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

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

interface RawCandle {
  time: string; open: number; high: number; low: number; close: number; volume: number;
}

/** Crosshair の状態（すべて SVG viewBox 座標） */
interface CrosshairState {
  visible:      boolean;
  /** candle center x（SVG viewBox 座標）*/
  snapX:        number;
  /** raw mouse y（SVG viewBox 座標）*/
  rawY:         number;
  /** rawY に対応する価格 */
  price:        number;
  /** visible candles 内の index */
  index:        number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG viewBox の固定サイズ（レスポンシブだが viewBox は固定）
// ─────────────────────────────────────────────────────────────────────────────
const SVG_W = 800;
const SVG_H = 430;

// ─────────────────────────────────────────────────────────────────────────────
// CandleChart コンポーネント
// ─────────────────────────────────────────────────────────────────────────────

interface CandleChartProps {
  candles:           RawCandle[];
  visibleRange:      VisibleRange;
  symbol:            string;
  timeframe:         Timeframe;
  maToggles:         Record<MAToggle, boolean>;
  showPrediction:    boolean;
  predictionData:    {
    bullish: number; neutral: number; bearish: number;
    expectedMovePips: number; confidence: string; mainScenario: string;
  } | null;
  patternMarkers:    PatternMarker[];
  showPatterns:      boolean;
  runtimeOverlays:   RuntimeOverlay[];
  runtimeSignals:    RuntimeSignal[];
  runtimeIndicators: RuntimeIndicator[];
  onPanDelta:        (delta: number) => void;
  onWheelZoom:       (factor: number, pivotFrac: number) => void;
  onCrosshairChange: (state: CrosshairState) => void;
}

function CandleChart({
  candles, visibleRange, symbol, timeframe,
  maToggles, showPrediction, predictionData,
  patternMarkers, showPatterns,
  runtimeOverlays,
  runtimeSignals,
  runtimeIndicators,
  onPanDelta, onWheelZoom, onCrosshairChange,
}: CandleChartProps) {
  const dragRef = useRef<{ startX: number; lastSnapIndex: number } | null>(null);
  const svgRef  = useRef<SVGSVGElement>(null);

  const visibleCandles = useMemo(() => {
    if (candles.length === 0) return [];
    return candles.slice(visibleRange.start, visibleRange.end + 1);
  }, [candles, visibleRange]);

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

  const geo = useMemo(
    () => buildChartGeo(visibleCandles, SVG_W, SVG_H),
    [visibleCandles],
  );

  if (!geo || visibleCandles.length === 0) return null;

  const { cW, cH, toY, toX, toPrice, toIndex, slot, bodyW } = geo;

  // grid
  const gridLines = Array.from({ length: 6 }, (_, i) => {
    const price = geo.effMin + (geo.effRange * i) / 5;
    return { y: toY(price), price };
  });
  const maxLabels = Math.min(8, visibleCandles.length);
  const labelStep = Math.max(1, Math.floor(visibleCandles.length / maxLabels));

  // polyline セグメント生成
  const toPoints = (vals: (number | null)[]) => {
    const segs: string[][] = [];
    let cur: string[] = [];
    vals.forEach((v, i) => {
      if (v !== null) cur.push(`${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
      else { if (cur.length > 1) segs.push(cur); cur = []; }
    });
    if (cur.length > 1) segs.push(cur);
    return segs;
  };

  // current price line
  const lastClose  = visibleCandles[visibleCandles.length - 1].close;
  const lastCloseY = toY(lastClose);

  // prediction
  let predOriginX: number | null = null;
  let predOriginY: number | null = null;
  const predItems: Array<{ y: number; color: string; opacity: number; label: string }> = [];
  if (showPrediction && predictionData && visibleCandles.length > 0) {
    predOriginX = toX(visibleCandles.length - 1);
    predOriginY = toY(lastClose);
    const pip   = symbol.toUpperCase().includes('JPY') ? 0.01 : 0.0001;
    const move  = predictionData.expectedMovePips;
    predItems.push(
      { y: toY(lastClose + move * pip * predictionData.bullish),       color: C.bullish, opacity: Math.max(0.3, predictionData.bullish  * 1.5), label: `Bull ${Math.round(predictionData.bullish  * 100)}%` },
      { y: toY(lastClose + move * pip * predictionData.neutral * 0.1), color: C.neutral, opacity: Math.max(0.3, predictionData.neutral * 1.5), label: `Neut ${Math.round(predictionData.neutral * 100)}%` },
      { y: toY(lastClose - move * pip * predictionData.bearish),       color: C.bearish, opacity: Math.max(0.3, predictionData.bearish  * 1.5), label: `Bear ${Math.round(predictionData.bearish  * 100)}%` },
    );
  }

  // ── event handlers ────────────────────────────────────────────────────

  /** client 座標 → SVG viewBox 座標 */
  const toSvg = (clientX: number, clientY: number) =>
    svgRef.current
      ? clientToSvgCoords(clientX, clientY, svgRef.current, SVG_W, SVG_H)
      : { x: 0, y: 0 };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { x: svgX, y: svgY } = toSvg(e.clientX, e.clientY);

    // plot area 外なら crosshair 非表示
    if (
      svgX < CHART_PAD_L || svgX > CHART_PAD_L + cW ||
      svgY < CHART_PAD_T || svgY > CHART_PAD_T + cH
    ) {
      onCrosshairChange({ visible: false, snapX: 0, rawY: 0, price: 0, index: 0 });
      return;
    }

    const idx   = toIndex(svgX, visibleCandles.length);   // floor ベース
    const snapX = toX(idx);                                // candle center にスナップ
    const price = toPrice(svgY);

    onCrosshairChange({ visible: true, snapX, rawY: svgY, price, index: idx });
  };

  const handlePointerLeave = () => {
    onCrosshairChange({ visible: false, snapX: 0, rawY: 0, price: 0, index: 0 });
  };

  // ドラッグパン（slot ベース delta）
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const { x } = toSvg(e.clientX, e.clientY);
    const idx   = toIndex(x, visibleCandles.length);
    dragRef.current = { startX: e.clientX, lastSnapIndex: idx };
  };
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const { x } = toSvg(e.clientX, e.clientY);
    const curIdx = toIndex(x, visibleCandles.length);
    const diff   = curIdx - dragRef.current.lastSnapIndex;
    if (diff !== 0) {
      dragRef.current.lastSnapIndex = curIdx;
      onPanDelta(-diff);
    }
  };
  const handleMouseUp = () => { dragRef.current = null; };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const { x: svgX } = toSvg(e.clientX, e.clientY);
    const pivotFrac   = Math.max(0, Math.min(1, (svgX - CHART_PAD_L) / cW));
    const factor      = e.deltaY > 0 ? 1.2 : 0.8;
    onWheelZoom(factor, pivotFrac);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
    >
      {/* ── グリッドライン ── */}
      {gridLines.map(({ y, price }) => (
        <g key={price.toFixed(6)}>
          <line x1={CHART_PAD_L} y1={y} x2={CHART_PAD_L + cW} y2={y}
            stroke="#2d3748" strokeOpacity={0.6} strokeDasharray="3 3" />
          <text x={CHART_PAD_L + cW + 4} y={y + 3.5}
            fill="#64748b" fontSize={9} fontFamily="monospace">
            {formatPrice(price, symbol)}
          </text>
        </g>
      ))}
 
      {/* ── Bollinger fill ── */}
      {maToggles.BB20 && (() => {
        const xs: number[] = [], upper: number[] = [], lower: number[] = [];
        indicatorData.bb20.forEach((b, i) => {
          if (b.upper !== null && b.lower !== null) { xs.push(i); upper.push(b.upper); lower.push(b.lower); }
        });
        if (xs.length < 2) return null;
        const fwd = xs.map((xi, k) => `${toX(xi).toFixed(1)},${toY(upper[k]).toFixed(1)}`).join(' ');
        const bwd = [...xs].reverse().map((xi, k) => {
          const li = xs.length - 1 - k;
          return `${toX(xi).toFixed(1)},${toY(lower[li]).toFixed(1)}`;
        }).join(' ');
        return <polygon points={`${fwd} ${bwd}`} fill="rgba(100,116,139,0.08)" stroke="none" />;
      })()}
 
      {/* ── MA / EMA overlays ── */}
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
          <polyline key={`${key}-${si}`} points={seg.join(' ')}
            fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.85} />
        ));
      })}
 
      {/* ── Bollinger lines ── */}
      {maToggles.BB20 && (
        [{ key: 'upper' as const }, { key: 'mid' as const, dash: '4 2' }, { key: 'lower' as const }].map(
          ({ key, dash }) =>
            toPoints(indicatorData.bb20.map((b) => b[key])).map((seg, si) => (
              <polyline key={`bb-${key}-${si}`} points={seg.join(' ')}
                fill="none" stroke={MA_COLORS.BB20}
                strokeWidth={key === 'mid' ? 1 : 1.5} strokeOpacity={0.7}
                strokeDasharray={dash} />
            ))
        )
      )}
 
      {/* ── Current Price Line ── */}
      <line x1={CHART_PAD_L} y1={lastCloseY} x2={CHART_PAD_L + cW} y2={lastCloseY}
        stroke={C.info} strokeWidth={1} strokeOpacity={0.7} strokeDasharray="6 3" />
      <rect x={CHART_PAD_L + cW + 2} y={lastCloseY - 8} width={CHART_PAD_R - 4} height={16}
        fill={C.info} rx={3} />
      <text x={CHART_PAD_L + cW + 4} y={lastCloseY + 4}
        fill="#000" fontSize={9} fontFamily="monospace" fontWeight="bold">
        {formatPrice(lastClose, symbol)}
      </text>
 
      {/* ── ローソク足 ── */}
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
 
      {/* ── Pattern markers ── */}
      {showPatterns && patternMarkers.map((pm) => {
        const relIdx = pm.barIndex - visibleRange.start;
        if (relIdx < 0 || relIdx >= visibleCandles.length) return null;
        const x     = toX(relIdx);
        const y     = toY(pm.price) - 12;
        const color = pm.direction === 'bullish' ? C.bullish
                    : pm.direction === 'bearish'  ? C.bearish : C.neutral;
        return (
          <g key={pm.id}>
            <circle cx={x} cy={y + 6} r={4} fill={color} opacity={0.8} />
            <text x={x} y={y} fill={color} fontSize={8} fontFamily="monospace" textAnchor="middle">
              {pm.label.slice(0, 6)}
            </text>
          </g>
        );
      })}
 
      {/* ── Plugin Runtime Overlays (zone / line / band / box / path / marker) ── */}
      {runtimeOverlays.map((overlay) => {
        if (!overlay.visible) return null;
        const strokeColor = overlay.style?.color    ?? '#94a3b8';
        const fillColor   = overlay.style?.fillColor ?? 'none';
        const opacity     = overlay.style?.opacity   ?? 1;
        const lineWidth   = overlay.style?.lineWidth ?? 1;
        const lineStyle   = overlay.style?.lineStyle ?? 'solid';
        const dashArray   = lineStyle === 'dashed' ? '6 3'
                          : lineStyle === 'dotted' ? '2 3'
                          : undefined;

        // ── zone ─────────────────────────────────────────────
        if (overlay.kind === 'zone') {
          const g = overlay.geometry as {
            zoneType: 'supply' | 'demand';
            upper:    number;
            lower:    number;
            fromTime: string | null;
          };
          const upperY = toY(g.upper);
          const lowerY = toY(g.lower);
          const zoneH  = Math.max(1, lowerY - upperY);
          let startX = CHART_PAD_L;
          if (g.fromTime) {
            const fromIdx = visibleCandles.findIndex((c) => c.time >= g.fromTime!);
            if (fromIdx >= 0) startX = toX(fromIdx);
          }
          const isSupply     = g.zoneType === 'supply';
          const zoneFill     = overlay.style?.fillColor ?? (isSupply ? 'rgba(224,82,82,0.12)' : 'rgba(46,201,106,0.12)');
          const zoneStroke   = overlay.style?.color     ?? (isSupply ? '#E05252' : '#2EC96A');
          const zoneOpacity  = overlay.style?.opacity   ?? 0.35;
          return (
            <g key={overlay.id}>
              <rect
                x={startX} y={upperY}
                width={Math.max(0, CHART_PAD_L + cW - startX)} height={zoneH}
                fill={zoneFill} stroke={zoneStroke}
                strokeWidth={0.8} strokeOpacity={Math.min(1, zoneOpacity * 2)} fillOpacity={zoneOpacity}
              />
              <text x={startX + 4} y={upperY + 10}
                fill={zoneStroke} fontSize={8} fontFamily="monospace" opacity={0.9}>
                {overlay.label}
              </text>
            </g>
          );
        }

        // ── line: 水平線 {price} または 2点線 {x1Time,y1,x2Time,y2} ──────
        if (overlay.kind === 'line') {
          const g = overlay.geometry as {
            price?:   number;
            x1Time?:  string;
            y1?:      number;
            x2Time?:  string;
            y2?:      number;
          };
          if (g.price !== undefined) {
            // 水平線
            const lineY = toY(g.price);
            return (
              <g key={overlay.id} opacity={opacity}>
                <line
                  x1={CHART_PAD_L} y1={lineY} x2={CHART_PAD_L + cW} y2={lineY}
                  stroke={strokeColor} strokeWidth={lineWidth}
                  strokeDasharray={dashArray}
                />
                <text x={CHART_PAD_L + 4} y={lineY - 3}
                  fill={strokeColor} fontSize={7} fontFamily="monospace" opacity={0.8}>
                  {overlay.label}
                </text>
              </g>
            );
          }
          if (g.x1Time !== undefined && g.y1 !== undefined && g.x2Time !== undefined && g.y2 !== undefined) {
            const i1 = visibleCandles.findIndex((c) => c.time >= g.x1Time!);
            const i2 = visibleCandles.findIndex((c) => c.time >= g.x2Time!);
            if (i1 < 0 || i2 < 0) return null;
            const x1 = toX(i1); const y1 = toY(g.y1);
            const x2 = toX(i2); const y2 = toY(g.y2);
            return (
              <g key={overlay.id} opacity={opacity}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={strokeColor} strokeWidth={lineWidth}
                  strokeDasharray={dashArray}
                />
                <text x={(x1 + x2) / 2} y={Math.min(y1, y2) - 3}
                  fill={strokeColor} fontSize={7} fontFamily="monospace"
                  textAnchor="middle" opacity={0.8}>
                  {overlay.label}
                </text>
              </g>
            );
          }
          return null;
        }

        // ── band: 上下2本の水平線 + 塗り {upper, lower} ─────────────────
        if (overlay.kind === 'band') {
          const g = overlay.geometry as { upper: number; lower: number };
          if (g.upper === undefined || g.lower === undefined) return null;
          const upperY = toY(g.upper);
          const lowerY = toY(g.lower);
          const bandH  = Math.max(1, lowerY - upperY);
          const bandFill = overlay.style?.fillColor ?? `${strokeColor}1a`;
          return (
            <g key={overlay.id} opacity={opacity}>
              <rect
                x={CHART_PAD_L} y={upperY}
                width={cW} height={bandH}
                fill={bandFill} stroke="none"
              />
              <line x1={CHART_PAD_L} y1={upperY} x2={CHART_PAD_L + cW} y2={upperY}
                stroke={strokeColor} strokeWidth={lineWidth} strokeDasharray={dashArray} />
              <line x1={CHART_PAD_L} y1={lowerY} x2={CHART_PAD_L + cW} y2={lowerY}
                stroke={strokeColor} strokeWidth={lineWidth} strokeDasharray={dashArray} />
              <text x={CHART_PAD_L + 4} y={upperY - 3}
                fill={strokeColor} fontSize={7} fontFamily="monospace" opacity={0.8}>
                {overlay.label}
              </text>
            </g>
          );
        }

        // ── box: 矩形 {x1Time, x2Time, upper, lower} ─────────────────────
        if (overlay.kind === 'box') {
          const g = overlay.geometry as {
            x1Time: string;
            x2Time: string;
            upper:  number;
            lower:  number;
          };
          const i1 = visibleCandles.findIndex((c) => c.time >= g.x1Time);
          const i2 = visibleCandles.findIndex((c) => c.time >= g.x2Time);
          if (i1 < 0 && i2 < 0) return null;
          const x1    = i1 >= 0 ? toX(i1) : CHART_PAD_L;
          const x2    = i2 >= 0 ? toX(i2) : CHART_PAD_L + cW;
          const upperY = toY(g.upper);
          const lowerY = toY(g.lower);
          const boxFill = overlay.style?.fillColor ?? `${strokeColor}1a`;
          return (
            <g key={overlay.id} opacity={opacity}>
              <rect
                x={Math.min(x1, x2)} y={upperY}
                width={Math.abs(x2 - x1)} height={Math.max(1, lowerY - upperY)}
                fill={boxFill} stroke={strokeColor} strokeWidth={lineWidth}
                strokeDasharray={dashArray}
              />
              <text x={Math.min(x1, x2) + 4} y={upperY + 10}
                fill={strokeColor} fontSize={7} fontFamily="monospace" opacity={0.9}>
                {overlay.label}
              </text>
            </g>
          );
        }

        // ── path: 折れ線パス {points: [{time, price}]} ───────────────────
        if (overlay.kind === 'path') {
          const g = overlay.geometry as { points?: { time: string; price: number }[] };
          if (!g.points || g.points.length < 2) return null;
          const pts = g.points
            .map((p) => {
              const idx = visibleCandles.findIndex((c) => c.time >= p.time);
              if (idx < 0) return null;
              return `${toX(idx)},${toY(p.price)}`;
            })
            .filter(Boolean);
          if (pts.length < 2) return null;
          const firstPt = g.points.find((p) => visibleCandles.findIndex((c) => c.time >= p.time) >= 0);
          const labelX  = firstPt ? toX(visibleCandles.findIndex((c) => c.time >= firstPt.time)) : CHART_PAD_L;
          const labelY  = firstPt ? toY(firstPt.price) - 6 : CHART_PAD_T;
          return (
            <g key={overlay.id} opacity={opacity}>
              <polyline
                points={pts.join(' ')}
                fill={fillColor === 'none' ? 'none' : fillColor}
                stroke={strokeColor} strokeWidth={lineWidth}
                strokeDasharray={dashArray}
              />
              <text x={labelX} y={labelY}
                fill={strokeColor} fontSize={7} fontFamily="monospace" opacity={0.8}>
                {overlay.label}
              </text>
            </g>
          );
        }

        // ── marker: 特定価格・時刻にマーク {time, price, shape?} ──────────
        if (overlay.kind === 'marker') {
          const g = overlay.geometry as {
            time?:  string;
            price?: number;
            shape?: 'circle' | 'diamond' | 'triangle_up' | 'triangle_down';
          };
          if (g.price === undefined) return null;
          let markerX = CHART_PAD_L + cW / 2;
          if (g.time) {
            const idx = visibleCandles.findIndex((c) => c.time >= g.time!);
            if (idx < 0) return null;
            markerX = toX(idx);
          }
          const markerY = toY(g.price);
          const shape   = g.shape ?? 'circle';
          const r = 5;
          let shapeEl: React.ReactNode;
          if (shape === 'circle') {
            shapeEl = <circle cx={markerX} cy={markerY} r={r}
              fill={fillColor === 'none' ? strokeColor : fillColor}
              stroke={strokeColor} strokeWidth={lineWidth} opacity={opacity} />;
          } else if (shape === 'diamond') {
            shapeEl = <polygon
              points={`${markerX},${markerY - r} ${markerX + r},${markerY} ${markerX},${markerY + r} ${markerX - r},${markerY}`}
              fill={fillColor === 'none' ? strokeColor : fillColor}
              stroke={strokeColor} strokeWidth={lineWidth} opacity={opacity} />;
          } else if (shape === 'triangle_up') {
            shapeEl = <polygon
              points={`${markerX},${markerY - r} ${markerX + r},${markerY + r} ${markerX - r},${markerY + r}`}
              fill={fillColor === 'none' ? strokeColor : fillColor}
              stroke={strokeColor} strokeWidth={lineWidth} opacity={opacity} />;
          } else {
            shapeEl = <polygon
              points={`${markerX},${markerY + r} ${markerX + r},${markerY - r} ${markerX - r},${markerY - r}`}
              fill={fillColor === 'none' ? strokeColor : fillColor}
              stroke={strokeColor} strokeWidth={lineWidth} opacity={opacity} />;
          }
          return (
            <g key={overlay.id}>
              {shapeEl}
              {overlay.label && (
                <text x={markerX} y={markerY - r - 3}
                  fill={strokeColor} fontSize={7} fontFamily="monospace"
                  textAnchor="middle" opacity={0.85}>
                  {overlay.label}
                </text>
              )}
            </g>
          );
        }

        return null;
      })}
 
      {/* ── Plugin Runtime Signal Markers ── */}
      {runtimeSignals.map((signal) => {
        if (!signal.price || !signal.timestamp) return null;
        const sigIdx = visibleCandles.findIndex((c) => c.time >= (signal.timestamp ?? ''));
        if (sigIdx < 0) return null;
        const sigX  = toX(sigIdx);
        const sigY  = toY(signal.price);
        const color = signal.direction === 'BUY'  ? '#2EC96A'
                    : signal.direction === 'SELL' ? '#E05252'
                    : '#E8B830';
        const isBuy = signal.direction === 'BUY';
        return (
          <g key={signal.id}>
            <text x={sigX} y={isBuy ? sigY + 14 : sigY - 6}
              fill={color} fontSize={10} fontFamily="monospace" textAnchor="middle" opacity={0.9}>
              {isBuy ? '▲' : signal.direction === 'SELL' ? '▼' : '●'}
            </text>
            <text x={sigX} y={isBuy ? sigY + 24 : sigY - 16}
              fill={color} fontSize={7} fontFamily="monospace" textAnchor="middle" opacity={0.75}>
              {signal.label.slice(0, 8)}
            </text>
          </g>
        );
      })}
      
      {/* ── Plugin Runtime Indicators ── */}
      {runtimeIndicators.length > 0 && (
        <g>
          {runtimeIndicators.map((ind, i) => {
            const statusColor =
              ind.status === 'bullish' ? '#2EC96A'
              : ind.status === 'bearish' ? '#E05252'
              : ind.status === 'info'    ? '#60a5fa'
              : '#94a3b8';
            const rowH  = 13;
            const baseY = CHART_PAD_T + cH - 6 - i * rowH;
            const rawVal = ind.value;
            const valStr =
              typeof rawVal === 'number'
                ? Number.isInteger(rawVal) ? String(rawVal) : rawVal.toFixed(2)
                : String(rawVal ?? '—');
            const label = `${ind.label}: ${valStr}`;
            const boxW  = Math.min(label.length * 5.5 + 8, 140);
            return (
              <g key={ind.id}>
                <rect
                  x={CHART_PAD_L + cW - boxW - 2}
                  y={baseY - 10}
                  width={boxW}
                  height={12}
                  fill="rgba(0,0,0,0.5)"
                  rx={2}
                />
                <text
                  x={CHART_PAD_L + cW - 4}
                  y={baseY}
                  fill={statusColor}
                  fontSize={8}
                  fontFamily="monospace"
                  textAnchor="end"
                  opacity={0.9}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ── Prediction overlay ── */}
      {showPrediction && predOriginX !== null && predOriginY !== null && (
        <g>
          <line x1={predOriginX} y1={CHART_PAD_T} x2={predOriginX} y2={CHART_PAD_T + cH}
            stroke={C.prediction} strokeWidth={1} strokeOpacity={0.3} strokeDasharray="4 3" />
          {predItems.map(({ y, color, opacity, label }) => (
            <g key={label}>
              <line x1={predOriginX!} y1={predOriginY!}
                x2={CHART_PAD_L + cW} y2={y}
                stroke={color} strokeWidth={2} strokeOpacity={opacity} strokeDasharray="6 3" />
              <circle cx={CHART_PAD_L + cW} cy={y} r={3} fill={color} opacity={opacity} />
              <text x={CHART_PAD_L + cW + 2} y={y + 3.5}
                fill={color} fontSize={8} fontFamily="monospace" opacity={opacity}>{label}</text>
            </g>
          ))}
          <text x={predOriginX + 2} y={CHART_PAD_T + 10}
            fill={C.prediction} fontSize={9} fontFamily="monospace" opacity={0.8}>
            {predictionData!.mainScenario} · {predictionData!.confidence}
          </text>
        </g>
      )}
 
      {/* ── 時刻ラベル（X軸） ── */}
      {visibleCandles.map((c, i) => {
        if (i % labelStep !== 0) return null;
        return (
          <text key={c.time} x={toX(i)} y={SVG_H - 4}
            fill="#64748b" fontSize={8} fontFamily="monospace" textAnchor="middle">
            {formatChartDate(c.time, timeframe)}
          </text>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CrosshairLayer（pointer-events:none の絶対 overlay SVG）
// ─────────────────────────────────────────────────────────────────────────────

interface CrosshairLayerProps {
  crosshair:      CrosshairState;
  visibleCandles: RawCandle[];
  symbol:         string;
  timeframe:      Timeframe;
}

function CrosshairLayer({ crosshair, visibleCandles, symbol, timeframe }: CrosshairLayerProps) {
  if (!crosshair.visible || visibleCandles.length === 0) return null;

  const geo = buildChartGeo(visibleCandles, SVG_W, SVG_H);
  if (!geo) return null;
  const { cW, cH } = geo;

  const cx       = crosshair.snapX;   // candle center x（viewBox）
  const cy       = crosshair.rawY;    // raw mouse y（viewBox）
  const candle   = visibleCandles[crosshair.index];
  const priceStr = formatPrice(crosshair.price, symbol);
  const dateStr  = candle ? formatChartDate(candle.time, timeframe) : '';

  // X軸ラベル位置（左右クランプ）
  const xLabelW = 82;
  const xLabelX = Math.max(CHART_PAD_L, Math.min(cx - xLabelW / 2, CHART_PAD_L + cW - xLabelW));
  // Y軸ラベル（上下クランプ）
  const yClampedY = Math.max(CHART_PAD_T + 8, Math.min(cy, CHART_PAD_T + cH - 8));

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{
        position:      'absolute',
        inset:         0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        display:       'block',
      }}
    >
      {/* 垂直線（candle center にスナップ） */}
      <line x1={cx} y1={CHART_PAD_T} x2={cx} y2={CHART_PAD_T + cH}
        stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
      {/* 水平線（raw mouse y） */}
      <line x1={CHART_PAD_L} y1={cy} x2={CHART_PAD_L + cW} y2={cy}
        stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
      {/* X軸ラベル（日時） */}
      <rect x={xLabelX} y={SVG_H - CHART_PAD_B} width={xLabelW} height={18}
        fill="#1e293b" stroke="#475569" strokeWidth={0.5} rx={3} />
      <text x={xLabelX + xLabelW / 2} y={SVG_H - CHART_PAD_B + 12}
        fill="#e2e8f0" fontSize={9} fontFamily="monospace" textAnchor="middle">
        {dateStr}
      </text>
      {/* Y軸ラベル（価格） */}
      <rect x={CHART_PAD_L + cW + 2} y={yClampedY - 9} width={CHART_PAD_R - 4} height={18}
        fill="#1e293b" stroke="#475569" strokeWidth={0.5} rx={3} />
      <text x={CHART_PAD_L + cW + 5} y={yClampedY + 4}
        fill="#e2e8f0" fontSize={9} fontFamily="monospace">
        {priceStr}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OHLCOverlay（チャートSVG 内 <foreignObject> ではなく、SVG 外 position:absolute div）
// chart plot area の左上に重ねる。pointer-events:none
// ─────────────────────────────────────────────────────────────────────────────

interface OHLCOverlayProps {
  candle:    RawCandle | null;
  symbol:    string;
  timeframe: Timeframe;
}

function OHLCOverlay({ candle, symbol, timeframe }: OHLCOverlayProps) {
  if (!candle) return null;
  const isUp  = candle.close >= candle.open;
  const color = isUp ? C.bullish : C.bearish;
  const fmt   = (v: number) => formatPrice(v, symbol);
  const pair  = `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  return (
    <div style={{
      position:      'absolute',
      top:           4,
      left:          CHART_PAD_L,
      display:       'flex',
      alignItems:    'center',
      gap:           8,
      fontSize:      11,
      fontFamily:    'monospace',
      pointerEvents: 'none',
      zIndex:        10,
      lineHeight:    1,
    }}>
      <span style={{ color: C.label, fontWeight: 700 }}>{pair}</span>
      <span style={{ color: C.muted }}>{timeframe}</span>
      <span style={{ color: C.muted }}>O</span><span style={{ color }}>{fmt(candle.open)}</span>
      <span style={{ color: C.muted }}>H</span><span style={{ color: C.bullish }}>{fmt(candle.high)}</span>
      <span style={{ color: C.muted }}>L</span><span style={{ color: C.bearish }}>{fmt(candle.low)}</span>
      <span style={{ color: C.muted }}>C</span><span style={{ color, fontWeight: 700 }}>{fmt(candle.close)}</span>
      <span style={{ color: C.muted, fontSize: 10 }}>
        {candle ? formatChartDate(candle.time, timeframe) : ''}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigator
// ─────────────────────────────────────────────────────────────────────────────

interface NavigatorProps {
  candles:       RawCandle[];
  visibleRange:  VisibleRange;
  onRangeChange: (r: VisibleRange) => void;
}

function Navigator({ candles, visibleRange, onRangeChange }: NavigatorProps) {
  const svgRef       = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<null | {
    type: 'left' | 'right' | 'center';
    startClientX: number;
    initRange: VisibleRange;
  }>(null);

  const total = candles.length;
  if (total === 0) return null;

  // navigator は CSS width:100% / height:80px。viewBox は固定
  const NAV_W = 800, NAV_H = 80;
  const NP_L = 4, NP_R = 4, NP_T = 6, NP_B = 20;
  const nW   = NAV_W - NP_L - NP_R;
  const nH   = NAV_H - NP_T  - NP_B;

  const toX  = (idx: number) => NP_L + (idx / Math.max(1, total - 1)) * nW;
  const maxP = Math.max(...candles.map((c) => c.close));
  const minP = Math.min(...candles.map((c) => c.close));
  const rng  = maxP - minP || 0.0001;
  const toY  = (p: number) => NP_T + nH - ((p - minP) / rng) * nH;
  const pts  = candles.map((c, i) => `${toX(i).toFixed(1)},${toY(c.close).toFixed(1)}`).join(' ');

  const hx1      = toX(visibleRange.start);
  const hx2      = toX(visibleRange.end);
  const HANDLE_W = 6;

  /** client x → navigator SVG viewBox x */
  const clientToNavX = (clientX: number) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * NAV_W;
  };

  const handleMouseDown = (e: React.MouseEvent, type: 'left' | 'right' | 'center') => {
    e.stopPropagation();
    dragStateRef.current = { type, startClientX: e.clientX, initRange: { ...visibleRange } };
  };
  const handleSvgMouseMove = (e: React.MouseEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const dx    = clientToNavX(e.clientX) - clientToNavX(ds.startClientX);
    const scale = (total - 1) / nW;
    const delta = Math.round(dx * scale);
    if (ds.type === 'center') {
      const span   = ds.initRange.end - ds.initRange.start;
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

  const timeLabelStep = Math.max(1, Math.floor(total / 8));

  return (
    <div style={{ background: '#0a0d14', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${NAV_W} ${NAV_H}`}
        style={{ width: '100%', height: NAV_H, display: 'block' }}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        {/* 暗幕 左 */}
        <rect x={NP_L} y={NP_T} width={Math.max(0, hx1 - NP_L)} height={nH} fill="rgba(0,0,0,0.5)" />
        {/* 暗幕 右 */}
        <rect x={hx2}  y={NP_T} width={Math.max(0, NP_L + nW - hx2)} height={nH} fill="rgba(0,0,0,0.5)" />
        {/* ミニライン */}
        <polyline points={pts} fill="none" stroke="#4D9FFF" strokeWidth={1} strokeOpacity={0.5} />
        {/* ハイライト枠 */}
        <rect x={hx1} y={NP_T} width={Math.max(0, hx2 - hx1)} height={nH}
          fill="rgba(77,159,255,0.08)" stroke="rgba(77,159,255,0.4)" strokeWidth={1} />
        {/* 中央ドラッグ */}
        <rect x={hx1 + HANDLE_W} y={NP_T}
          width={Math.max(0, hx2 - hx1 - HANDLE_W * 2)} height={nH}
          fill="transparent" style={{ cursor: 'grab' }}
          onMouseDown={(e) => handleMouseDown(e, 'center')} />
        {/* 左ハンドル */}
        <rect x={hx1 - HANDLE_W / 2} y={NP_T} width={HANDLE_W} height={nH}
          fill="rgba(77,159,255,0.5)" rx={2} style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => handleMouseDown(e, 'left')} />
        {/* 右ハンドル */}
        <rect x={hx2 - HANDLE_W / 2} y={NP_T} width={HANDLE_W} height={nH}
          fill="rgba(77,159,255,0.5)" rx={2} style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => handleMouseDown(e, 'right')} />
        {/* 時刻ラベル */}
        {candles.map((c, i) => {
          if (i % timeLabelStep !== 0) return null;
          const d = new Date(c.time);
          return (
            <text key={i} x={toX(i)} y={NAV_H - 4}
              fill="#64748b" fontSize={8} fontFamily="monospace" textAnchor="middle">
              {`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChartPage
// ─────────────────────────────────────────────────────────────────────────────

export default function ChartPage() {
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isPro    = user != null && (ROLES_PRO_OR_ABOVE as readonly string[]).includes(user.role);

  // ── toolbar state ─────────────────────────────────────────────────────
  const [symbol,     setSymbol]     = useState<string>('EURUSD');
  const [timeframe,  setTimeframe]  = useState<Timeframe>('H1');
  const [activeMode, setActiveMode] = useState<'analysis' | 'trade'>('analysis');
  const [indToggles, setIndToggles] = useState<Record<IndicatorToggle, boolean>>({
    MA: true, RSI: true, MACD: false, BB: false, ATR: false, Fib: false, Trendline: false,
  });
  const [ovToggles, setOvToggles] = useState<Record<OverlayToggle, boolean>>({
    entry_sl_tp: true, prediction: false, trade_markers: false, pattern_labels: true,
  });
  // ── Plugin 個別 visibility（追加） ─────────────────────────────────────
  const [pluginVisibility, setPluginVisibility] = useState<Record<string, boolean>>({});

  const togglePlugin = useCallback((key: string) => {
    setPluginVisibility(prev => ({ ...prev, [key]: prev[key] !== false ? false : true }));
  }, []);
  const [maToggles, setMAToggles] = useState<Record<MAToggle, boolean>>({
    SMA5: false, SMA20: true, SMA50: false, EMA20: false, EMA200: false, BB20: false,
  });
  const [notes, setNotes] = useState({ setup: '', invalidation: '', memo: '' });

  // ── visible range ─────────────────────────────────────────────────────
  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ start: 0, end: 0 });
  const rangeInitializedRef = useRef(false);

  // ── crosshair ─────────────────────────────────────────────────────────
  const [crosshair, setCrosshair] = useState<CrosshairState>({
    visible: false, snapX: 0, rawY: 0, price: 0, index: 0,
  });

  // ── fullscreen ────────────────────────────────────────────────────────
  /**
   * fullscreen 対象:
   *   chartWorkspaceRef = OHLC + toolbar + main plot + navigator
   *   （sidebar / indicator-summary / side panels は含めない）
   */
  const chartWorkspaceRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!chartWorkspaceRef.current) return;
    if (!document.fullscreenElement) {
      chartWorkspaceRef.current.requestFullscreen().catch(() => {/* ignore */});
    } else {
      document.exitFullscreen().catch(() => {/* ignore */});
    }
  }, []);

  // ── API hooks ─────────────────────────────────────────────────────────
  const meta       = useChartMeta(symbol, timeframe);
  const candles    = useChartCandles(symbol, timeframe);
  const indicators = useChartIndicators(symbol, timeframe);
  const trades     = useChartTrades(symbol);
  const patterns   = useChartPatternMarkers(symbol, timeframe);
  const signals    = useSignals({ symbol, limit: 10 } as never);
  const prediction = useChartPredictionOverlay(symbol, timeframe, isPro);
  const pluginRuntime = useChartPluginRuntime(symbol, timeframe);

    // ── Plugin visibility フィルタ ─────────────────────────────────────────
  const filteredOverlays = useMemo(
    () => (pluginRuntime.data?.overlays ?? []).filter(
      (o) => pluginVisibility[o.pluginKey] !== false,
    ),
    [pluginRuntime.data?.overlays, pluginVisibility],
  );
  const filteredSignals = useMemo(
    () => (pluginRuntime.data?.signals ?? []).filter(
      (s) => pluginVisibility[s.pluginKey] !== false,
    ),
    [pluginRuntime.data?.signals, pluginVisibility],
  );
  const filteredIndicators = useMemo(
    () => (pluginRuntime.data?.indicators ?? []).filter(
      (i) => pluginVisibility[i.pluginKey] !== false,
    ),
    [pluginRuntime.data?.indicators, pluginVisibility],
  );

  const total       = candles.data?.candles.length ?? 0;
  const allCandles  = candles.data?.candles ?? [];
 
  // candles / symbol / timeframe 変化 → visible range 再初期化
  useEffect(() => {
    if (total > 0) {
      setVisibleRange(initVisibleRange(total));
      rangeInitializedRef.current = true;
    }
  }, [total, symbol, timeframe]);

  // ── zoom / pan handlers ───────────────────────────────────────────────
  const handleZoomIn    = useCallback(() => setVisibleRange((r) => zoomIn(r, total)), [total]);
  const handleZoomOut   = useCallback(() => setVisibleRange((r) => zoomOut(r, total)), [total]);
  const handleZoomReset = useCallback(() => setVisibleRange(initVisibleRange(total)), [total]);
  const handlePanLeft   = useCallback(() => setVisibleRange((r) => pan(r, total, -Math.max(5, Math.floor((r.end - r.start) * 0.2)))), [total]);
  const handlePanRight  = useCallback(() => setVisibleRange((r) => pan(r, total,  Math.max(5, Math.floor((r.end - r.start) * 0.2)))), [total]);
  const handlePanDelta  = useCallback((delta: number) => setVisibleRange((r) => pan(r, total, delta)), [total]);
  const handleWheelZoom = useCallback(
    (factor: number, pivotFrac: number) => setVisibleRange((r) => zoomAroundX(r, total, factor, pivotFrac)),
    [total],
  );

  // ── toggles ───────────────────────────────────────────────────────────
  const toggleInd = (k: IndicatorToggle) => setIndToggles((p) => ({ ...p, [k]: !p[k] }));
  const toggleOv  = (k: OverlayToggle)   => setOvToggles((p) => ({ ...p, [k]: !p[k] }));
  const toggleMA  = (k: MAToggle)        => setMAToggles((p) => ({ ...p, [k]: !p[k] }));

  const trendColor =
    meta.data?.trendBias === 'bullish' ? C.bullish
    : meta.data?.trendBias === 'bearish' ? C.bearish
    : C.neutral;

  // prediction data 整形
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

  // OHLC 用 candle: hover 中はその candle、それ以外は最新 visible candle
  const visibleCandles = useMemo(
    () => allCandles.slice(visibleRange.start, visibleRange.end + 1),
    [allCandles, visibleRange],
  );
  const ohlcCandle: RawCandle | null =
    crosshair.visible && visibleCandles[crosshair.index]
      ? visibleCandles[crosshair.index]
      : visibleCandles.length > 0
        ? visibleCandles[visibleCandles.length - 1]
        : null;

  const visibleCount = visibleRange.end - visibleRange.start + 1;

  // ── Fullscreen スタイル ───────────────────────────────────────────────
  // chartWorkspace: fullscreen 時は 100vw × 100vh の flex column
  const workspaceStyle: React.CSSProperties = isFullscreen
    ? {
        position:        'fixed',
        inset:           0,
        zIndex:          9999,
        background:      C.bg,
        display:         'flex',
        flexDirection:   'column',
        width:           '100vw',
        height:          '100vh',
        overflow:        'hidden',
      }
    : {
        background:      C.card,
        borderWidth:     '1px',
        borderStyle:     'solid',
        borderColor:     C.border,
        borderRadius:    10,
        overflow:        'hidden',
      };

  // chart plot area: fullscreen 時は flex:1 で残り高さを全部使う
  const plotAreaStyle: React.CSSProperties = isFullscreen
    ? { flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }
    : { height: 480, position: 'relative', overflow: 'hidden' };

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
                {formatPrice(meta.data.currentPrice, symbol)}
              </span>
              <span style={s.overviewItem}>Spread {meta.data.spread}</span>
              <span style={{ ...s.overviewItem, color: meta.data.marketStatus === 'open' ? C.bullish : C.bearish }}>
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
          chart workspace（fullscreen 対象 ref）
          = toolbar + main plot + navigator
          ══════════════════════════════════════════ */}
      <div ref={chartWorkspaceRef} style={workspaceStyle}>

        {/* ── chart-toolbar ── */}
        <section style={{
          ...s.toolbar,
          ...(isFullscreen ? { borderRadius: 0, margin: 0, flexShrink: 0 } : {}),
        }}>
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

          {/* zoom / pan / fullscreen */}
          <div style={s.toolbarGroup}>
            <span style={s.toolbarLabel}>View</span>
            <button style={s.toolBtn} onClick={handlePanLeft}   title="Pan Left">◀</button>
            <button style={s.toolBtn} onClick={handleZoomIn}    title="Zoom In">＋</button>
            <button style={s.toolBtn} onClick={handleZoomOut}   title="Zoom Out">－</button>
            <button style={s.toolBtn} onClick={handlePanRight}  title="Pan Right">▶</button>
            <button style={{ ...s.toolBtn, fontSize: 10 }} onClick={handleZoomReset}>Reset</button>
            <button
              style={{ ...s.toolBtn, ...(isFullscreen ? s.toolBtnActive : {}) }}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Fullscreen'}>
              {isFullscreen ? '⊠' : '⛶'}
            </button>
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

          {/* MA overlay toggles */}
          <div style={s.toolbarGroup}>
            <span style={s.toolbarLabel}>MA</span>
            {(Object.keys(maToggles) as MAToggle[]).map((k) => (
              <button key={k}
                style={{
                  ...s.toolBtn,
                  ...(maToggles[k]
                    ? { ...s.toolBtnActive, color: MA_COLORS[k], borderColor: MA_COLORS[k] + '88' }
                    : {}),
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
                  onClick={() => { if (disabled) { navigate('/plan'); return; } toggleOv(k); }}>
                  {k === 'entry_sl_tp' ? 'E/SL/TP'
                    : k === 'prediction'    ? `Pred${!isPro ? ' 🔒' : ''}`
                    : k === 'trade_markers' ? 'Markers'
                    : 'Patterns'}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── main plot area ── */}
        <div style={plotAreaStyle}>
          {/* OHLC overlay（position:absolute, chart 内左上） */}
          <OHLCOverlay candle={ohlcCandle} symbol={symbol} timeframe={timeframe} />

          {/* loading */}
          {candles.isLoading && (
            <div style={s.chartCentered}>
              <span style={{ color: C.muted, fontSize: 13 }}>📡 ローソク足を読み込み中...</span>
            </div>
          )}
          {/* error */}
          {candles.isError && (
            <div style={{ ...s.chartCentered, flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <span style={{ fontSize: 13, color: C.bearish }}>データ取得エラー</span>
            </div>
          )}
          {/* no data */}
          {!candles.isLoading && !candles.isError && total === 0 && (
            <div style={{ ...s.chartCentered, flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 24 }}>📭</span>
              <span style={{ fontSize: 13, color: C.muted }}>
                市場データなし — seed未実行 または OANDA未接続
              </span>
            </div>
          )}

          {/* chart SVG + crosshair layer */}
          {total > 0 && rangeInitializedRef.current && (
            <>
              <CandleChart
                candles={allCandles}
                visibleRange={visibleRange}
                symbol={symbol}
                timeframe={timeframe}
                maToggles={maToggles}
                showPrediction={ovToggles.prediction && isPro}
                predictionData={predChartData}
                patternMarkers={patterns.data?.markers ?? []}
                showPatterns={ovToggles.pattern_labels}
                onPanDelta={handlePanDelta}
                onWheelZoom={handleWheelZoom}
                onCrosshairChange={setCrosshair}
                runtimeOverlays={filteredOverlays}
                runtimeSignals={filteredSignals}
                runtimeIndicators={filteredIndicators}
              />
              <CrosshairLayer
                crosshair={crosshair}
                visibleCandles={visibleCandles}
                symbol={symbol}
                timeframe={timeframe}
              />
            </>
          )}
        </div>

        {/* ── navigator ── */}
        {total > 0 && (
          <Navigator
            candles={allCandles}
            visibleRange={visibleRange}
            onRangeChange={(r) => setVisibleRange(clampVisibleRange(r, total))}
          />
        )}

        {/* ── lower info bar（通常時のみ） ── */}
        {!isFullscreen && (
          <div style={s.lowerPane}>
            <span style={s.muted}>
              Candles: {total} bars
              {visibleRange.start !== 0 || visibleRange.end !== total - 1
                ? ` — 表示: ${visibleCount} 本`
                : ''}
              {total > 0 && (
                <>
                  {' '}— 最終:{' '}
                  {new Date(allCandles[total - 1].time).toLocaleString('ja-JP')}
                </>
              )}
            </span>
          </div>
        )}
      </div>{/* end chartWorkspace */}

      {/* Plugin Runtime ステータスバー */}
      <PluginRuntimeStatusBar statuses={pluginRuntime.data?.pluginStatuses ?? []} />

      {/* ── Plugin Visibility Panel ─────────────────────────────────────── */}
      {(pluginRuntime.data?.pluginStatuses ?? []).length > 0 && (
        <div style={{
          display: 'flex', gap: 6, padding: '5px 12px',
          backgroundColor: '#080f1a',
          borderTop: '1px solid #1e293b',
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', marginRight: 4 }}>
            Plugins:
          </span>
          {(pluginRuntime.data?.pluginStatuses ?? []).map((ps) => {
            const isOn        = pluginVisibility[ps.pluginKey] !== false;
            const statusColor = ps.status === 'SUCCEEDED' ? '#2EC96A'
                              : ps.status === 'FAILED'    ? '#E05252'
                              : ps.status === 'TIMEOUT'   ? '#E8B830'
                              : '#94a3b8';
            return (
              <button
                key={ps.pluginKey}
                onClick={() => togglePlugin(ps.pluginKey)}
                title={ps.status !== 'SUCCEEDED' ? ps.status : undefined}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${isOn ? statusColor : '#334155'}`,
                  background: isOn ? `${statusColor}18` : 'transparent',
                  color: isOn ? statusColor : '#334155',
                  fontFamily: 'monospace',
                  transition: 'all 0.15s',
                }}
              >
                {isOn ? '✓' : '○'} {ps.pluginKey}
                {ps.status !== 'SUCCEEDED' && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>({ps.status})</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      
      {/* ══════════════════════════════════════════
          下段 2カラム（fullscreen 非対象）
          ══════════════════════════════════════════ */}
      <div style={s.bottomGrid}>
        {/* ── 左カラム ── */}
        <div style={s.bottomLeft}>

          {/* 4. indicator-summary */}
          <section style={s.card}>
            <h2 style={s.cardTitle}>Indicator Summary</h2>
            {indicators.isLoading && <p style={s.muted}>Loading…</p>}
            {indicators.data && (
              <div style={s.indGrid}>
                <IndicatorCard id="ma"   label="MA"
                  value={`MA: ${indicators.data.indicators.ma.crossStatus}`}
                  status={indicators.data.indicators.ma.status as 'bullish'|'bearish'|'neutral'} />
                <IndicatorCard id="rsi"  label="RSI"
                  value={`RSI: ${indicators.data.indicators.rsi.value.toFixed(1)} ${indicators.data.indicators.rsi.status}`}
                  status={indicators.data.indicators.rsi.status as 'bullish'|'bearish'|'neutral'} />
                <IndicatorCard id="macd" label="MACD"
                  value={`MACD: ${indicators.data.indicators.macd.crossStatus}`}
                  status={indicators.data.indicators.macd.status as 'bullish'|'bearish'|'neutral'} />
                <IndicatorCard id="atr"  label="ATR"
                  value={`ATR: ${indicators.data.indicators.atr.status}`}
                  status="neutral" />
                <IndicatorCard id="bb"   label="BB"
                  value={`BB: ${indicators.data.indicators.bb.position}`}
                  status={indicators.data.indicators.bb.status as 'bullish'|'bearish'|'neutral'} />
                <IndicatorCard id="bias" label="Bias"
                  value={`${indicators.data.indicators.bias.label}`}
                  status={indicators.data.indicators.bias.status as 'bullish'|'bearish'|'neutral'} />
              </div>
            )}
          </section>

          {/* 8. recent-signals */}
          <section style={{ ...s.card, marginTop: 12 }}>
            <h2 style={s.cardTitle}>Recent Signals</h2>
            {(signals as { data?: { signals?: unknown[] }; isLoading?: boolean }).isLoading && <p style={s.muted}>Loading…</p>}
            {(() => {
              const data = (signals as { data?: { signals?: unknown[] } }).data;
              const sigs = data?.signals;
              if (!sigs || sigs.length === 0) return <p style={s.muted}>No signals</p>;
              return (
                <table style={s.signalTable}>
                  <thead>
                    <tr>
                      <th style={s.th}>Time</th><th style={s.th}>Type</th>
                      <th style={s.th}>Dir</th><th style={s.th}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sigs as Array<{
                      id: string; triggeredAt: string; type: string; direction?: string;
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

          {/* 7. chart-notes */}
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

          {/* 5. trade-overlay-panel */}
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
                <TradeRow label="Entry"   value={formatPrice(trades.data.activeTrade.entryPrice, symbol)} />
                <TradeRow label="SL"
                  value={trades.data.activeTrade.stopLoss != null ? formatPrice(trades.data.activeTrade.stopLoss, symbol) : '—'}
                  color={C.bearish} />
                <TradeRow label="TP"
                  value={trades.data.activeTrade.takeProfit != null ? formatPrice(trades.data.activeTrade.takeProfit, symbol) : '—'}
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

          {/* 6. prediction-overlay-panel */}
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
                <TradeRow label="Main Scenario" value={prediction.data.mainScenario} color={C.bullish} />
                <TradeRow label="Alt Scenario"  value={prediction.data.altScenario} />
                <div style={{ marginTop: 4 }}>
                  <ProbBar label="Bullish" pct={Math.round(prediction.data.probabilities.bullish * 100)} color={C.bullish} />
                  <ProbBar label="Neutral" pct={Math.round(prediction.data.probabilities.neutral * 100)} color={C.neutral} />
                  <ProbBar label="Bearish" pct={Math.round(prediction.data.probabilities.bearish * 100)} color={C.bearish} />
                </div>
                <TradeRow label="Expected Move" value={`+${prediction.data.expectedMovePips} pips`} color={C.bullish} />
                <TradeRow label="Forecast"      value={`${prediction.data.forecastHorizonH}h`} />
                <TradeRow label="Confidence"    value={prediction.data.confidence}
                  color={prediction.data.confidence === 'high' ? C.bullish
                       : prediction.data.confidence === 'medium' ? C.neutral : C.bearish} />
                <button
                  style={{
                    ...s.toolBtn, marginTop: 4, width: '100%',
                    ...(ovToggles.prediction
                      ? { ...s.toolBtnActive, color: C.prediction, borderColor: C.prediction + '88' }
                      : {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub components
// ─────────────────────────────────────────────────────────────────────────────

function IndicatorCard({ label, value, status }: {
  id: string; label: string; value: string; status: 'bullish' | 'bearish' | 'neutral';
}) {
  const color = status === 'bullish' ? C.bullish : status === 'bearish' ? C.bearish : C.neutral;
  return (
    <div style={{ ...s.indCard, borderColor: color + '44' }}>
      <span style={s.indLabel}>{label}</span>
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

export function PluginRuntimeStatusBar({
  statuses,
}: {
  statuses: import('@fxde/types').RuntimePluginStatus[];
}) {
  if (statuses.length === 0) return null;
  return (
    <div
      style={{
        display:         'flex',
        gap:             8,
        flexWrap:        'wrap',
        padding:         '4px 12px',
        backgroundColor: '#0f172a',
        borderTop:       '1px solid #1e293b',
        alignItems:      'center',
      }}
    >
      <span
        style={{
          fontSize:   9,
          color:      '#475569',
          fontFamily: 'monospace',
          marginRight: 4,
        }}
      >
        PLUGINS:
      </span>
      {statuses.map((s) => {
        const dotColor =
          s.status === 'SUCCEEDED' ? '#2EC96A'
          : s.status === 'FAILED'  ? '#E05252'
          : s.status === 'TIMEOUT' ? '#E8B830'
          : '#475569';
        return (
          <div
            key={s.pluginId}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            title={s.errorMessage ?? s.status}
          >
            <span
              style={{
                width:           6,
                height:          6,
                borderRadius:    '50%',
                backgroundColor: dotColor,
                display:         'inline-block',
                flexShrink:      0,
              }}
            />
            <span
              style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}
            >
              {s.displayName}
            </span>
            {s.status !== 'SUCCEEDED' && (
              <span
                style={{ fontSize: 9, color: dotColor, fontFamily: 'monospace' }}
              >
                [{s.status}]
              </span>
            )}
            <span
              style={{ fontSize: 8, color: '#475569', fontFamily: 'monospace' }}
            >
              {s.durationMs}ms
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// スタイル定義
// ─────────────────────────────────────────────────────────────────────────────

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
  toolbar: {
    display: 'flex', flexWrap: 'wrap', gap: 8,
    padding: '8px 10px',
    background: C.card,
    borderWidth: '0 0 1px 0', borderStyle: 'solid', borderColor: C.border,
  },
  toolbarGroup:  { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  toolbarLabel:  { fontSize: 10, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginRight: 2 },
  toolBtn: {
    background: 'transparent', color: C.muted,
    borderWidth: '1px', borderStyle: 'solid', borderColor: C.border,
    borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
  },
  toolBtnActive: { background: '#1e293b', color: C.text, borderColor: C.info },
  // chart workspace は workspaceStyle / plotAreaStyle でインラインに持つ
  chartCentered: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lowerPane: {
    height: 48, background: '#0c0f18',
    borderTop: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  card:          { background: C.card, borderWidth: '1px', borderStyle: 'solid', borderColor: C.border, borderRadius: 10, padding: 12 },
  cardTitle:     { fontSize: 13, fontWeight: 700, color: C.label, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: 0, marginBottom: 12 },
  muted:         { color: C.muted, fontSize: 13, margin: 0 },
  stub:          { marginLeft: 6, fontSize: 10, color: C.neutral, background: 'rgba(232,184,48,0.1)', borderRadius: 4, padding: '1px 6px', fontWeight: 400, letterSpacing: 0, textTransform: 'none' as const },
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