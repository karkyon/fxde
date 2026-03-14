/**
 * apps/web/src/components/strategy/plugins/PluginToolbar.tsx
 *
 * プラグイン一覧ツールバー（フィルタ / ソート）
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.1 フィルタ / ソート定義
 */

import React from 'react';

interface PluginToolbarProps {
  filter:         string;
  sort:           string;
  onFilterChange: (value: string) => void;
  onSortChange:   (value: string) => void;
}

const FILTER_OPTIONS = [
  { value: 'all',       label: 'All' },
  { value: 'enabled',   label: 'Enabled' },
  { value: 'disabled',  label: 'Disabled' },
  { value: 'pattern',   label: 'Pattern' },
  { value: 'indicator', label: 'Indicator' },
  { value: 'strategy',  label: 'Strategy' },
  { value: 'ai',        label: 'AI' },
  { value: 'overlay',   label: 'Overlay' },
  { value: 'risk',      label: 'Risk' },
] as const;

const SORT_OPTIONS = [
  { value: 'name',        label: '名前順' },
  { value: 'updatedAt',   label: '更新日順' },
  { value: 'installedAt', label: 'インストール日順' },
  { value: 'enabled',     label: '有効状態順' },
  { value: 'recommended', label: '推奨順' },
] as const;

export function PluginToolbar({
  filter,
  sort,
  onFilterChange,
  onSortChange,
}: PluginToolbarProps) {
  return (
    <div style={s.toolbar}>
      {/* フィルタボタン群 */}
      <div style={s.filterGroup}>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            style={{
              ...s.filterBtn,
              ...(filter === opt.value ? s.filterBtnActive : {}),
            }}
            onClick={() => onFilterChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ソート選択 */}
      <div style={s.sortGroup}>
        <label style={s.sortLabel}>Sort</label>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          style={s.sortSelect}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  toolbar: {
    display:     'flex',
    flexWrap:    'wrap',
    alignItems:  'center',
    gap:         12,
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  filterGroup: {
    display:  'flex',
    flexWrap: 'wrap',
    gap:      4,
  },
  filterBtn: {
    background:   'rgba(255,255,255,0.04)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6,
    color:        '#64748b',
    fontSize:     12,
    padding:      '4px 10px',
    cursor:       'pointer',
    transition:   'all 0.15s',
  },
  filterBtnActive: {
    background: 'rgba(99,102,241,0.15)',
    border:     '1px solid rgba(99,102,241,0.4)',
    color:      '#818cf8',
    fontWeight: 600,
  },
  sortGroup: {
    display:    'flex',
    alignItems: 'center',
    gap:        6,
  },
  sortLabel: {
    fontSize: 12,
    color:    '#64748b',
  },
  sortSelect: {
    background:   'rgba(255,255,255,0.05)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color:        '#94a3b8',
    fontSize:     12,
    padding:      '4px 8px',
    cursor:       'pointer',
    outline:      'none',
  },
};