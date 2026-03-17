/**
 * apps/web/src/components/chart/LwcChart.tsx
 *
 * Lightweight Charts ベース Chart Engine。
 * CandleChart（カスタムSVG）の描画層を置き換える。
 *
 * 構造:
 *   [container（position:relative）]
 *     ├── LWC DOM（ローソク足 / MA / crosshair）
 *     └── OverlayLayer（position:absolute SVG、bridge座標同期）
 *
 * FIX-2: onVisibleRangeChange prop 追加（下部 info bar の可視範囲表示用）。
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, Time } from 'lightweight-charts';
import { createChartBridge } from './chart-bridge';
import type { ChartBridge } from './chart-bridge';
import { OverlayLayer } from './overlay-layer';
import type { RuntimeOverlay, RuntimeSignal, RuntimeIndicator } from '@fxde/types';
import type { PatternMarker } from '../../lib/api';
import type { Timeframe } from '@fxde/types';

// ── 型 ──────────────────────────────────────────────────────────────────────

interface RawCandle {
  time: string; open: number; high: number; low: number; close: number; volume: number;
}

type MAToggle = 'SMA5' | 'SMA20' | 'SMA50' | 'EMA20' | 'EMA200' | 'BB20';

interface PredictionData {
  bullish: number; neutral: number; bearish: number;
  expectedMovePips: number; confidence: string; mainScenario: string;
}

export interface LwcChartProps {
  candles:           RawCandle[];
  symbol:            string;
  timeframe:         Timeframe;
  maToggles:         Record<MAToggle, boolean>;
  showPrediction:    boolean;
  predictionData:    PredictionData | null;
  patternMarkers:    PatternMarker[];
  showPatterns:      boolean;
  runtimeOverlays:   RuntimeOverlay[];
  runtimeSignals:    RuntimeSignal[];
  runtimeIndicators: RuntimeIndicator[];
  onCrosshairCandle: (candle: RawCandle | null) => void;
  /** 可視範囲変化時に呼ばれる（下部 info bar 用）*/
  onVisibleRangeChange?: (info: { from: string; to: string; visibleCount: number } | null) => void;
}

// ── MA 計算 ──────────────────────────────────────────────────────────────────

function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) =>
    i < period - 1 ? null : closes.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period
  );
}

function calcEMA(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (prev === null) {
      prev = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
    } else {
      prev = closes[i] * k + prev * (1 - k);
    }
    result.push(prev);
  }
  return result;
}

const MA_COLORS: Record<MAToggle, string> = {
  SMA5: '#4D9FFF', SMA20: '#E8B830', SMA50: '#B07EFF',
  EMA20: '#2EC96A', EMA200: '#E05252', BB20: '#64748b',
};

const toUtcSec = (iso: string): UTCTimestamp =>
  Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

// ── LwcChart ─────────────────────────────────────────────────────────────────

export function LwcChart({
  candles, symbol, timeframe, maToggles,
  showPrediction, predictionData,
  patternMarkers, showPatterns,
  runtimeOverlays, runtimeSignals, runtimeIndicators,
  onCrosshairCandle,
  onVisibleRangeChange,
}: LwcChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const maSeriesRef  = useRef<Map<MAToggle, ISeriesApi<'Line', Time>>>(new Map());
  const [bridge, setBridge] = useState<ChartBridge | null>(null);

  // ── mount: LWC 初期化 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: {
        background:  { type: ColorType.Solid, color: '#0f1117' },
        textColor:   '#64748b',
        fontFamily:  'monospace',
        fontSize:    11,
      },
      grid: {
        vertLines: { color: '#1e293b', style: LineStyle.Dotted },
        horzLines: { color: '#1e293b', style: LineStyle.Dotted },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: '#94a3b8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1e293b' },
        horzLine: { color: '#94a3b8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1e293b' },
      },
      rightPriceScale: { borderColor: '#1e293b', textColor: '#64748b' },
      timeScale: {
        borderColor:           '#1e293b',
        timeVisible:           true,
        secondsVisible:        false,
        rightBarStaysOnScroll: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale:  { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      width:  el.clientWidth,
      height: el.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:       '#2EC96A', downColor:       '#E05252',
      borderUpColor: '#2EC96A', borderDownColor: '#E05252',
      wickUpColor:   '#2EC96A', wickDownColor:   '#E05252',
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    const b = createChartBridge(chart, series, el);
    setBridge(b);

    // 可視範囲変化 → onVisibleRangeChange callback（FIX-2）
    if (onVisibleRangeChange) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        onVisibleRangeChange(b.getVisibleTimeRange());
      });
    }

    // crosshair → OHLCOverlay
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { onCrosshairCandle(null); return; }
      const data = param.seriesData?.get(series) as CandlestickData | undefined;
      if (!data)       { onCrosshairCandle(null); return; }
      onCrosshairCandle({
        time:   new Date((param.time as number) * 1000).toISOString(),
        open:   data.open, high: data.high, low: data.low, close: data.close, volume: 0,
      });
    });

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
      maSeriesRef.current.clear();
      setBridge(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── candles 更新 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || candles.length === 0) return;
    s.setData(candles.map((c) => ({ time: toUtcSec(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles]);

  // ── MA lines ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    const closes = candles.map((c) => c.close);
    const calc: Record<MAToggle, (number | null)[]> = {
      SMA5: calcSMA(closes, 5), SMA20: calcSMA(closes, 20), SMA50: calcSMA(closes, 50),
      EMA20: calcEMA(closes, 20), EMA200: calcEMA(closes, 200), BB20: calcSMA(closes, 20),
    };
    (Object.entries(maToggles) as [MAToggle, boolean][]).forEach(([key, on]) => {
      let s = maSeriesRef.current.get(key);
      if (on) {
        if (!s) {
          const newS = chart.addSeries(LineSeries, { color: MA_COLORS[key], lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          maSeriesRef.current.set(key, newS);
          s = newS;
        }
        const data = candles
          .map((c, i) => ({ time: toUtcSec(c.time), value: calc[key][i] }))
          .filter((d) => d.value !== null) as { time: UTCTimestamp; value: number }[];
        s.setData(data);
        s.applyOptions({ visible: true });
      } else {
        s?.applyOptions({ visible: false });
      }
    });
  }, [candles, maToggles]);

  // ── 初回 visible range 通知 ────────────────────────────────
  // bridge 生成後 + candles セット後に必ず1回 onVisibleRangeChange を発火させる。
  // requestAnimationFrame で LWC の描画完了を待ってから取得する。
  useEffect(() => {
    if (!bridge || candles.length === 0 || !onVisibleRangeChange) return;
    const id = requestAnimationFrame(() => {
      onVisibleRangeChange(bridge.getVisibleTimeRange());
    });

    return () => cancelAnimationFrame(id);
  }, [bridge, candles, onVisibleRangeChange]);
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {bridge && (
        <OverlayLayer
          bridge={bridge}
          candles={candles}
          symbol={symbol}
          runtimeOverlays={runtimeOverlays}
          runtimeSignals={runtimeSignals}
          runtimeIndicators={runtimeIndicators}
          patternMarkers={patternMarkers}
          showPatterns={showPatterns}
          showPrediction={showPrediction}
          predictionData={predictionData}
        />
      )}
    </div>
  );
}