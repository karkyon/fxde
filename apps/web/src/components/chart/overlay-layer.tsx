/**
 * apps/web/src/components/chart/overlay-layer.tsx
 *
 * Overlay Layer — ChartBridge 経由で座標変換し、
 * Plugin Runtime overlay / signal / pattern marker を SVG で描画する。
 * position: absolute で LWC container に重ねる。pointer-events: none。
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { ChartBridge } from './chart-bridge';
import type { RuntimeOverlay, RuntimeSignal, RuntimeIndicator } from '@fxde/types';
import type { PatternMarker } from '../../lib/api';

interface RawCandle {
  time: string; open: number; high: number; low: number; close: number;
}

interface PredictionData {
  bullish: number; neutral: number; bearish: number;
  expectedMovePips: number; confidence: string; mainScenario: string;
}

interface OverlayLayerProps {
  bridge:            ChartBridge;
  candles:           RawCandle[];
  symbol:            string;
  runtimeOverlays:   RuntimeOverlay[];
  runtimeSignals:    RuntimeSignal[];
  runtimeIndicators: RuntimeIndicator[];
  patternMarkers:    PatternMarker[];
  showPatterns:      boolean;
  showPrediction:    boolean;
  predictionData:    PredictionData | null;
}

export function OverlayLayer({
  bridge,
  runtimeOverlays,
  runtimeSignals,
  runtimeIndicators,
  patternMarkers,
  showPatterns,
}: OverlayLayerProps) {
  const [, setTick] = useState(0);

  // bridge 更新 → 再描画
  useEffect(() => bridge.subscribe(() => setTick((t) => t + 1)), [bridge]);

  const dim = bridge.dimensions();
  const w   = dim.width  || 800;
  const h   = dim.height || 430;

  const tx = useCallback((iso: string)    => bridge.timeToX(iso),    [bridge]);
  const py = useCallback((price: number)  => bridge.priceToY(price), [bridge]);

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      {/* ── Plugin Runtime Overlays ─────────────────────────────────── */}
      {runtimeOverlays.map((overlay) => {
        const style       = (overlay.style ?? {}) as Record<string, unknown>;
        const strokeColor = (style['color']    as string)  ?? '#4D9FFF';
        const opacity     = (style['opacity']  as number)  ?? 0.8;
        const lineWidth   = (style['lineWidth']as number)  ?? 1;
        const dashStr     = style['lineStyle'] === 'dashed' ? '4 3' : 'none';
        const geo         = (overlay.geometry ?? {}) as Record<string, unknown>;

        if (overlay.kind === 'zone') {
          const x1 = geo['fromTime'] ? tx(geo['fromTime'] as string) : 0;
          const x2 = geo['toTime']   ? tx(geo['toTime']   as string) : w;
          const y1 = py(geo['upper'] as number);
          const y2 = py(geo['lower'] as number);
          if (y1 == null || y2 == null) return null;
          const fill = (style['fillColor'] as string) ?? `${strokeColor}18`;
          const lx1  = Math.min(x1 ?? 0, x2 ?? w);
          const lx2  = x2 ?? w;
          return (
            <g key={overlay.id} opacity={opacity}>
              <rect x={lx1} y={y1} width={Math.abs(lx2 - lx1)} height={Math.max(1, y2 - y1)} fill={fill} />
              <line x1={lx1} y1={y1} x2={lx2} y2={y1} stroke={strokeColor} strokeWidth={lineWidth} strokeDasharray={dashStr} />
              <line x1={lx1} y1={y2} x2={lx2} y2={y2} stroke={strokeColor} strokeWidth={lineWidth} strokeDasharray={dashStr} />
              <text x={lx1 + 4} y={y1 - 3} fill={strokeColor} fontSize={7} fontFamily="monospace" opacity={0.8}>{overlay.label}</text>
            </g>
          );
        }

        if (overlay.kind === 'box') {
          const x1 = tx(geo['x1Time'] as string);
          const x2 = tx(geo['x2Time'] as string);
          const y1 = py(geo['upper']  as number);
          const y2 = py(geo['lower']  as number);
          if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
          const fill = (style['fillColor'] as string) ?? `${strokeColor}1a`;
          return (
            <g key={overlay.id} opacity={opacity}>
              <rect x={Math.min(x1, x2)} y={y1} width={Math.abs(x2 - x1)} height={Math.max(1, y2 - y1)} fill={fill} stroke={strokeColor} strokeWidth={lineWidth} strokeDasharray={dashStr} />
              <text x={Math.min(x1, x2) + 4} y={y1 + 10} fill={strokeColor} fontSize={7} fontFamily="monospace">{overlay.label}</text>
            </g>
          );
        }

        if (overlay.kind === 'path') {
          const pts = ((geo['points'] as { time: string; price: number }[]) ?? [])
            .map((p) => { const x = tx(p.time); const y = py(p.price); return x != null && y != null ? `${x.toFixed(1)},${y.toFixed(1)}` : null; })
            .filter(Boolean);
          if (pts.length < 2) return null;
          return <polyline key={overlay.id} points={pts.join(' ')} fill="none" stroke={strokeColor} strokeWidth={lineWidth} strokeDasharray={dashStr} opacity={opacity} />;
        }

        if (overlay.kind === 'marker') {
          const x    = tx(geo['time']  as string);
          const y    = py(geo['price'] as number);
          if (x == null || y == null) return null;
          const r     = 5;
          const fill  = (style['fillColor'] as string) ?? strokeColor;
          const shape = (geo['shape'] as string) ?? 'circle';
          return (
            <g key={overlay.id} opacity={opacity}>
              {shape === 'circle'      ? <circle cx={x} cy={y} r={r} fill={fill} stroke={strokeColor} strokeWidth={lineWidth} />
               : shape === 'triangle_up' ? <polygon points={`${x},${y-r} ${x+r},${y+r} ${x-r},${y+r}`} fill={fill} stroke={strokeColor} strokeWidth={lineWidth} />
               : <polygon points={`${x},${y+r} ${x+r},${y-r} ${x-r},${y-r}`} fill={fill} stroke={strokeColor} strokeWidth={lineWidth} />}
              {overlay.label && <text x={x} y={y - r - 3} fill={strokeColor} fontSize={7} fontFamily="monospace" textAnchor="middle">{overlay.label}</text>}
            </g>
          );
        }
        return null;
      })}

      {/* ── Plugin Runtime Signals ───────────────────────────────────── */}
      {runtimeSignals.map((signal) => {
        if (!signal.price || !signal.timestamp) return null;
        const x = tx(signal.timestamp);
        const y = py(signal.price);
        if (x == null || y == null) return null;
        const color = signal.direction === 'BUY' ? '#2EC96A' : signal.direction === 'SELL' ? '#E05252' : '#E8B830';
        const isBuy = signal.direction === 'BUY';
        return (
          <g key={signal.id}>
            <text x={x} y={isBuy ? y + 14 : y - 6}  fill={color} fontSize={10} fontFamily="monospace" textAnchor="middle" opacity={0.9}>{isBuy ? '▲' : signal.direction === 'SELL' ? '▼' : '●'}</text>
            <text x={x} y={isBuy ? y + 24 : y - 16} fill={color} fontSize={7}  fontFamily="monospace" textAnchor="middle" opacity={0.75}>{signal.label.slice(0, 8)}</text>
          </g>
        );
      })}

      {/* ── Pattern Markers ─────────────────────────────────────────── */}
      {showPatterns && patternMarkers.map((marker) => {
        const x    = tx(marker.detectedAt);
        const y    = py(marker.price);
        if (x == null || y == null) return null;
        const bull  = marker.direction === 'bullish';
        const color = bull ? '#2EC96A' : '#E05252';
        return (
          <g key={marker.id}>
            <text x={x} y={bull ? y - 8 : y + 16}  fill={color} fontSize={9} fontFamily="monospace" textAnchor="middle" opacity={0.85}>{bull ? '▲' : '▼'}</text>
            <text x={x} y={bull ? y - 18 : y + 26} fill={color} fontSize={6} fontFamily="monospace" textAnchor="middle" opacity={0.7}>{marker.label.slice(0, 10)}</text>
          </g>
        );
      })}

      {/* ── Runtime Indicators（左下テキスト）────────────────────────── */}
      {runtimeIndicators.map((ind, i) => {
        const c = ind.status === 'bullish' ? '#2EC96A' : ind.status === 'bearish' ? '#E05252' : ind.status === 'info' ? '#60a5fa' : '#94a3b8';
        const v = typeof ind.value === 'number' ? (Number.isInteger(ind.value) ? String(ind.value) : ind.value.toFixed(2)) : String(ind.value ?? '');
        return <text key={ind.id} x={8} y={h - 30 - i * 13} fill={c} fontSize={9} fontFamily="monospace" opacity={0.85}>{`${ind.label}: ${v}`}</text>;
      })}
    </svg>
  );
}