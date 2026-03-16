/**
 * apps/web/src/pages/ReliabilityLab.tsx
 *
 * PG-R1 Plugin Reliability Dashboard
 * URL: /research/plugins
 *
 * 仕様: fxde_pg_level_screen_spec_plugin_reliability_lab.md §5
 *
 * Phase9 追加実装:
 *   - Score Distribution histogram（9.2）
 *   - Stop Candidates 専用セクション（9.3）
 *
 * v1 実装範囲:
 *   - Plugin Comparison Table（信頼度スコア一覧）
 *   - KPI Summary Cards（4枚）
 *   - Plugin Detail → /research/plugins/:pluginKey（将来実装）への導線
 *   - suppress / stop_candidate 状態バッジ
 *   - manual recompute trigger（POST /api/v1/plugins/recompute）
 *
 * データソース:
 *   GET /api/v1/plugins/reliability
 *   GET /api/v1/plugins/adaptive-ranking
 *   GET /api/v1/plugins/adaptive-ranking/stop-candidates
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pluginsRankingApi } from '../lib/api';
import type { PluginReliabilityItem, PluginRankingItem, PluginStopCandidateItem, PluginRankingHistoryItem } from '@fxde/types';

// ── Query Keys ───────────────────────────────────────────────────────────────

const labKeys = {
  reliability:    (f?: object) => ['plugins', 'reliability', f]           as const,
  ranking:        (f?: object) => ['plugins', 'ranking', f]               as const,
  stopCandidates: ()           => ['plugins', 'stop-candidates']          as const,
  history:        (k: string)  => ['plugins', 'ranking-history', k]       as const,
};

// ── Sub-components ───────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    active:         { label: 'Active',         cls: 'bg-green-900/40 text-green-400 border border-green-700/50' },
    demoted:        { label: 'Demoted',         cls: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/50' },
    suppressed:     { label: 'Suppressed',      cls: 'bg-orange-900/40 text-orange-400 border border-orange-700/50' },
    stop_candidate: { label: 'Stop Candidate',  cls: 'bg-red-900/40 text-red-400 border border-red-700/50' },
  };
  const { label, cls } = cfg[state] ?? { label: state, cls: 'bg-slate-700 text-slate-300' };
  return (
    <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

function SampleBadge({ count }: { count: number }) {
  if (count >= 100) return null;
  const cls = count < 30
    ? 'text-red-400 bg-red-900/30 border border-red-700/50'
    : 'text-yellow-400 bg-yellow-900/30 border border-yellow-700/50';
  const label = count < 30 ? 'Very Low Sample' : 'Low Sample';
  return (
    <span className={`ml-1 inline-block text-[9px] font-mono px-1 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Reliability Trend Chart（SVG sparkline）──────────────────────────────────

function TrendChart({ pluginKey }: { pluginKey: string }) {
  const { data: history = [], isLoading } = useQuery<PluginRankingHistoryItem[]>({
    queryKey: labKeys.history(pluginKey),
    queryFn:  () => pluginsRankingApi.getHistory(pluginKey),
    retry:    false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="text-xs text-slate-500 py-2">Loading...</div>;
  }
  if (history.length < 2) {
    return <div className="text-xs text-slate-600 py-2 italic">Not enough history data.</div>;
  }

  const W = 240;
  const H = 48;
  const PAD = 4;
  const scores = history.map((h) => h.finalRankScore);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores, minS + 0.001);

  const toX = (i: number) => PAD + (i / (scores.length - 1)) * (W - PAD * 2);
  const toY = (s: number) => H - PAD - ((s - minS) / (maxS - minS)) * (H - PAD * 2);

  const points = scores.map((s, i) => `${toX(i)},${toY(s)}`).join(' ');
  const lastScore = scores[scores.length - 1];
  const lastColor = lastScore >= 0.7 ? '#2EC96A' : lastScore >= 0.5 ? '#E8B830' : '#E05252';

  return (
    <div>
      <svg width={W} height={H} className="overflow-visible">
        {/* threshold lines */}
        <line x1={PAD} x2={W - PAD} y1={toY(0.7)} y2={toY(0.7)}
              stroke="#2EC96A" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
        <line x1={PAD} x2={W - PAD} y1={toY(0.5)} y2={toY(0.5)}
              stroke="#E8B830" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
        {/* sparkline */}
        <polyline points={points} fill="none" stroke={lastColor} strokeWidth={1.5} opacity={0.85} />
        {/* last point dot */}
        <circle cx={toX(scores.length - 1)} cy={toY(lastScore)} r={3} fill={lastColor} />
      </svg>
      <div className="flex justify-between text-[9px] text-slate-600 mt-0.5" style={{ width: W }}>
        <span>{history[0].decidedAt.slice(0, 10)}</span>
        <span>{history[history.length - 1].decidedAt.slice(0, 10)}</span>
      </div>
    </div>
  );
}

