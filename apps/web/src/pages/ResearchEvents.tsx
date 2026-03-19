/**
 * apps/web/src/pages/ResearchEvents.tsx
 *
 * URL: /research/events
 *
 * 表示内容:
 *   - PluginEvent 履歴一覧（signal のみ・全plugin対象）
 *   - patternType / session / trend / atrRegime などの context 表示
 *   - 評価済み/未評価フィルタ
 *   - pluginKey 絞り込み
 *
 * 使用 API:
 *   GET /api/v1/plugins/reliability  → pluginKey 一覧取得
 *   GET /api/v1/plugins/reliability/events/:pluginKey → イベント取得
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pluginsRankingApi } from '../lib/api';
import type { PluginReliabilityItem } from '@fxde/types';
import type { PluginEventRow } from '../lib/api';

// ── helpers ──────────────────────────────────────────────────────────────────

function pct(v: number | null): string {
  if (v === null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function pip(v: number | null): string {
  if (v === null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}p`;
}

function badge(label: string, color: string) {
  return (
    <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${color}`}>
      {label}
    </span>
  );
}

function EvaluatedBadge({ evaluated }: { evaluated: boolean }) {
  return evaluated
    ? badge('evaluated', 'bg-green-900/40 text-green-400 border border-green-700/50')
    : badge('pending', 'bg-slate-700/60 text-slate-400 border border-slate-600/50');
}

function DirectionBadge({ dir }: { dir: string | null }) {
  if (!dir) return <span className="text-slate-500">—</span>;
  const cls =
    dir === 'BUY'  ? 'text-green-400' :
    dir === 'SELL' ? 'text-red-400'   : 'text-slate-400';
  return <span className={`font-mono text-xs ${cls}`}>{dir}</span>;
}

// ── EventTable ────────────────────────────────────────────────────────────────

function EventTable({ events }: { events: PluginEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="text-slate-500 text-sm py-6 text-center italic">
        イベントデータがありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th className="text-left py-2 px-3">emittedAt</th>
            <th className="text-left py-2 px-3">pattern</th>
            <th className="text-left py-2 px-3">dir</th>
            <th className="text-right py-2 px-3">conf</th>
            <th className="text-left py-2 px-3">session</th>
            <th className="text-left py-2 px-3">trend</th>
            <th className="text-left py-2 px-3">atr</th>
            <th className="text-right py-2 px-3">returnPct</th>
            <th className="text-right py-2 px-3">pips</th>
            <th className="text-left py-2 px-3">status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                {new Date(e.emittedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }).slice(0, 16)}
              </td>
              <td className="py-2 px-3 text-slate-200">{e.patternType ?? '—'}</td>
              <td className="py-2 px-3"><DirectionBadge dir={e.direction} /></td>
              <td className="py-2 px-3 text-right font-mono text-slate-300">
                {e.confidence !== null ? (e.confidence * 100).toFixed(0) + '%' : '—'}
              </td>
              <td className="py-2 px-3 text-slate-400">{e.session ?? '—'}</td>
              <td className="py-2 px-3 text-slate-400">{e.currentTrend ?? '—'}</td>
              <td className="py-2 px-3 text-slate-400">{e.atrRegime ?? '—'}</td>
              <td className={`py-2 px-3 text-right font-mono ${
                e.returnPct === null ? 'text-slate-500' :
                e.returnPct > 0 ? 'text-green-400' : 'text-red-400'
              }`}>{pct(e.returnPct)}</td>
              <td className={`py-2 px-3 text-right font-mono ${
                e.resultPips === null ? 'text-slate-500' :
                e.resultPips > 0 ? 'text-green-400' : 'text-red-400'
              }`}>{pip(e.resultPips)}</td>
              <td className="py-2 px-3"><EvaluatedBadge evaluated={e.evaluated} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function ResearchEventsPage() {
  const navigate = useNavigate();
  const [selectedPlugin, setSelectedPlugin] = useState<string>('');
  const [filterEvaluated, setFilterEvaluated] = useState<'all' | 'evaluated' | 'pending'>('all');

  // plugin 一覧取得（pluginKey セレクト用）
  const { data: reliabilities = [] } = useQuery<PluginReliabilityItem[]>({
    queryKey: ['plugins', 'reliability'],
    queryFn:  () => pluginsRankingApi.getReliability(),
  });

  // pluginKey が決まったらイベント取得
  const { data: events = [], isLoading } = useQuery<PluginEventRow[]>({
    queryKey: ['plugins', 'events', selectedPlugin],
    queryFn:  () => pluginsRankingApi.getRecentEvents(selectedPlugin),
    enabled:  selectedPlugin !== '',
  });

  // フィルタ適用
  const filtered = events.filter((e) => {
    if (filterEvaluated === 'evaluated') return e.evaluated;
    if (filterEvaluated === 'pending')   return !e.evaluated;
    return true;
  });

  const pendingCount   = events.filter((e) => !e.evaluated).length;
  const evaluatedCount = events.filter((e) =>  e.evaluated).length;

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
        <h1 className="text-xl font-bold">Plugin Events</h1>
        <span className="text-slate-500 text-sm">/research/events</span>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Plugin 選択 */}
        <select
          value={selectedPlugin}
          onChange={(e) => setSelectedPlugin(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 min-w-[200px]"
        >
          <option value="">— Plugin を選択 —</option>
          {reliabilities.map((r) => (
            <option key={r.pluginKey} value={r.pluginKey}>
              {r.pluginKey} (n={r.sampleSize})
            </option>
          ))}
        </select>

        {/* 評価状態フィルタ */}
        <div className="flex gap-1">
          {(['all', 'evaluated', 'pending'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilterEvaluated(v)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                filterEvaluated === v
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {v === 'all' ? `全て (${events.length})` :
               v === 'evaluated' ? `評価済 (${evaluatedCount})` :
               `未評価 (${pendingCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        {selectedPlugin === '' ? (
          <div className="text-slate-500 text-sm py-8 text-center italic">
            上のセレクトから Plugin を選択してください
          </div>
        ) : isLoading ? (
          <div className="text-slate-400 text-sm py-8 text-center">読み込み中...</div>
        ) : (
          <>
            <div className="text-xs text-slate-500 mb-3">
              {filtered.length} 件表示（全 {events.length} 件）
            </div>
            <EventTable events={filtered} />
          </>
        )}
      </div>
    </div>
  );
}