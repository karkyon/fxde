/**
 * apps/web/src/components/chart/IndicatorPickerModal.tsx
 *
 * TradingView 風 Indicator 選択モーダル
 *
 * 参照仕様:
 *   SPEC_v51_part10 §10「PG-07 Chart」
 *   fxde_plugin_runtime_完全設計書 §9「Frontend 統合」
 *
 * データソース:
 *   pluginStatuses — useChartPluginRuntime() が返す RuntimePluginStatus[]
 *   visibility    — Chart.tsx の pluginVisibility (Record<string, boolean>)
 *   toggle        — Chart.tsx の togglePlugin(key: string)
 *
 * category 分類:
 *   capabilities に 'chart_overlay'   → Overlays
 *   capabilities に 'chart_signal'    → Signals
 *   capabilities に 'chart_indicator' → Indicators
 *   いずれも持たない                  → Other
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { RuntimePluginStatus, RuntimePluginExecutionStatus } from '@fxde/types';

// ── 型 ──────────────────────────────────────────────────────────────────────

type Category = 'All' | 'Indicators' | 'Signals' | 'Overlays' | 'Other';

const CATEGORIES: Category[] = ['All', 'Indicators', 'Signals', 'Overlays', 'Other'];

export interface IndicatorPickerModalProps {
  open:             boolean;
  onClose:          () => void;
  pluginStatuses:   RuntimePluginStatus[];
  pluginVisibility: Record<string, boolean>;
  onTogglePlugin:   (key: string) => void;
}

// ── カテゴリ分類ヘルパー ──────────────────────────────────────────────────

function resolveCategory(capabilities: string[]): Category {
  if (capabilities.includes('chart_overlay'))   return 'Overlays';
  if (capabilities.includes('chart_signal'))    return 'Signals';
  if (capabilities.includes('chart_indicator')) return 'Indicators';
  return 'Other';
}

// ── 実行ステータス色 ──────────────────────────────────────────────────────

const STATUS_COLOR: Record<RuntimePluginExecutionStatus, string> = {
  SUCCEEDED: '#2EC96A',
  FAILED:    '#E05252',
  TIMEOUT:   '#E8B830',
  SKIPPED:   '#64748b',
};

// ── メインコンポーネント ──────────────────────────────────────────────────

export function IndicatorPickerModal({
  open,
  onClose,
  pluginStatuses,
  pluginVisibility,
  onTogglePlugin,
}: IndicatorPickerModalProps) {
  const [search,           setSearch]           = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');

  // モーダルを開くたびにリセット
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedCategory('All');
    }
  }, [open]);

  // Escape キーで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // フィルタ適用済みリスト
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pluginStatuses.filter((ps) => {
      // カテゴリフィルタ
      if (selectedCategory !== 'All') {
        const cat = resolveCategory(ps.capabilities);
        if (cat !== selectedCategory) return false;
      }
      // 検索フィルタ
      if (q) {
        const haystack = `${ps.displayName} ${ps.pluginKey} ${ps.capabilities.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [pluginStatuses, selectedCategory, search]);

  // カテゴリごとの件数（バッジ用）
  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      All: pluginStatuses.length,
      Indicators: 0, Signals: 0, Overlays: 0, Other: 0,
    };
    pluginStatuses.forEach((ps) => {
      counts[resolveCategory(ps.capabilities)]++;
    });
    return counts;
  }, [pluginStatuses]);

  const handleToggle = useCallback((key: string) => {
    onTogglePlugin(key);
  }, [onTogglePlugin]);

  if (!open) return null;

  return (
    <>
      {/* オーバーレイ */}
      <div
        style={s.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* モーダル本体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Indicators & Plugins"
        style={s.modal}
      >
        {/* ── ヘッダー ─────────────────────────────────────── */}
        <div style={s.header}>
          <span style={s.title}>Indicators &amp; Plugins</span>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── 検索 ────────────────────────────────────────── */}
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>🔍</span>
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search indicators, plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button style={s.clearBtn} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* ── ボディ（カテゴリタブ + リスト）────────────── */}
        <div style={s.body}>
          {/* カテゴリタブ（左列）*/}
          <div style={s.categoryCol}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                style={{
                  ...s.catBtn,
                  ...(selectedCategory === cat ? s.catBtnActive : {}),
                }}
                onClick={() => setSelectedCategory(cat)}
              >
                <span style={{ flex: 1 }}>{cat}</span>
                <span style={{
                  ...s.catCount,
                  ...(selectedCategory === cat ? s.catCountActive : {}),
                }}>
                  {categoryCounts[cat]}
                </span>
              </button>
            ))}
          </div>

          {/* plugin リスト */}
          <div style={s.listCol}>
            {pluginStatuses.length === 0 && (
              <div style={s.empty}>
                <p style={{ color: '#475569', fontSize: 13, marginBottom: 6 }}>
                  No plugins loaded for this symbol/timeframe.
                </p>
                <p style={{ color: '#334155', fontSize: 11 }}>
                  Plugins run on 30s poll. Wait for the next cycle.
                </p>
              </div>
            )}

            {pluginStatuses.length > 0 && filtered.length === 0 && (
              <div style={s.empty}>
                <p style={{ color: '#475569', fontSize: 13 }}>
                  No results for "{search}"
                </p>
              </div>
            )}

            {filtered.map((ps) => {
              const isOn       = pluginVisibility[ps.pluginKey] !== false;
              const cat        = resolveCategory(ps.capabilities);
              const statusClr  = STATUS_COLOR[ps.status] ?? '#94a3b8';

              return (
                <div key={ps.pluginKey} style={{
                  ...s.row,
                  ...(isOn ? s.rowActive : {}),
                }}>
                  {/* 左: 名前・情報 */}
                  <div style={s.rowLeft}>
                    <div style={s.rowName}>{ps.displayName}</div>
                    <div style={s.rowMeta}>
                      <span style={s.keyBadge}>{ps.pluginKey}</span>
                      <span style={{ ...s.catBadge }}>{cat}</span>
                      {/* 実行ステータス */}
                      {ps.status !== 'SUCCEEDED' && (
                        <span style={{ ...s.statusBadge, color: statusClr, borderColor: `${statusClr}50` }}>
                          {ps.status}
                        </span>
                      )}
                    </div>
                    {/* capabilities */}
                    <div style={s.capsRow}>
                      {ps.capabilities.map((c) => (
                        <span key={c} style={s.capTag}>{c}</span>
                      ))}
                    </div>
                  </div>

                  {/* 右: トグルボタン */}
                  <div style={s.rowRight}>
                    <button
                      style={{
                        ...s.toggleBtn,
                        ...(isOn ? s.toggleBtnOn : s.toggleBtnOff),
                      }}
                      onClick={() => handleToggle(ps.pluginKey)}
                    >
                      {isOn ? '✓ Enabled' : 'Enable'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── フッター ─────────────────────────────────────── */}
        <div style={s.footer}>
          <span style={{ color: '#334155', fontSize: 11, fontFamily: 'monospace' }}>
            {filtered.length} / {pluginStatuses.length} plugins
            {' '}·{' '}
            {pluginStatuses.filter((ps) => pluginVisibility[ps.pluginKey] !== false).length} enabled
          </span>
        </div>
      </div>
    </>
  );
}

// ── スタイル ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position:        'fixed',
    inset:           0,
    background:      'rgba(0,0,0,0.55)',
    zIndex:          1000,
  },
  modal: {
    position:        'fixed',
    top:             '50%',
    left:            '50%',
    transform:       'translate(-50%, -50%)',
    zIndex:          1001,
    width:           660,
    maxWidth:        'calc(100vw - 32px)',
    maxHeight:       '80vh',
    display:         'flex',
    flexDirection:   'column',
    background:      '#0d1929',
    border:          '1px solid #1e3050',
    borderRadius:    10,
    overflow:        'hidden',
    boxShadow:       '0 24px 60px rgba(0,0,0,0.7)',
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '14px 18px',
    borderBottom:    '1px solid #1e3050',
    flexShrink:      0,
  },
  title: {
    color:           '#e2e8f0',
    fontSize:        15,
    fontWeight:      700,
    fontFamily:      'monospace',
    letterSpacing:   '0.02em',
  },
  closeBtn: {
    background:      'transparent',
    border:          'none',
    color:           '#475569',
    fontSize:        16,
    cursor:          'pointer',
    padding:         '2px 6px',
    borderRadius:    4,
    lineHeight:      1,
  },
  searchWrap: {
    display:         'flex',
    alignItems:      'center',
    gap:             8,
    padding:         '10px 18px',
    borderBottom:    '1px solid #1e3050',
    flexShrink:      0,
  },
  searchIcon: {
    fontSize:        14,
    flexShrink:      0,
  },
  searchInput: {
    flex:            1,
    background:      'transparent',
    border:          'none',
    outline:         'none',
    color:           '#e2e8f0',
    fontSize:        13,
    fontFamily:      'monospace',
  },
  clearBtn: {
    background:      'transparent',
    border:          'none',
    color:           '#475569',
    fontSize:        12,
    cursor:          'pointer',
    padding:         '2px 4px',
  },
  body: {
    display:         'flex',
    flex:            1,
    overflow:        'hidden',
  },
  categoryCol: {
    width:           130,
    flexShrink:      0,
    borderRight:     '1px solid #1e3050',
    padding:         '8px 0',
    overflowY:       'auto',
  },
  catBtn: {
    display:         'flex',
    alignItems:      'center',
    width:           '100%',
    padding:         '8px 14px',
    background:      'transparent',
    border:          'none',
    color:           '#64748b',
    fontSize:        12,
    fontFamily:      'monospace',
    cursor:          'pointer',
    textAlign:       'left',
    gap:             4,
  },
  catBtnActive: {
    color:           '#e2e8f0',
    background:      '#1e3050',
    borderRight:     '2px solid #2563eb',
  },
  catCount: {
    fontSize:        10,
    color:           '#334155',
    background:      '#0f1e30',
    borderRadius:    10,
    padding:         '1px 5px',
    minWidth:        18,
    textAlign:       'center',
  },
  catCountActive: {
    color:           '#94a3b8',
    background:      '#1e3050',
  },
  listCol: {
    flex:            1,
    overflowY:       'auto',
    padding:         '6px 0',
  },
  empty: {
    padding:         '32px 24px',
    textAlign:       'center',
  },
  row: {
    display:         'flex',
    alignItems:      'center',
    gap:             12,
    padding:         '10px 18px',
    borderBottom:    '1px solid #0f1e30',
    transition:      'background 0.1s',
  },
  rowActive: {
    background:      '#0f2040',
  },
  rowLeft: {
    flex:            1,
    minWidth:        0,
  },
  rowName: {
    color:           '#e2e8f0',
    fontSize:        13,
    fontWeight:      600,
    fontFamily:      'monospace',
    marginBottom:    4,
  },
  rowMeta: {
    display:         'flex',
    gap:             6,
    alignItems:      'center',
    flexWrap:        'wrap',
    marginBottom:    4,
  },
  keyBadge: {
    fontSize:        10,
    color:           '#475569',
    background:      '#080f1a',
    border:          '1px solid #1e293b',
    borderRadius:    3,
    padding:         '1px 5px',
    fontFamily:      'monospace',
  },
  catBadge: {
    fontSize:        10,
    color:           '#60a5fa',
    background:      'rgba(96,165,250,0.1)',
    border:          '1px solid rgba(96,165,250,0.2)',
    borderRadius:    3,
    padding:         '1px 5px',
    fontFamily:      'monospace',
  },
  statusBadge: {
    fontSize:        10,
    border:          '1px solid',
    borderRadius:    3,
    padding:         '1px 5px',
    fontFamily:      'monospace',
  },
  capsRow: {
    display:         'flex',
    gap:             4,
    flexWrap:        'wrap',
  },
  capTag: {
    fontSize:        9,
    color:           '#334155',
    background:      '#080f1a',
    border:          '1px solid #1e293b',
    borderRadius:    3,
    padding:         '1px 4px',
    fontFamily:      'monospace',
  },
  rowRight: {
    flexShrink:      0,
  },
  toggleBtn: {
    fontSize:        11,
    fontFamily:      'monospace',
    padding:         '5px 12px',
    borderRadius:    5,
    border:          '1px solid',
    cursor:          'pointer',
    fontWeight:      600,
    transition:      'all 0.15s',
    whiteSpace:      'nowrap',
  },
  toggleBtnOn: {
    color:           '#2EC96A',
    background:      'rgba(46,201,106,0.1)',
    borderColor:     '#2EC96A',
  },
  toggleBtnOff: {
    color:           '#64748b',
    background:      'transparent',
    borderColor:     '#334155',
  },
  footer: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'flex-end',
    padding:         '8px 18px',
    borderTop:       '1px solid #1e3050',
    flexShrink:      0,
  },
};