// ── Score Distribution Histogram ─────────────────────────────────────────────

const SCORE_BINS = [
  { label: '0.0–0.2', min: 0.0, max: 0.2, color: '#E05252' },
  { label: '0.2–0.4', min: 0.2, max: 0.4, color: '#E05252' },
  { label: '0.4–0.6', min: 0.4, max: 0.6, color: '#E8B830' },
  { label: '0.6–0.8', min: 0.6, max: 0.8, color: '#2EC96A' },
  { label: '0.8–1.0', min: 0.8, max: 1.0, color: '#2EC96A' },
];

function ScoreDistribution({ rows }: { rows: PluginReliabilityItem[] }) {
  if (rows.length === 0) return null;

  const bins = SCORE_BINS.map((b) => ({
    ...b,
    count: rows.filter((r) => r.reliabilityScore >= b.min && r.reliabilityScore < b.max).length,
  }));
  // 0.8–1.0 の上限は 1.0 を含める
  bins[bins.length - 1].count = rows.filter(
    (r) => r.reliabilityScore >= 0.8 && r.reliabilityScore <= 1.0,
  ).length;

  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Score Distribution</h3>
      <div className="flex items-end gap-2 h-24">
        {bins.map((b) => {
          const pct = (b.count / maxCount) * 100;
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-400">{b.count}</span>
              <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: b.color, opacity: 0.8 }} />
              <span className="text-[9px] text-slate-500 text-center">{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stop Candidates Section ───────────────────────────────────────────────────

function StopCandidatesSection({ items }: { items: PluginStopCandidateItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">⚠️ Stop Candidates</h3>
        <p className="text-xs text-slate-500">No stop candidates currently.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-red-900/40 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-red-400 mb-3">
        ⚠️ Stop Candidates ({items.length})
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.pluginKey}
            className="flex items-center justify-between bg-red-900/20 border border-red-900/30 rounded px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-200">{item.pluginKey}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-700/50">
                {item.state}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>score: <span className="text-red-400 font-bold">{item.reliabilityScore.toFixed(3)}</span></span>
              <span>n={item.sampleSize}</span>
              <span>action: <span className="font-mono text-orange-400">{item.action}</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReliabilityLab() {
  const qc = useQueryClient();

  const [filterSymbol,    setFilterSymbol]    = useState('');
  const [filterTimeframe, setFilterTimeframe] = useState('');
  const [toastVisible,    setToastVisible]    = useState(false);

  const filter = {
    ...(filterSymbol    ? { symbol:    filterSymbol }    : {}),
    ...(filterTimeframe ? { timeframe: filterTimeframe } : {}),
  };

  const { data: reliabilityRows = [], isLoading: rLoading } =
    useQuery<PluginReliabilityItem[]>({
      queryKey: labKeys.reliability(filter),
      queryFn:  () => pluginsRankingApi.getReliability(filter),
      retry:    false,
    });

  const { data: rankingRows = [], isLoading: kLoading } =
    useQuery<PluginRankingItem[]>({
      queryKey: labKeys.ranking(filter),
      queryFn:  () => pluginsRankingApi.getRanking(filter),
      retry:    false,
    });

  const { data: stopCandidates = [] } =
    useQuery<PluginStopCandidateItem[]>({
      queryKey: labKeys.stopCandidates(),
      queryFn:  () => pluginsRankingApi.getStopCandidates(),
      retry:    false,
    });

  const recompute = useMutation({
    mutationFn: () => pluginsRankingApi.recompute(),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['plugins'] });
    },
    onSettled: () => {
      setToastVisible(true);
    },
  });

  const isLoading = rLoading || kLoading;
  useEffect(() => {
    if (!toastVisible) return;
    const id = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(id);
  }, [toastVisible]);

  // trend chart の展開対象 pluginKey
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  // KPI 計算
  const total       = reliabilityRows.length;
  const activeCount = reliabilityRows.filter((r) => r.state === 'active').length;
  const stopCount   = reliabilityRows.filter((r) =>
    r.state === 'stop_candidate' || r.state === 'suppressed'
  ).length;
  const bestPlugin  = [...reliabilityRows].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];

  // ranking map（action 参照用）
  const rankingMap = new Map<string, PluginRankingItem>(
    rankingRows.map((r) => [r.pluginKey, r]),
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Plugin Reliability Lab</h1>
          <p className="text-sm text-slate-400 mt-1">
            Adaptive ranking state · Plugin performance overview
          </p>
        </div>
        <button
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500
                     disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {recompute.isPending ? (
            <span className="animate-spin text-base">⟳</span>
          ) : (
            <span>⟳</span>
          )}
          Recompute
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Symbol (e.g. USDJPY)"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5
                     text-sm text-slate-200 placeholder-slate-500 focus:outline-none
                     focus:border-blue-500 w-44"
        />
        <select
          value={filterTimeframe}
          onChange={(e) => setFilterTimeframe(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5
                     text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Timeframes</option>
          {['M1','M5','M15','M30','H1','H4','H8','D1','W1','MN'].map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>
        {(filterSymbol || filterTimeframe) && (
          <button
            onClick={() => { setFilterSymbol(''); setFilterTimeframe(''); }}
            className="text-xs text-slate-400 hover:text-slate-200 px-2"
          >
            Reset
          </button>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Tracked Plugins"  value={total} />
        <KpiCard label="Active"           value={activeCount}
                 sub={`${total > 0 ? Math.round(activeCount / total * 100) : 0}%`} />
        <KpiCard label="Suppressed / Stop" value={stopCount} />
        <KpiCard
          label="Best Plugin"
          value={bestPlugin?.pluginKey ?? '—'}
          sub={bestPlugin ? `score ${bestPlugin.reliabilityScore.toFixed(3)}` : undefined}
        />
      </div>

      {/* ── Plugin Comparison Table ── */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-20">Loading...</div>
      ) : reliabilityRows.length === 0 ? (
        <div className="text-center text-slate-500 py-20 border border-dashed border-slate-700 rounded-lg">
          No reliability data yet.
          <br />
          <span className="text-xs">Run Recompute or wait for the next scheduled cycle (5 min).</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Plugin</th>
                <th className="text-right px-4 py-3">Score</th>
                <th className="text-right px-4 py-3">Win Rate</th>
                <th className="text-right px-4 py-3">Samples</th>
                <th className="text-right px-4 py-3">Avg Return</th>
                <th className="text-right px-4 py-3">Stability</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {reliabilityRows.map((row, i) => {
                const ranking = rankingMap.get(row.pluginKey);
                const rowCls = i % 2 === 0
                  ? 'bg-slate-900'
                  : 'bg-slate-800/50';
                return (
                  <>
                    <tr
                      key={row.id}
                      className={`${rowCls} hover:bg-slate-700/50 transition-colors cursor-pointer`}
                      onClick={() => setExpandedPlugin(expandedPlugin === row.pluginKey ? null : row.pluginKey)}
                    >
                    <td className="px-4 py-3 font-mono text-slate-200">
                      <span className="mr-1 text-slate-500 text-xs">
                        {expandedPlugin === row.pluginKey ? '▾' : '▸'}
                      </span>
                      {row.pluginKey}
                      <SampleBadge count={row.sampleSize} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={
                        row.reliabilityScore >= 0.7 ? 'text-green-400' :
                        row.reliabilityScore >= 0.5 ? 'text-yellow-400' :
                        'text-red-400'
                      }>
                        {row.reliabilityScore.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {(row.winRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {row.sampleSize}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={row.avgReturn >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {(row.avgReturn * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {row.stabilityScore.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StateBadge state={row.state} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-mono text-slate-400">
                        {ranking?.action ?? '—'}
                      </span>
                    </td>
                  </tr>
                  {expandedPlugin === row.pluginKey && (
                    <tr className="bg-slate-900/80">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="flex items-start gap-4">
                          <div>
                            <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">
                              Score Trend (finalRankScore)
                            </p>
                            <TrendChart pluginKey={row.pluginKey} />
                          </div>
                          <div className="text-xs text-slate-500 mt-5 space-y-0.5">
                            <div>Expectancy: <span className="text-slate-300">{row.expectancy.toFixed(4)}</span></div>
                            <div>Avg MFE: <span className="text-slate-300">{row.avgMfe.toFixed(4)}</span></div>
                            <div>Avg MAE: <span className="text-slate-300">{row.avgMae.toFixed(4)}</span></div>
                            <div>Confidence: <span className="text-slate-300">{row.confidenceScore.toFixed(3)}</span></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Phase9: Score Distribution + Stop Candidates ── */}
      {reliabilityRows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <ScoreDistribution rows={reliabilityRows} />
          <StopCandidatesSection items={stopCandidates} />
        </div>
      )}

      {/* ── Recompute result toast ── */}
      {toastVisible && recompute.isSuccess && (
        <div className="fixed bottom-6 right-6 bg-green-800 border border-green-600
                        rounded-lg px-4 py-2 text-sm text-green-200 shadow-lg z-50">
          ✓ Recompute queued
        </div>
      )}
      {toastVisible && recompute.isError && (
        <div className="fixed bottom-6 right-6 bg-red-800 border border-red-600
                        rounded-lg px-4 py-2 text-sm text-red-200 shadow-lg z-50 max-w-xs">
          <div>✗ Recompute failed</div>
          {recompute.error instanceof Error && (
            <div className="mt-1 text-xs text-red-300 font-mono break-all">
              {recompute.error.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}