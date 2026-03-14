/**
 * apps/web/src/components/strategy/plugins/PluginEmptyState.tsx
 *
 * プラグイン未導入時の空状態表示
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §4.2 空状態
 */

import React from 'react';

export function PluginEmptyState() {
  return (
    <div style={s.container}>
      <div style={s.icon}>🧩</div>
      <h3 style={s.title}>導入済みプラグインはまだありません</h3>
      <p style={s.description}>
        標準プラグインを追加するとここに表示されます。
      </p>
    </div>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  container: {
    background:     'rgba(255,255,255,0.03)',
    border:         '1px dashed rgba(255,255,255,0.1)',
    borderRadius:   12,
    padding:        '48px 24px',
    textAlign:      'center',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            12,
  },
  icon: {
    fontSize: 40,
    lineHeight: 1,
  },
  title: {
    fontSize:   16,
    fontWeight: 700,
    color:      '#94a3b8',
    margin:     0,
  },
  description: {
    fontSize: 13,
    color:    '#475569',
    margin:   0,
  },
};