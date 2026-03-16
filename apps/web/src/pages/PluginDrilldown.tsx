/**
 * apps/web/src/pages/PluginDrilldown.tsx
 *
 * URL: /research/plugins/:pluginKey
 *
 * 表示内容:
 *   - TrendChart 拡大（finalRankScore 時系列）
 *   - Condition Breakdown テーブル（patternType / symbolTF / direction）
 *   - 生 PluginEvent 履歴テーブル（最新50件）
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery }               from '@tanstack/react-query';
import { pluginsRankingApi }      from '../lib/api';
import type {
  PluginReliabilityItem,
  PluginRankingHistoryItem,
} from '@fxde/types';
import type { PluginConditionBreakdown, ConditionBreakdownRow, PluginEventRow } from '../lib/api';

// ── Query Keys ────────────────────────────────────────────────────────────────

const keys = {
  reliability: (k: string)  => ['plugins', 'reliability-single', k] as const,
  history:     (k: string)  => ['plugins', 'ranking-history', k]    as const,
  breakdown:   (k: string)  => ['plugins', 'condition-breakdown', k] as const,
  events:      (k: string)  => ['plugins', 'events', k]              as const,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TrendChartLarge({ history }: { history: PluginRankingHistoryItem[] }) {
  if (history.length < 2) {
    return (
      <div className="text-xs text-slate-500 italic py-4">
        履歴データ不足（データ蓄積後に表示されます）
      </div>
    );
  }

  const W = 600; const H = 120; const PAD = 8;
  const scores  = history.map((h) => h.finalRankScore);
  const globals = history.map((h) => h.globalScore);
  const minS = Math.min(...scores, ...globals);
  const maxS = Math.max(...scores, ...globals, minS + 0.001);

  const toX  = (i: number) => PAD + (i / (scores.length - 1)) * (W - PAD * 2);
  const toY  = (s: number) => H - PAD - ((s - minS) / (maxS - minS)) * (H - PAD * 2);
  const pts  = (arr: number[]) => arr.map((s, i) => `${toX(i)},${toY(s)}`).join(' ');

  const lastScore = scores[scores.length - 1];
  const mainColor = lastScore >= 0.7 ? '#2EC96A' : lastScore >= 0.5 ? '#E8B830' : '#E05252';

  return (
    <div>
      <svg width={W} height={H} style={{ background: 'transparent', overflow: 'visible' }}>
        {/* Y軸ガイドライン */}
        {[0.3, 0.5, 0.7].map((v) => (
          <line
            key={v}
            x1={PAD} y1={toY(v)} x2={W - PAD} y2={toY(v)}
            stroke="#1e293b" strokeWidth={1} strokeDasharray="4,4"
          />
        ))}
        {[0.3, 0.5, 0.7].map((v) => (
          <text key={`l${v}`} x={PAD - 2} y={toY(v) + 3} fill="#475569" fontSize={8} textAnchor="end">
            {v.toFixed(1)}
          </text>
        ))}
        {/* globalScore（薄い線） */}
        <polyline
          points={pts(globals)}
          fill="none" stroke="#334155" strokeWidth={1.5} opacity={0.6}
        />
        {/* finalRankScore（メイン線） */}
        <polyline
          points={pts(scores)}
          fill="none" stroke={mainColor} strokeWidth={2}
        />
        {/* 最新点 */}
        <circle
          cx={toX(scores.length - 1)} cy={toY(lastScore)}
          r={4} fill={mainColor}
        />
      </svg>
      <div className="flex gap-4 mt-1 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span style={{ background: mainColor }} className="inline-block w-3 h-0.5" />
          finalRankScore
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-slate-600" />
          globalScore
        </span>
      </div>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: ConditionBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{title}</p>
        <p className="text-xs text-slate-600 italic">未集計</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-600 text-[10px]">
            <th className="text-left py-0.5">条件</th>
            <th className="text-right py-0.5">N</th>
            <th className="text-right py-0.5">Win%</th>
            <th className="text-right py-0.5">AvgReturn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-slate-800">
              <td className="py-1 font-mono text-slate-300 truncate max-w-[120px]" title={row.key}>
                {row.key}
              </td>
              <td className="py-1 text-right text-slate-400">{row.sampleSize}</td>
              <td className={`py-1 text-right font-medium ${
                row.winRate >= 0.6 ? 'text-green-400' :
                row.winRate >= 0.45 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {(row.winRate * 100).toFixed(1)}%
              </td>
              <td className={`py-1 text-right ${
                row.avgReturn > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {row.avgReturn.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsTable({ events }: { events: PluginEventRow[] }) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-slate-600 italic py-4">
        シグナルイベントなし（OANDA接続後にデータが蓄積されます）
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-max w-full text-xs">
        <thead>
          <tr className="bg-slate-800 text-slate-400 text-[10px] uppercase">
            <th className="text-left px-2 py-2 whitespace-nowrap">日時</th>
            <th className="text-left px-2 py-2 whitespace-nowrap">Pattern</th>
            <th className="text-left px-2 py-2 whitespace-nowrap">Symbol/TF</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Dir</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Session</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Trend</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">ATR</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">HigherTrend</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Align</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Swing</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Breakout</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Hour</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">DOW</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Market</th>
            <th className="text-right px-2 py-2 whitespace-nowrap">Conf</th>
            <th className="text-right px-2 py-2 whitespace-nowrap">Return%</th>
            <th className="text-center px-2 py-2 whitespace-nowrap">Eval</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id} className="border-t border-slate-800 hover:bg-slate-800/30">
              <td className="px-2 py-1.5 text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {new Date(ev.emittedAt).toLocaleString('ja-JP', {
                  month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })}
              </td>
              <td className="px-2 py-1.5 font-mono text-slate-300 text-[10px] whitespace-nowrap">
                {ev.patternType ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-slate-400 text-[10px] whitespace-nowrap">
                {ev.symbol}/{ev.timeframe}
              </td>
              <td className="px-2 py-1.5 text-center text-[10px] whitespace-nowrap">
                <span className={
                  ev.direction === 'BUY'  ? 'text-green-400 font-bold' :
                  ev.direction === 'SELL' ? 'text-red-400 font-bold' :
                  'text-slate-500'
                }>
                  {ev.direction ?? '—'}
                </span>
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.session ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.currentTrend ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.atrRegime ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.higherTrend ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.trendAlignment ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.recentSwingBias ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.breakoutContext ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.hourOfDay ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.dayOfWeek ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 font-mono text-[10px] whitespace-nowrap">
                {ev.marketType ?? '—'}
              </td>
              <td className="px-2 py-1.5 text-right text-slate-400 text-[10px] whitespace-nowrap">
                {ev.confidence !== null ? (ev.confidence * 100).toFixed(0) + '%' : '—'}
              </td>
              <td className="px-2 py-1.5 text-right text-[10px] whitespace-nowrap">
                {ev.returnPct !== null ? (
                  <span className={ev.returnPct > 0 ? 'text-green-400' : 'text-red-400'}>
                    {(ev.returnPct * 100).toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-center whitespace-nowrap">
                {ev.evaluated ? (
                  <span className="text-green-400 text-[10px]">✓</span>
                ) : (
                  <span className="text-slate-700 text-[10px]">○</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PluginDrilldown() {
  const { pluginKey } = useParams<{ pluginKey: string }>();
  const navigate      = useNavigate();

  const key = pluginKey ?? '';

  const { data: reliabilityList = [] } = useQuery<PluginReliabilityItem[]>({
    queryKey: keys.reliability(key),
    queryFn:  () => pluginsRankingApi.getReliability(),
    enabled:  !!key,
  });
  const reliability = reliabilityList.find((r) => r.pluginKey === key);

  const { data: history = [], isLoading: hLoading } = useQuery<PluginRankingHistoryItem[]>({
    queryKey:  keys.history(key),
    queryFn:   () => pluginsRankingApi.getHistory(key),
    enabled:   !!key,
    staleTime: 60_000,
  });

  const { data: breakdown, isLoading: bLoading } = useQuery<PluginConditionBreakdown>({
    queryKey:  keys.breakdown(key),
    queryFn:   () => pluginsRankingApi.getConditionBreakdown(key),
    enabled:   !!key,
    staleTime: 120_000,
  });

  const { data: events = [], isLoading: eLoading } = useQuery<PluginEventRow[]>({
    queryKey:  keys.events(key),
    queryFn:   () => pluginsRankingApi.getRecentEvents(key),
    enabled:   !!key,
    staleTime: 30_000,
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/research/plugins')}
          className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1 rounded
                     border border-slate-700 hover:border-slate-500 transition-colors"
        >
          ← 一覧に戻る
        </button>
        <div>
          <h1 className="text-xl font-bold font-mono text-slate-100">{key}</h1>
          <p className="text-xs text-slate-500">Plugin Drilldown</p>
        </div>
      </div>

      {/* KPI サマリー */}
      {reliability && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Reliability Score', value: reliability.reliabilityScore.toFixed(3),
              color: reliability.reliabilityScore >= 0.7 ? '#2EC96A' :
                     reliability.reliabilityScore >= 0.5 ? '#E8B830' : '#E05252' },
            { label: 'Win Rate',   value: (reliability.winRate * 100).toFixed(1) + '%',  color: undefined },
            { label: 'Samples',    value: reliability.sampleSize,                         color: undefined },
            { label: 'Avg Return', value: reliability.avgReturn.toFixed(4),
              color: reliability.avgReturn > 0 ? '#2EC96A' : '#E05252' },
            { label: 'State',      value: reliability.state,
              color: reliability.state === 'active' ? '#2EC96A' :
                     reliability.state === 'demoted' ? '#E8B830' : '#E05252' },
          ].map((item) => (
            <div key={item.label} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <p className="text-[10px] text-slate-400 mb-1">{item.label}</p>
              <p className="text-lg font-bold font-mono" style={{ color: item.color ?? '#e2e8f0' }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Trend Chart 拡大 */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Score Trend</h2>
        {hLoading ? (
          <p className="text-xs text-slate-500">Loading...</p>
        ) : (
          <TrendChartLarge history={history} />
        )}
      </section>

      {/* Condition Breakdown */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          条件別統計
          {breakdown && (
            <span className="ml-2 text-slate-500 font-normal text-xs">
              評価済み {breakdown.totalEvaluated} 件
            </span>
          )}
        </h2>
        {bLoading ? (
          <p className="text-xs text-slate-500">Loading...</p>
        ) : breakdown ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <BreakdownTable title="パターン別"    rows={breakdown.byPattern} />
              <BreakdownTable title="Symbol / TF 別" rows={breakdown.bySymbolTf} />
              <BreakdownTable title="方向別"         rows={breakdown.byDirection} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-slate-700/50">
              <BreakdownTable title="セッション別"   rows={breakdown.bySession   ?? []} />
              <BreakdownTable title="トレンド別"     rows={breakdown.byTrend     ?? []} />
              <BreakdownTable title="ATR Regime別"   rows={breakdown.byAtrRegime ?? []} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-slate-700/50">
              <BreakdownTable title="上位トレンド別"  rows={breakdown.byHigherTrend    ?? []} />
              <BreakdownTable title="トレンド整合別"  rows={breakdown.byTrendAlignment ?? []} />
              <BreakdownTable title="Swing Bias別"   rows={breakdown.bySwingBias      ?? []} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-3 border-t border-slate-700/50">
              <BreakdownTable title="Breakout別"     rows={breakdown.byBreakoutContext ?? []} />
              <BreakdownTable title="時間帯別(UTC)"  rows={breakdown.byHour            ?? []} />
              <BreakdownTable title="曜日別"         rows={breakdown.byDayOfWeek       ?? []} />
              <BreakdownTable title="市場種別"       rows={breakdown.byMarketType      ?? []} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600 italic">データなし</p>
        )}
      </section>

      {/* 生イベント履歴 */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          シグナルイベント履歴（最新50件）
          {events.length > 0 && (
            <span className="ml-2 text-slate-500 font-normal text-xs">
              評価済: {events.filter((e) => e.evaluated).length} / {events.length}
            </span>
          )}
        </h2>
        {eLoading ? (
          <p className="text-xs text-slate-500">Loading...</p>
        ) : (
          <EventsTable events={events} />
        )}
      </section>
    </div>
  );
}