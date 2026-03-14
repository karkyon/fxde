/**
 * apps/web/src/components/strategy/plugins/PluginDetailDrawer.tsx
 *
 * プラグイン詳細 Drawer（右サイド）
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.3 プラグイン詳細パネル
 *
 * 表示要素:
 *   1. Hero image
 *   2. プラグイン名 / version / author
 *   3. 長文説明
 *   4. Capabilities
 *   5. 入力データ（permissions）
 *   6. 依存プラグイン
 *   7. Source preview viewer（read-only）
 *   8. 有効 / 無効 toggle
 */

import React from 'react';
import { PluginSourceViewer } from './PluginSourceViewer';
import { PluginEnableToggle } from './PluginEnableToggle';
import { PluginStatusBadge }  from './PluginStatusBadge';
import type { PluginDetailResponse, PluginStatus } from '@fxde/types';

interface PluginDetailDrawerProps {
  open:          boolean;
  loading?:      boolean;
  detail?:       PluginDetailResponse;
  canToggle:     boolean;
  toggleLoading?: boolean;
  onClose:       () => void;
  onToggle:      (pluginId: string, nextEnabled: boolean) => void;
}

const PLUGIN_TYPE_LABEL: Record<string, string> = {
  pattern:   'Pattern',
  indicator: 'Indicator',
  strategy:  'Strategy',
  risk:      'Risk',
  overlay:   'Overlay',
  signal:    'Signal',
  ai:        'AI',
  connector: 'Connector',
};

