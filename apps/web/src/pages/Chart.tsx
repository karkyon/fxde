/**
 * apps/web/src/pages/Chart.tsx  — PG-07 チャート
 *
 * 参照仕様:
 *   SPEC_v51_part10 §10「PG-07 Chart — 完全設計」（UI 正本）
 *   SPEC_v51_part11 §8「PG-07 と Chart API の対応」（データ正本）
 *
 * 修正履歴 v4:
 *   - LwcChart 移行完了。旧 CandleChart / CrosshairLayer / Navigator / SVG utility を削除。
 *   - FIX-1: Prediction overlay → OverlayLayer で描画
 *   - FIX-2: 下部 info bar に可視範囲（from〜to / 本数）表示
 *   - FIX-3: 旧SVG残骸を全削除
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { LwcChart } from '../components/chart/LwcChart';
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
import { useChartPluginRuntime } from '../hooks/useChartPluginRuntime';
import type { RuntimeOverlay, RuntimeSignal, RuntimeIndicator } from '@fxde/types';

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

// ─────────────────────────────────────────────────────────────────────────────
// OHLCOverlay
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
      left:          8,
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
        {formatChartDate(candle.time, timeframe)}
      </span>
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
  const [pluginVisibility, setPluginVisibility] = useState<Record<string, boolean>>({});
  const togglePlugin = useCallback((key: string) => {
    setPluginVisibility(prev => ({ ...prev, [key]: prev[key] !== false ? false : true }));
  }, []);
  const [maToggles, setMAToggles] = useState<Record<MAToggle, boolean>>({
    SMA5: false, SMA20: true, SMA50: false, EMA20: false, EMA200: false, BB20: false,
  });
  const [notes, setNotes] = useState({ setup: '', invalidation: '', memo: '' });

  // ── crosshair / visible range ─────────────────────────────────────────
  const [ohlcCandle,       setOhlcCandle]       = useState<RawCandle | null>(null);
  const [visibleRangeInfo, setVisibleRangeInfo] = useState<{
    from: string; to: string; visibleCount: number;
  } | null>(null);

  // ── fullscreen ────────────────────────────────────────────────────────
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
  const meta          = useChartMeta(symbol, timeframe);
  const candles       = useChartCandles(symbol, timeframe);
  const indicators    = useChartIndicators(symbol, timeframe);
  const trades        = useChartTrades(symbol);
  const patterns      = useChartPatternMarkers(symbol, timeframe);
  const signals       = useSignals({ symbol, limit: 10 } as never);
  const prediction    = useChartPredictionOverlay(symbol, timeframe, isPro);
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

  const total      = candles.data?.candles.length ?? 0;
  const allCandles = candles.data?.candles ?? [];

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

  // ── Fullscreen スタイル ───────────────────────────────────────────────
  const workspaceStyle: React.CSSProperties = isFullscreen
    ? {
        position:      'fixed',
        inset:         0,
        zIndex:        9999,
        background:    C.bg,
        display:       'flex',
        flexDirection: 'column',
        width:         '100vw',
        height:        '100vh',
        overflow:      'hidden',
      }
    : {
        background:   C.card,
        borderWidth:  '1px',
        borderStyle:  'solid',
        borderColor:  C.border,
        borderRadius: 10,
        overflow:     'hidden',
      };

  const plotAreaStyle: React.CSSProperties = isFullscreen
    ? { flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }
    : { height: 480, position: 'relative', overflow: 'hidden' };

  return (
    <div style={s.root}>
      {/* ── chart-overview ── */}
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

      {/* ── chart workspace ── */}
      <div ref={chartWorkspaceRef} style={workspaceStyle}>

        {/* chart-toolbar */}
        <section style={{
          ...s.toolbar,
          ...(isFullscreen ? { borderRadius: 0, margin: 0, flexShrink: 0 } : {}),
        }}>
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

          <div style={s.toolbarGroup}>
            {(['analysis', 'trade'] as const).map((m) => (
              <button key={m}
                style={{ ...s.toolBtn, ...(activeMode === m ? s.toolBtnActive : {}) }}
                onClick={() => setActiveMode(m)}>
                {m === 'analysis' ? '📊 Analysis' : '⚡ Trade'}
              </button>
            ))}
          </div>

          <div style={s.toolbarGroup}>
            <span style={s.toolbarLabel}>View</span>
            <button
              style={{ ...s.toolBtn, ...(isFullscreen ? s.toolBtnActive : {}) }}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Fullscreen'}>
              {isFullscreen ? '⊠' : '⛶'}
            </button>
          </div>

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

        {/* main plot area */}
        <div style={plotAreaStyle}>
          <OHLCOverlay candle={ohlcCandle} symbol={symbol} timeframe={timeframe} />

          {candles.isLoading && (
            <div style={s.chartCentered}>
              <span style={{ color: C.muted, fontSize: 13 }}>📡 ローソク足を読み込み中...</span>
            </div>
          )}
          {candles.isError && (
            <div style={{ ...s.chartCentered, flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <span style={{ fontSize: 13, color: C.bearish }}>データ取得エラー</span>
            </div>
          )}
          {!candles.isLoading && !candles.isError && total === 0 && (
            <div style={{ ...s.chartCentered, flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 24 }}>📭</span>
              <span style={{ fontSize: 13, color: C.muted }}>
                市場データなし — seed未実行 または OANDA未接続
              </span>
            </div>
          )}

          {total > 0 && (
            <LwcChart
              candles={allCandles}
              symbol={symbol}
              timeframe={timeframe}
              maToggles={maToggles}
              showPrediction={ovToggles.prediction && isPro}
              predictionData={predChartData}
              patternMarkers={patterns.data?.markers ?? []}
              showPatterns={ovToggles.pattern_labels}
              runtimeOverlays={filteredOverlays}
              runtimeSignals={filteredSignals}
              runtimeIndicators={filteredIndicators}
              onCrosshairCandle={setOhlcCandle}
              onVisibleRangeChange={setVisibleRangeInfo}
            />
          )}
        </div>

        {/* lower info bar */}
        {!isFullscreen && (
          <div style={s.lowerPane}>
            <span style={s.muted}>
              Total: {total} bars
              {visibleRangeInfo ? (
                <>
                  {' '}｜ 表示:{' '}
                  {new Date(visibleRangeInfo.from).toLocaleString('ja-JP', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                  {' '}〜{' '}
                  {new Date(visibleRangeInfo.to).toLocaleString('ja-JP', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                  {' '}({visibleRangeInfo.visibleCount} 本)
                </>
              ) : total > 0 ? (
                <> {' '}— 最終: {new Date(allCandles[total - 1].time).toLocaleString('ja-JP')}</>
              ) : null}
            </span>
          </div>
        )}
      </div>{/* end chartWorkspace */}

      <PluginRuntimeStatusBar statuses={pluginRuntime.data?.pluginStatuses ?? []} />

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

      {/* 下段 2カラム */}
      <div style={s.bottomGrid}>
        <div style={s.bottomLeft}>

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

        <div style={s.bottomRight}>

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
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap',
      padding: '4px 12px', backgroundColor: '#0f172a',
      borderTop: '1px solid #1e293b', alignItems: 'center',
    }}>
      <span style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace', marginRight: 4 }}>
        PLUGINS:
      </span>
      {statuses.map((s) => {
        const dotColor =
          s.status === 'SUCCEEDED' ? '#2EC96A'
          : s.status === 'FAILED'  ? '#E05252'
          : s.status === 'TIMEOUT' ? '#E8B830'
          : '#475569';
        return (
          <div key={s.pluginId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            title={s.errorMessage ?? s.status}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{s.displayName}</span>
            {s.status !== 'SUCCEEDED' && (
              <span style={{ fontSize: 9, color: dotColor, fontFamily: 'monospace' }}>[{s.status}]</span>
            )}
            <span style={{ fontSize: 8, color: '#475569', fontFamily: 'monospace' }}>{s.durationMs}ms</span>
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
    padding: '8px 10px', background: C.card,
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