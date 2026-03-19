/**
 * apps/web/src/pages/ResearchCombinations.tsx
 *
 * URL: /research/combinations
 *
 * 表示内容:
 *   - 全 plugin の条件別 breakdown を横断的に表示
 *   - plugin × condition のヒートマップ形式
 *   - session / trend / atrRegime / breakoutContext での比較
 *
 * 使用 API:
 *   GET /api/v1/plugins/reliability          → plugin 一覧
 *   GET /api/v1/plugins/reliability/breakdown/:pluginKey → 条件別成績
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pluginsRankingApi } from '../lib/api';
import type { PluginReliabilityItem } from '@fxde/types';
import type { PluginConditionBreakdown, ConditionBreakdownRow } from '../lib/api';

// ── helpers ──────────────────────────────────────────────────────────────────

function winRateColor(wr: number): string {
  if (wr >= 0.65) return 'text-green-400';
  if (wr >= 0.55) return 'text-yellow-400';
  if (wr >= 0.45) return 'text-slate-300';
  return 'text-red-400';
}

type AxisKey = keyof Omit<PluginConditionBreakdown, 'pluginKey' | 'totalEvaluated'>;

const AXIS_OPTIONS: { key: AxisKey; label: string }[] = [
  { key: 'bySession',        label: 'Session' },
  { key: 'byTrend',          label: 'Current Trend' },
  { key: 'byHigherTrend',    label: 'Higher Trend' },
  { key: 'byTrendAlignment', label: 'Trend Alignment' },
  { key: 'byAtrRegime',      label: 'ATR Regime' },
  { key: 'bySwingBias',      label: 'Swing Bias' },
  { key: 'byBreakoutContext',label: 'Breakout Context' },
  { key: 'byPattern',        label: 'Pattern Type' },
  { key: 'byDirection',      label: 'Direction' },
  { key: 'bySymbolTf',       label: 'Symbol/TF' },
];

// ── BreakdownRow コンポーネント ────────────────────────────────────────────────

function BreakdownCell({ row }: { row: ConditionBreakdownRow }) {
  return (
    <td className="py-2 px-3 text-center">
      <div className={`text-sm font-mono font-bold ${winRateColor(row.winRate)}`}>
        {(row.winRate * 100).toFixed(0)}%
      </div>
      <div className="text-[10px] text-slate-500">n={row.sampleSize}</div>
    </td>
  );
}

// ── BreakdownMatrix ───────────────────────────────────────────────────────────

function BreakdownMatrix({
  breakdowns,
  axis,
}: {
  breakdowns: { pluginKey: string; data: PluginConditionBreakdown }[];
  axis: AxisKey;
}) {
  if (breakdowns.length === 0) {
    return <div className="text-slate-500 text-sm py-6 text-center italic">データなし</div>;
  }

  // 全pluginで出現するconditionキーの union
  const allKeys = Array.from(
    new Set(
      breakdowns.flatMap((b) => (b.data[axis] as ConditionBreakdownRow[]).map((r) => r.key)),
    ),
  ).sort();

  if (allKeys.length === 0) {
    return <div className="text-slate-500 text-sm py-6 text-center italic">データなし</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th className="text-left py-2 px-3 sticky left-0 bg-slate-900">Condition</th>
            {breakdowns.map((b) => (
              <th key={b.pluginKey} className="text-center py-2 px-3 whitespace-nowrap">
                <span className="font-mono text-[10px]">{b.pluginKey.replace(/-/g, '\u200b-')}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => (
            <tr key={key} className="border-b border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-2 px-3 sticky left-0 bg-slate-900 font-mono text-slate-300">
                {key}
              </td>
              {breakdowns.map((b) => {
                const row = (b.data[axis] as ConditionBreakdownRow[]).find((r) => r.key === key);
                return row
                  ? <BreakdownCell key={b.pluginKey} row={row} />
                  : <td key={b.pluginKey} className="py-2 px-3 text-center text-slate-700">—</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function ResearchCombinationsPage() {
  const navigate = useNavigate();
  const [selectedAxis, setSelectedAxis] = useState<AxisKey>('bySession');

  // plugin 一覧
  const { data: reliabilities = [] } = useQuery<PluginReliabilityItem[]>({
    queryKey: ['plugins', 'reliability'],
    queryFn:  () => pluginsRankingApi.getReliability(),
  });

  // 全plugin の breakdown を並列取得
  const breakdownQueries = reliabilities.map((r) => ({
    pluginKey: r.pluginKey,
    query: useQuery<PluginConditionBreakdown>({   // eslint-disable-line react-hooks/rules-of-hooks
      queryKey: ['plugins', 'condition-breakdown', r.pluginKey],
      queryFn:  () => pluginsRankingApi.getConditionBreakdown(r.pluginKey),
      enabled:  reliabilities.length > 0,
    }),
  }));

  const loaded = breakdownQueries
    .filter((q) => q.query.data !== undefined)
    .map((q) => ({ pluginKey: q.pluginKey, data: q.query.data! }));

  const isLoading = breakdownQueries.some((q) => q.query.isLoading);

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
        <h1 className="text-xl font-bold">Combinations</h1>
        <span className="text-slate-500 text-sm">/research/combinations</span>
      </div>

      <p className="text-slate-400 text-sm mb-6">
        全 Plugin の条件別勝率を横断比較します。各セルは winRate を表示しています。
      </p>

      {/* 軸セレクタ */}
      <div className="flex flex-wrap gap-2 mb-6">
        {AXIS_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSelectedAxis(opt.key)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              selectedAxis === opt.key
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-500 mb-3">
          {loaded.length}/{reliabilities.length} plugin 読み込み済み
          {isLoading && ' · 読み込み中...'}
        </div>
        <BreakdownMatrix breakdowns={loaded} axis={selectedAxis} />
      </div>

      {/* 凡例 */}
      <div className="mt-4 flex gap-4 text-xs text-slate-500">
        <span><span className="text-green-400 font-bold">65%+</span> 高信頼</span>
        <span><span className="text-yellow-400 font-bold">55-64%</span> 中</span>
        <span><span className="text-slate-300 font-bold">45-54%</span> 低</span>
        <span><span className="text-red-400 font-bold">&lt;45%</span> 不振</span>
      </div>
    </div>
  );
}