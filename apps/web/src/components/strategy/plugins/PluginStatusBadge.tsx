/**
 * apps/web/src/components/strategy/plugins/PluginStatusBadge.tsx
 *
 * プラグイン状態バッジ
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §4.1 状態バッジ
 *
 * 状態色定義（設計書 §4.1 準拠）:
 *   enabled:            緑
 *   disabled:           グレー
 *   error:              赤
 *   incompatible:       黄
 *   missing_dependency: 橙
 *   update_available:   青
 */

import React from 'react';
import type { PluginStatus } from '@fxde/types';

interface PluginStatusBadgeProps {
  status: PluginStatus;
}

const STATUS_CONFIG: Record<PluginStatus, { label: string; color: string; bg: string }> = {
  enabled:            { label: 'Enabled',            color: '#2ec96a', bg: 'rgba(46,201,106,0.12)'  },
  disabled:           { label: 'Disabled',           color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  error:              { label: 'Error',               color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  incompatible:       { label: 'Incompatible',        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  missing_dependency: { label: 'Missing Dependency',  color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  update_available:   { label: 'Update Available',    color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
};

export function PluginStatusBadge({ status }: PluginStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['disabled'];

  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        fontSize:     10,
        fontWeight:   600,
        letterSpacing: '0.04em',
        color:        cfg.color,
        background:   cfg.bg,
        border:       `1px solid ${cfg.color}40`,
        borderRadius: 4,
        padding:      '2px 7px',
        whiteSpace:   'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}