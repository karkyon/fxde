/**
 * apps/web/src/pages/ResearchJobs.tsx
 *
 * URL: /research/jobs
 *
 * 表示内容:
 *   - 現在の Reliability / Ranking 状態サマリー
 *   - 手動 Recompute トリガーボタン
 *   - 停止候補 plugin 一覧
 *   - 最終更新時刻
 *
 * 使用 API:
 *   GET  /api/v1/plugins/reliability              → plugin 状態一覧
 *   GET  /api/v1/plugins/adaptive-ranking/stop-candidates → 停止候補
 *   POST /api/v1/plugins/recompute                → 再計算トリガー
 */

import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pluginsRankingApi } from '../lib/api';
import type { PluginReliabilityItem, PluginStopCandidateItem } from '@fxde/types';

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── StateBadge ────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    active:         { label: 'Active',        cls: 'bg-green-900/40 text-green-400 border border-green-700/50' },
    demoted:        { label: 'Demoted',        cls: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/50' },
    suppressed:     { label: 'Suppressed',     cls: 'bg-orange-900/40 text-orange-400 border border-orange-700/50' },
    stop_candidate: { label: 'Stop Candidate', cls: 'bg-red-900/40 text-red-400 border border-red-700/50' },
  };
  const { label, cls } = cfg[state] ?? { label: state, cls: 'bg-slate-700 text-slate-300' };
  return (
    <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function ResearchJobsPage() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  // Reliability 一覧
  const { data: reliabilities = [], dataUpdatedAt } = useQuery<PluginReliabilityItem[]>({
    queryKey: ['plugins', 'reliability'],
    queryFn:  () => pluginsRankingApi.getReliability(),
  });

  // 停止候補
  const { data: stopCandidates = [] } = useQuery<PluginStopCandidateItem[]>({
    queryKey: ['plugins', 'stop-candidates'],
    queryFn:  () => pluginsRankingApi.getStopCandidates(),
  });

  // Recompute mutation
  const recomputeMutation = useMutation({
    mutationFn: () => pluginsRankingApi.recompute(),
    onSuccess:  () => {
      // 再計算後にデータ再取得
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  // サマリー集計
  const activeCount    = reliabilities.filter((r) => r.state === 'active').length;
  const demotedCount   = reliabilities.filter((r) => r.state === 'demoted').length;
  const suppressedCount = reliabilities.filter((r) => r.state === 'suppressed').length;
  const stopCandCount  = reliabilities.filter((r) => r.state === 'stop_candidate').length;
  const totalSamples   = reliabilities.reduce((s, r) => s + r.sampleSize, 0);

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    : '—';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/research/plugins')}
          className="text-slate-400 hover:text-slate-200 text-sm"
        >
          ← Research
        </button>
        <h1 className="text-xl font-bold">Jobs & Recompute</h1>
        <span className="text-slate-500 text-sm">/research/jobs</span>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Plugins"   value={reliabilities.length} />
        <StatCard label="Active"          value={activeCount} sub="reliabilityScore ≥ 0.70" />
        <StatCard label="Suppressed"      value={suppressedCount + demotedCount} sub="demoted + suppressed" />
        <StatCard label="Total Samples"   value={totalSamples.toLocaleString()} sub="PluginEvent 件数" />
      </div>

      {/* Recompute セクション */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">手動 Recompute</h2>
        <p className="text-xs text-slate-400 mb-4">
          未評価イベントの評価 → Reliability 再計算 → Adaptive Ranking 更新 を手動でトリガーします。
          通常は 5 分ごとに自動実行されます。
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={() => recomputeMutation.mutate()}
            disabled={recomputeMutation.isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
          >
            {recomputeMutation.isPending ? '実行中...' : '▶ Recompute 実行'}
          </button>
          {recomputeMutation.isSuccess && (
            <span className="text-green-400 text-sm">✓ キューに投入されました</span>
          )}
          {recomputeMutation.isError && (
            <span className="text-red-400 text-sm">エラーが発生しました</span>
          )}
        </div>
        <div className="text-xs text-slate-600 mt-3">最終取得: {lastUpdated}</div>
      </div>

      {/* Plugin 状態一覧 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          Plugin 状態一覧
          <span className="text-slate-500 font-normal ml-2">({reliabilities.length} 件)</span>
        </h2>
        {reliabilities.length === 0 ? (
          <div className="text-slate-500 text-sm py-4 text-center italic">データなし</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left py-2 px-3">Plugin</th>
                  <th className="text-right py-2 px-3">Score</th>
                  <th className="text-right py-2 px-3">WinRate</th>
                  <th className="text-right py-2 px-3">Samples</th>
                  <th className="text-left py-2 px-3">State</th>
                  <th className="text-left py-2 px-3">UpdatedAt</th>
                </tr>
              </thead>
              <tbody>
                {reliabilities.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td
                      className="py-2 px-3 text-blue-400 hover:text-blue-300 cursor-pointer"
                      onClick={() => navigate(`/research/plugins/${r.pluginKey}`)}
                    >
                      {r.pluginKey}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-200">
                      {(r.reliabilityScore * 100).toFixed(1)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-200">
                      {(r.winRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-400">
                      {r.sampleSize}
                    </td>
                    <td className="py-2 px-3"><StateBadge state={r.state} /></td>
                    <td className="py-2 px-3 text-slate-500 text-[10px]">
                      {new Date(r.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }).slice(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 停止候補 */}
      {stopCandidates.length > 0 && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-red-400 mb-3">
            ⚠ 停止候補 Plugin ({stopCandCount} 件)
          </h2>
          <div className="space-y-2">
            {stopCandidates.map((c) => (
              <div key={c.pluginKey} className="flex items-center justify-between text-xs">
                <span
                  className="text-blue-400 hover:text-blue-300 cursor-pointer"
                  onClick={() => navigate(`/research/plugins/${c.pluginKey}`)}
                >
                  {c.pluginKey}
                </span>
                <div className="flex items-center gap-3 text-slate-400">
                  <span>score: {(c.reliabilityScore * 100).toFixed(1)}</span>
                  <span>n={c.sampleSize}</span>
                  <StateBadge state={c.state} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}