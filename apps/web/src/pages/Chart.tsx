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
 *   3. main-chart       — メインチャート本体（v5.1 = placeholder）
 *   4. indicator-summary — 指標状態カード群（6枚）
 *   5. trade-overlay-panel — アクティブトレード補助情報
 *   6. prediction-overlay-panel — Prediction overlay（PRO stub）
 *   7. chart-notes      — メモ欄（v5.1 = React state のみ）
 *   8. recent-signals   — 直近シグナル一覧
 *
 * v5.1 実装状況:
 *   完了: 全 8 セクション骨格 UI + API 統合
 *   v5.1 制約: main-chart = placeholder / chart-notes = 永続化なし
 *   v6 対象: Lightweight Charts 実装 / chart-notes 永続化
 *
 * アクセス権限: 全ロール（prediction-overlay-panel のみ PRO 限定）
 */

import { useState } from 'react';
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

// ── 定数 ─────────────────────────────────────────────────────────────────────
const SYMBOLS = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD'];
const TIMEFRAMES: Timeframe[] = ['W1', 'D1', 'H4', 'H1', 'M30', 'M15', 'M5'];

type IndicatorToggle = 'MA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'Fib' | 'Trendline';
type OverlayToggle   = 'entry_sl_tp' | 'prediction' | 'trade_markers' | 'pattern_labels';

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
  const [notes, setNotes] = useState({ setup: '', invalidation: '', memo: '' });

  // API フック
  const meta       = useChartMeta(symbol, timeframe);
  const candles    = useChartCandles(symbol, timeframe);
  const indicators = useChartIndicators(symbol, timeframe);
  const trades     = useChartTrades(symbol);
  const patterns   = useChartPatternMarkers(symbol, timeframe);
  const signals    = useSignals({ symbol, limit: 10 } as never);
  const prediction = useChartPredictionOverlay(symbol, timeframe, isPro);

  const trendColor =
    meta.data?.trendBias === 'bullish' ? C.bullish
    : meta.data?.trendBias === 'bearish' ? C.bearish
    : C.neutral;

  const toggleInd = (k: IndicatorToggle) =>
    setIndToggles((p) => ({ ...p, [k]: !p[k] }));
  const toggleOv = (k: OverlayToggle) =>
    setOvToggles((p) => ({ ...p, [k]: !p[k] }));

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
            <button
              key={sym}
              style={{ ...s.toolBtn, ...(symbol === sym ? s.toolBtnActive : {}) }}
              onClick={() => setSymbol(sym)}
            >
              {sym.slice(0, 3)}/{sym.slice(3)}
            </button>
          ))}
        </div>

        {/* timeframe selector */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>TF</span>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              style={{ ...s.toolBtn, ...(timeframe === tf ? s.toolBtnActive : {}) }}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* mode toggle */}
        <div style={s.toolbarGroup}>
          {(['analysis', 'trade'] as const).map((m) => (
            <button
              key={m}
              style={{ ...s.toolBtn, ...(activeMode === m ? s.toolBtnActive : {}) }}
              onClick={() => setActiveMode(m)}
            >
              {m === 'analysis' ? '📊 Analysis' : '💹 Trade'}
            </button>
          ))}
        </div>

        {/* indicator toggles */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>Ind</span>
          {(Object.keys(indToggles) as IndicatorToggle[]).map((k) => (
            <button
              key={k}
              style={{ ...s.toolBtn, ...(indToggles[k] ? s.toolBtnActive : {}) }}
              onClick={() => toggleInd(k)}
            >
              {k}
            </button>
          ))}
        </div>

        {/* overlay toggles */}
        <div style={s.toolbarGroup}>
          <span style={s.toolbarLabel}>OVL</span>
          {(Object.keys(ovToggles) as OverlayToggle[]).map((k) => {
            if (k === 'prediction' && !isPro) {
              return (
                <button key={k} style={{ ...s.toolBtn, opacity: 0.4, cursor: 'not-allowed' }}
                  onClick={() => navigate('/plan')} title="PRO プラン以上が対象">
                  🔒 Pred
                </button>
              );
            }
            return (
              <button
                key={k}
                style={{ ...s.toolBtn, ...(ovToggles[k] ? s.toolBtnActive : {}) }}
                onClick={() => toggleOv(k)}
              >
                {k === 'entry_sl_tp' ? 'E/SL/TP' : k === 'prediction' ? 'Pred' : k === 'trade_markers' ? 'Markers' : 'Patterns'}
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
        {/* placeholder — v6 で Lightweight Charts 実装 */}
        <div style={s.mainChartPlaceholder}>
          <svg viewBox="0 0 800 480" style={{ width: '100%', height: '100%' }}>
            {/* placeholder ローソク足グリッド */}
            {[80, 160, 240, 320, 400].map((y) => (
              <line key={y} x1="0" y1={y} x2="800" y2={y}
                stroke="#2d3748" strokeOpacity={0.5} />
            ))}
            {/* overlay ラベル群（SPEC_v51_part10 §10.7 準拠） */}
            {ovToggles.entry_sl_tp && (
              <>
                <line x1="0" y1="200" x2="800" y2="200"
                  stroke={C.bullish} strokeWidth={2} />
                <text x="8" y="196" fill={C.bullish} fontSize={12} fontWeight={700}>Entry</text>
                <line x1="0" y1="280" x2="800" y2="280"
                  stroke={C.bearish} strokeWidth={1.5} strokeDasharray="6 3" />
                <text x="8" y="276" fill={C.bearish} fontSize={12} fontWeight={700}>SL</text>
                <line x1="0" y1="130" x2="800" y2="130"
                  stroke={C.info} strokeWidth={1.5} strokeDasharray="6 3" />
                <text x="8" y="126" fill={C.info} fontSize={12} fontWeight={700}>TP</text>
              </>
            )}
            {indToggles.MA && (
              <polyline
                points="0,220 100,215 200,210 300,205 400,200 500,195 600,190 700,188 800,185"
                fill="none" stroke={C.info} strokeWidth={1.5}
              />
            )}
            {ovToggles.prediction && isPro && (
              <>
                <line x1="400" y1="0" x2="400" y2="480"
                  stroke={C.prediction} strokeOpacity={0.4} strokeDasharray="4 4" />
                <polyline
                  points="400,200 500,185 600,170 700,158 800,145"
                  fill="none" stroke={C.prediction} strokeWidth={2} strokeDasharray="6 3"
                />
                <text x="406" y="195" fill={C.prediction} fontSize={11}>Prediction path</text>
              </>
            )}
            {ovToggles.pattern_labels && 
              (patterns.data?.markers ?? ([] as PatternMarker[])).slice(0, 3).map((m: PatternMarker, i: number) => (
              <g key={m.id}>
                <circle cx={100 + i * 200} cy={200} r={6}
                  fill={m.direction === 'bullish' ? C.bullish : m.direction === 'bearish' ? C.bearish : C.neutral} />
                <text x={108 + i * 200} y={204} fill="#94a3b8" fontSize={10}>{m.label}</text>
              </g>
            ))}
            {/* placeholder テキスト */}
            <text x="400" y="440" textAnchor="middle" fill="#334155" fontSize={14}>
              Main Chart Placeholder — v6 で Lightweight Charts を実装
            </text>
          </svg>
          {/* Lower Indicator Pane Placeholder */}
          <div style={s.lowerPane}>
            <span style={{ color: C.muted, fontSize: 12 }}>Lower Indicator Pane Placeholder</span>
          </div>
        </div>
        {/* candles 件数表示 */}
        {candles.data && (
          <p style={{ ...s.muted, fontSize: 11, marginTop: 4 }}>
            Candles: {candles.data.candles.length} bars
            {candles.data.cachedAt && ` · cached ${new Date(candles.data.cachedAt).toLocaleTimeString('ja-JP')}`}
          </p>
        )}
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
                <IndicatorCard
                  id="ma"
                  label="MA"
                  value={`MA: ${indicators.data.indicators.ma.crossStatus}`}
                  status={indicators.data.indicators.ma.status as 'bullish' | 'bearish' | 'neutral'}
                />
                <IndicatorCard
                  id="rsi"
                  label="RSI"
                  value={`RSI: ${indicators.data.indicators.rsi.value.toFixed(1)} ${indicators.data.indicators.rsi.status}`}
                  status={indicators.data.indicators.rsi.status as 'bullish' | 'bearish' | 'neutral'}
                />
                <IndicatorCard
                  id="macd"
                  label="MACD"
                  value={`MACD: ${indicators.data.indicators.macd.crossStatus}`}
                  status={indicators.data.indicators.macd.status as 'bullish' | 'bearish' | 'neutral'}
                />
                <IndicatorCard
                  id="atr"
                  label="ATR"
                  value={`ATR: ${indicators.data.indicators.atr.status}`}
                  status="neutral"
                />
                <IndicatorCard
                  id="bb"
                  label="BB"
                  value={`BB: ${indicators.data.indicators.bb.position}`}
                  status={indicators.data.indicators.bb.status as 'bullish' | 'bearish' | 'neutral'}
                />
                <IndicatorCard
                  id="bias"
                  label="Bias"
                  value={indicators.data.indicators.bias.label}
                  status={indicators.data.indicators.bias.status as 'bullish' | 'bearish' | 'neutral'}
                />
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════
              8. recent-signals
              ══════════════════════════════════════ */}
          <section style={{ ...s.card, marginTop: 12 }}>
            <h2 style={s.cardTitle}>Recent Signals</h2>
            {signals.isLoading && <p style={s.muted}>Loading…</p>}
            {signals.data && (signals.data as { data: unknown[] }).data.length === 0 && (
              <p style={s.muted}>シグナルなし</p>
            )}
            <table style={s.signalTable}>
              <thead>
                <tr>
                  {['Time', 'Type', 'Dir', 'Score'].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {((signals.data as { data: unknown[] } | undefined)?.data ?? []).map((sig: unknown) => {
                  const signal = sig as {
                    id: string; type: string; triggeredAt: string;
                    snapshot: { scoreTotal: number; entryState: string };
                  };
                  const dir = signal.type.includes('ENTRY') ? 'BUY' : 'SELL';
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
          </section>

          {/* ══════════════════════════════════════
              7. chart-notes（v5.1 = React state のみ）
              ══════════════════════════════════════ */}
          <section style={{ ...s.card, marginTop: 12 }}>
            <h2 style={s.cardTitle}>Chart Notes <span style={s.stub}>v5.1 メモリのみ</span></h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                style={s.noteInput}
                placeholder="Setup note — 例: 1.0840 抜けで買い"
                value={notes.setup}
                onChange={(e) => setNotes({ ...notes, setup: e.target.value })}
              />
              <input
                style={s.noteInput}
                placeholder="Invalidation — 例: CPI 前なので見送り"
                value={notes.invalidation}
                onChange={(e) => setNotes({ ...notes, invalidation: e.target.value })}
              />
              <textarea
                style={{ ...s.noteInput, height: 64, resize: 'vertical' }}
                placeholder="Memo（自由記述）"
                value={notes.memo}
                onChange={(e) => setNotes({ ...notes, memo: e.target.value })}
              />
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
                  color={trades.data.activeTrade.side === 'BUY' ? C.bullish : C.bearish}
                />
                <TradeRow label="Entry"   value={trades.data.activeTrade.entryPrice.toFixed(4)} />
                <TradeRow label="SL"
                  value={trades.data.activeTrade.stopLoss?.toFixed(4) ?? '—'}
                  color={C.bearish}
                />
                <TradeRow label="TP"
                  value={trades.data.activeTrade.takeProfit?.toFixed(4) ?? '—'}
                  color={C.info}
                />
                <TradeRow label="R:R"
                  value={trades.data.activeTrade.rrRatio != null ? `${trades.data.activeTrade.rrRatio}` : '—'}
                  color={C.bullish}
                />
                <TradeRow label="Lot"   value={`${trades.data.activeTrade.lotSize} lot`} />
                {trades.data.activeTrade.expectedLoss != null && (
                  <TradeRow label="Exp Loss"
                    value={`¥${trades.data.activeTrade.expectedLoss.toLocaleString()}`}
                    color={C.bearish}
                  />
                )}
                {trades.data.activeTrade.expectedGain != null && (
                  <TradeRow label="Exp Gain"
                    value={`+¥${trades.data.activeTrade.expectedGain.toLocaleString()}`}
                    color={C.bullish}
                  />
                )}
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════
              6. prediction-overlay-panel
              FREE | BASIC → ロック状態 UI
              PRO | PRO_PLUS | ADMIN → stub 表示
              ══════════════════════════════════════ */}
          <section style={{ ...s.card, marginTop: 12 }}>
            <h2 style={s.cardTitle}>
              Prediction Overlay
              {!isPro && <span style={s.proBadge}>PRO</span>}
            </h2>
            {!isPro ? (
              /* ── FREE / BASIC: ロック状態 UI（SPEC_v51_part10 §10.10 準拠） ── */
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
                <TradeRow label="Confidence"    value={prediction.data.confidence} />
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
  label,
  value,
  status,
}: {
  id: string;
  label: string;
  value: string;
  status: 'bullish' | 'bearish' | 'neutral';
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
  pageTitle:     { fontSize: 20, fontWeight: 700, color: C.text, margin: 0 },
  pairBadge:     { background: 'rgba(99,102,241,0.15)', color: '#6366f1', borderRadius: 6, padding: '3px 8px', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 },
  tfBadge:       { background: '#1a1f2e', border: '1px solid #2d3748', color: C.label, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontFamily: 'monospace' },
  price:         { fontSize: 22, fontWeight: 700, fontFamily: 'monospace' },
  overviewItem:  { fontSize: 13, color: C.label },
  toolbar:       { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12 },
  toolbarGroup:  { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  toolbarLabel:  { fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 },
  toolBtn:       { background: '#0f1117', border: `1px solid ${C.border}`, borderRadius: 5, color: C.label, padding: '4px 8px', fontSize: 12, cursor: 'pointer' },
  toolBtnActive: { background: 'rgba(99,102,241,0.2)', borderColor: '#6366f1', color: '#a5b4fc' },
  card:          { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 0 },
  cardTitle:     { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.label, marginBottom: 12 },
  muted:         { color: C.muted, fontSize: 13, margin: 0 },
  stub:          { marginLeft: 6, fontSize: 10, color: C.neutral, background: 'rgba(232,184,48,0.1)', borderRadius: 4, padding: '1px 6px', fontWeight: 400, letterSpacing: 0, textTransform: 'none' as const },
  mainChartPlaceholder: { background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 10, height: 480, overflow: 'hidden', position: 'relative' as const },
  lowerPane:     { height: 80, background: '#0c0f18', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bottomGrid:    { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12, marginTop: 12 },
  bottomLeft:    {},
  bottomRight:   {},
  indGrid:       { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  indCard:       { background: C.bg, border: '1px solid', borderRadius: 8, padding: '10px 12px' },
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