export function PluginDetailDrawer({
  open,
  loading,
  detail,
  canToggle,
  toggleLoading,
  onClose,
  onToggle,
}: PluginDetailDrawerProps) {
  if (!open) return null;

  const m = detail?.manifest;
  const i = detail?.installed;

  return (
    <>
      {/* オーバーレイ */}
      <div style={s.overlay} onClick={onClose} />

      {/* Drawer 本体 */}
      <aside style={s.drawer}>
        {/* ヘッダー */}
        <div style={s.drawerHeader}>
          <span style={s.drawerTitle}>Plugin Detail</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* コンテンツ */}
        <div style={s.body}>
          {loading || !detail || !m || !i ? (
            <div style={s.loading}>読み込み中...</div>
          ) : (
            <>
              {/* Hero image */}
              {m.coverImageUrl && (
                <div style={s.heroWrap}>
                  <img
                    src={m.coverImageUrl}
                    alt={m.displayName}
                    style={s.heroImg}
                    loading="lazy"
                  />
                </div>
              )}

              {/* タイトル / バッジ行 */}
              <div style={s.titleRow}>
                <div style={{ flex: 1 }}>
                  <h2 style={s.pluginName}>{m.displayName}</h2>
                  <div style={s.metaRow}>
                    <span style={s.typeBadge}>
                      {PLUGIN_TYPE_LABEL[m.pluginType] ?? m.pluginType}
                    </span>
                    <span style={s.metaText}>v{m.version}</span>
                    <span style={s.metaSep}>·</span>
                    <span style={s.metaText}>{m.authorName}</span>
                    <span style={s.metaSep}>·</span>
                    <span style={{ ...s.metaText, color: '#475569' }}>{m.sourceLabel}</span>
                  </div>
                </div>
                <PluginStatusBadge status={i.status as PluginStatus} />
              </div>

              {/* 長文説明 */}
              <p style={s.description}>{m.descriptionLong}</p>

              {/* Capabilities */}
              {m.capabilities.length > 0 && (
                <section style={s.section}>
                  <h4 style={s.sectionTitle}>Capabilities</h4>
                  <div style={s.chipRow}>
                    {m.capabilities.map((item) => (
                      <span key={item} style={s.capChip}>{item}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Permissions（入力データ） */}
              {m.permissions.length > 0 && (
                <section style={s.section}>
                  <h4 style={s.sectionTitle}>Permissions</h4>
                  <div style={s.chipRow}>
                    {m.permissions.map((item) => (
                      <span key={item} style={s.permChip}>{item}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Dependencies */}
              <section style={s.section}>
                <h4 style={s.sectionTitle}>Dependencies</h4>
                {m.dependencies.length > 0 ? (
                  <ul style={s.list}>
                    {m.dependencies.map((dep) => (
                      <li key={dep} style={s.listItem}>{dep}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={s.none}>依存プラグインなし</p>
                )}
              </section>

              {/* 実行情報 */}
              <section style={s.section}>
                <h4 style={s.sectionTitle}>実行情報</h4>
                <div style={s.infoGrid}>
                  <span style={s.infoLabel}>FXDE API</span>
                  <span style={s.infoVal}>v{m.fxdeApiVersion}</span>
                  <span style={s.infoLabel}>Entry File</span>
                  <span style={s.infoVal}>{m.entryFile}</span>
                  <span style={s.infoLabel}>Install Scope</span>
                  <span style={s.infoVal}>{m.installScope}</span>
                  <span style={s.infoLabel}>Signed</span>
                  <span style={s.infoVal}>{m.isSigned ? '✅ Yes' : '⚠️ No'}</span>
                  {i.lastExecutedAt && (
                    <>
                      <span style={s.infoLabel}>Last Executed</span>
                      <span style={s.infoVal}>
                        {new Date(i.lastExecutedAt).toLocaleString('ja-JP')}
                      </span>
                    </>
                  )}
                </div>
              </section>

              {/* Source Preview（read-only）*/}
              <PluginSourceViewer
                code={m.sourcePreview ?? '// No source preview available'}
              />

              {/* Enable / Disable toggle */}
              <div style={s.toggleRow}>
                <span style={s.toggleLabel}>プラグインの有効 / 無効</span>
                <PluginEnableToggle
                  checked={i.isEnabled}
                  disabled={!canToggle || i.configLocked}
                  loading={toggleLoading}
                  onChange={(next) => onToggle(m.id, next)}
                  disabledReason={
                    i.configLocked
                      ? 'このプラグインはロックされています'
                      : 'この操作には ADMIN 権限が必要です'
                  }
                />
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset:    0,
    zIndex:   40,
    background: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position:   'fixed',
    top:        0,
    right:      0,
    bottom:     0,
    zIndex:     50,
    width:      '100%',
    maxWidth:   560,
    background: '#0f172a',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    display:    'flex',
    flexDirection: 'column',
    boxShadow:  '-8px 0 40px rgba(0,0,0,0.6)',
  },
  drawerHeader: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '14px 20px',
    borderBottom:   '1px solid rgba(255,255,255,0.08)',
    flexShrink:     0,
  },
  drawerTitle: {
    fontSize:   14,
    fontWeight: 700,
    color:      '#e2e8f0',
  },
  closeBtn: {
    background:   'rgba(255,255,255,0.06)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color:        '#64748b',
    fontSize:     14,
    padding:      '4px 10px',
    cursor:       'pointer',
  },
  body: {
    flex:      1,
    overflowY: 'auto',
    padding:   '20px',
    display:   'flex',
    flexDirection: 'column',
    gap:       20,
  },
  loading: {
    color:   '#64748b',
    fontSize: 13,
    padding: '40px 0',
    textAlign: 'center',
  },
  heroWrap: {
    aspectRatio: '16/9',
    borderRadius: 10,
    overflow:    'hidden',
    background:  'rgba(0,0,0,0.3)',
  },
  heroImg: {
    width:     '100%',
    height:    '100%',
    objectFit: 'cover',
    display:   'block',
  },
  titleRow: {
    display:     'flex',
    alignItems:  'flex-start',
    gap:         12,
  },
  pluginName: {
    fontSize:   18,
    fontWeight: 700,
    color:      '#e2e8f0',
    margin:     '0 0 6px',
  },
  metaRow: {
    display:     'flex',
    flexWrap:    'wrap',
    alignItems:  'center',
    gap:         4,
  },
  typeBadge: {
    fontSize:   10,
    color:      '#818cf8',
    background: 'rgba(99,102,241,0.12)',
    borderRadius: 3,
    padding:    '1px 6px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  metaText: {
    fontSize: 12,
    color:    '#64748b',
  },
  metaSep: {
    fontSize: 12,
    color:    '#334155',
  },
  description: {
    fontSize:   13,
    color:      '#94a3b8',
    lineHeight: 1.7,
    margin:     0,
  },
  section: {
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
  },
  sectionTitle: {
    fontSize:      12,
    fontWeight:    700,
    color:         '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin:        0,
  },
  chipRow: {
    display:  'flex',
    flexWrap: 'wrap',
    gap:      4,
  },
  capChip: {
    fontSize:   11,
    color:      '#2ec96a',
    background: 'rgba(46,201,106,0.1)',
    border:     '1px solid rgba(46,201,106,0.2)',
    borderRadius: 4,
    padding:    '2px 8px',
  },
  permChip: {
    fontSize:   11,
    color:      '#38bdf8',
    background: 'rgba(56,189,248,0.1)',
    border:     '1px solid rgba(56,189,248,0.2)',
    borderRadius: 4,
    padding:    '2px 8px',
  },
  list: {
    margin:  0,
    padding: '0 0 0 18px',
  },
  listItem: {
    fontSize: 12,
    color:    '#94a3b8',
    padding:  '2px 0',
  },
  none: {
    fontSize: 12,
    color:    '#475569',
    margin:   0,
    fontStyle: 'italic',
  },
  infoGrid: {
    display:             'grid',
    gridTemplateColumns: 'auto 1fr',
    gap:                 '4px 16px',
    alignItems:          'center',
  },
  infoLabel: {
    fontSize: 11,
    color:    '#475569',
  },
  infoVal: {
    fontSize:   11,
    color:      '#94a3b8',
    fontFamily: '"JetBrains Mono", monospace',
  },
  toggleRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '14px 0',
    borderTop:      '1px solid rgba(255,255,255,0.08)',
    marginTop:      'auto',
  },
  toggleLabel: {
    fontSize:   13,
    fontWeight: 600,
    color:      '#94a3b8',
  },
};