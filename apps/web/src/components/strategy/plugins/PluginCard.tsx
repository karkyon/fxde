/**
 * apps/web/src/components/strategy/plugins/PluginCard.tsx
 *
 * プラグインカード（一覧グリッド用）
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.1 カード仕様 / §11.1 PluginCard
 *
 * 表示要素:
 *   - 16:9 cover image（または No Image プレースホルダー）
 *   - タイトル / 種別バッジ
 *   - summary（説明文）
 *   - tags
 *   - version / author / source label
 *   - status badge
 *   - enable/disable toggle
 *   - 詳細ボタン
 */

import React            from 'react';
import { PluginStatusBadge } from './PluginStatusBadge';
import { PluginEnableToggle } from './PluginEnableToggle';
import type { PluginCard as PluginCardData, PluginStatus } from '@fxde/types';

interface PluginCardProps {
  plugin:       PluginCardData;
  canToggle:    boolean;
  loading?:     boolean;
  onOpenDetail: (pluginId: string) => void;
  onToggle:     (pluginId: string, nextEnabled: boolean) => void;
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

export function PluginCard({
  plugin,
  canToggle,
  loading,
  onOpenDetail,
  onToggle,
}: PluginCardProps) {
  return (
    <article style={s.card}>
      {/* 16:9 Cover Image */}
      <div style={s.coverWrap}>
        {plugin.coverImageUrl ? (
          <img
            src={plugin.coverImageUrl}
            alt={plugin.displayName}
            style={s.coverImg}
            loading="lazy"
          />
        ) : (
          <div style={s.coverPlaceholder}>
            <span style={{ fontSize: 28 }}>🧩</span>
            <span style={s.noImageText}>No Image</span>
          </div>
        )}
      </div>

      {/* カード本体 */}
      <div style={s.body}>
        {/* タイトル行 */}
        <div style={s.titleRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={s.title}>{plugin.displayName}</h3>
            <span style={s.typeBadge}>
              {PLUGIN_TYPE_LABEL[plugin.pluginType] ?? plugin.pluginType}
            </span>
          </div>
          <PluginStatusBadge status={plugin.status as PluginStatus} />
        </div>

        {/* summary */}
        <p style={s.summary}>{plugin.summary}</p>

        {/* tags */}
        {plugin.tags.length > 0 && (
          <div style={s.tagRow}>
            {plugin.tags.slice(0, 4).map((tag) => (
              <span key={tag} style={s.tag}>{tag}</span>
            ))}
          </div>
        )}

        {/* meta: version / author / source */}
        <div style={s.meta}>
          <span>v{plugin.version}</span>
          <span style={s.metaSep}>·</span>
          <span>{plugin.authorName}</span>
          <span style={s.metaSep}>·</span>
          <span style={{ color: '#475569' }}>{plugin.sourceLabel}</span>
        </div>

        {/* フッター: 詳細ボタン + toggle */}
        <div style={s.footer}>
          <button
            style={s.detailBtn}
            onClick={() => onOpenDetail(plugin.pluginId)}
          >
            詳細
          </button>
          <PluginEnableToggle
            checked={plugin.isEnabled}
            disabled={!canToggle}
            loading={loading}
            onChange={(next) => onToggle(plugin.pluginId, next)}
          />
        </div>
      </div>
    </article>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  card: {
    background:   'rgba(255,255,255,0.04)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    overflow:     'hidden',
    display:      'flex',
    flexDirection: 'column',
    transition:   'border-color 0.15s',
  },
  coverWrap: {
    aspectRatio: '16/9',
    background:  'rgba(0,0,0,0.3)',
    overflow:    'hidden',
    flexShrink:  0,
  },
  coverImg: {
    width:      '100%',
    height:     '100%',
    objectFit:  'cover',
    display:    'block',
  },
  coverPlaceholder: {
    width:          '100%',
    height:         '100%',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  noImageText: {
    fontSize: 11,
    color:    '#334155',
  },
  body: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  titleRow: {
    display:     'flex',
    alignItems:  'flex-start',
    gap:         10,
  },
  title: {
    fontSize:     14,
    fontWeight:   700,
    color:        '#e2e8f0',
    margin:       0,
    lineHeight:   1.3,
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  typeBadge: {
    fontSize:   10,
    color:      '#818cf8',
    background: 'rgba(99,102,241,0.12)',
    borderRadius: 3,
    padding:    '1px 6px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginTop:  3,
    display:    'inline-block',
  },
  summary: {
    fontSize:   12,
    color:      '#94a3b8',
    margin:     0,
    lineHeight: 1.5,
    display:    '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow:   'hidden',
  },
  tagRow: {
    display:    'flex',
    flexWrap:   'wrap',
    gap:        4,
  },
  tag: {
    fontSize:   10,
    color:      '#64748b',
    background: 'rgba(255,255,255,0.04)',
    border:     '1px solid rgba(255,255,255,0.06)',
    borderRadius: 3,
    padding:    '1px 6px',
  },
  meta: {
    fontSize: 11,
    color:    '#64748b',
    display:  'flex',
    flexWrap: 'wrap',
    gap:      4,
    marginTop: 'auto',
  },
  metaSep: {
    color: '#334155',
  },
  footer: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingTop:     8,
    borderTop:      '1px solid rgba(255,255,255,0.06)',
  },
  detailBtn: {
    background:   'rgba(255,255,255,0.05)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color:        '#94a3b8',
    fontSize:     12,
    padding:      '5px 12px',
    cursor:       'pointer',
  },
};