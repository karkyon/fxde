/**
 * apps/web/src/pages/ReliabilityLab.tsx
 *
 * PG-R1 Plugin Reliability Dashboard
 * URL: /research/plugins
 *
 * 仕様: fxde_pg_level_screen_spec_plugin_reliability_lab.md §5
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
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PluginReliabilityItem, PluginRankingItem } from '@fxde/types';

// ── API helpers ──────────────────────────────────────────────────────────────

const reliabilityLabApi = {
  getReliability: (params?: { symbol?: string; timeframe?: string }) =>
    api.get<PluginReliabilityItem[]>('/plugins/reliability', { params }).then((r) => r.data),

  getRanking: (params?: { symbol?: string; timeframe?: string }) =>
    api.get<PluginRankingItem[]>('/plugins/adaptive-ranking', { params }).then((r) => r.data),

  recompute: () =>
    api.post('/plugins/recompute', {}).then((r) => r.data),
};

// ── Query Keys ───────────────────────────────────────────────────────────────

const labKeys = {
  reliability: (f?: object) => ['plugins', 'reliability', f] as const,
  ranking:     (f?: object) => ['plugins', 'ranking', f]     as const,
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReliabilityLab() {
  const qc = useQueryClient();

  const [filterSymbol,    setFilterSymbol]    = useState('');
  const [filterTimeframe, setFilterTimeframe] = useState('');

  const filter = {
    ...(filterSymbol    ? { symbol:    filterSymbol }    : {}),
    ...(filterTimeframe ? { timeframe: filterTimeframe } : {}),
  };

  const { data: reliabilityRows = [], isLoading: rLoading } =
    useQuery<PluginReliabilityItem[]>({
      queryKey: labKeys.reliability(filter),
      queryFn:  () => reliabilityLabApi.getReliability(filter),
      retry:    false,
    });

  const { data: rankingRows = [], isLoading: kLoading } =
    useQuery<PluginRankingItem[]>({
      queryKey: labKeys.ranking(filter),
      queryFn:  () => reliabilityLabApi.getRanking(filter),
      retry:    false,
    });

  const recompute = useMutation({
    mutationFn: () => reliabilityLabApi.recompute(),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const isLoading = rLoading || kLoading;

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
                  <tr key={row.id} className={`${rowCls} hover:bg-slate-700/50 transition-colors`}>
                    <td className="px-4 py-3 font-mono text-slate-200">
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Recompute result toast ── */}
      {recompute.isSuccess && (
        <div className="fixed bottom-6 right-6 bg-green-800 border border-green-600
                        rounded-lg px-4 py-2 text-sm text-green-200 shadow-lg">
          ✓ Recompute triggered
        </div>
      )}
      {recompute.isError && (
        <div className="fixed bottom-6 right-6 bg-red-800 border border-red-600
                        rounded-lg px-4 py-2 text-sm text-red-200 shadow-lg">
          ✗ Recompute failed
        </div>
      )}
    </div>
  );
}