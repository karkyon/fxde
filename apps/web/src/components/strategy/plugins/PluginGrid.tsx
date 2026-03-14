/**
 * apps/web/src/components/strategy/plugins/PluginGrid.tsx
 *
 * プラグインカードグリッド
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.1 レイアウト仕様
 *   Desktop: 3〜4 カラム / Tablet: 2 カラム / Mobile: 1 カラム
 */

import React from 'react';
import { PluginCard }    from './PluginCard';
import type { PluginCard as PluginCardData, PluginStatus } from '@fxde/types';

interface PluginGridProps {
  items:        PluginCardData[];
  canToggle:    boolean;
  loadingId?:   string | null;
  onOpenDetail: (pluginId: string) => void;
  onToggle:     (pluginId: string, nextEnabled: boolean) => void;
}

export function PluginGrid({
  items,
  canToggle,
  loadingId,
  onOpenDetail,
  onToggle,
}: PluginGridProps) {
  return (
    <div style={s.grid}>
      {items.map((plugin) => (
        <PluginCard
          key={plugin.pluginId}
          plugin={plugin}
          canToggle={canToggle}
          loading={loadingId === plugin.pluginId}
          onOpenDetail={onOpenDetail}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  grid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap:                 16,
  },
};