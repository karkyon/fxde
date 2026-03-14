/**
 * apps/web/src/components/strategy/plugins/PluginManager.tsx
 *
 * Plugin Manager — メインオーケストレーター
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §10 フロント実装構成 / §20.5 PluginManager
 *
 * 責務:
 *   - 一覧取得・filter / sort state 管理
 *   - detail open state 管理
 *   - toggle action 呼び出し
 *   - RBAC: user.role === 'ADMIN' のみ toggle 可
 */

import React, { useMemo, useState } from 'react';
import { usePlugins }       from '../../../hooks/usePlugins';
import { usePluginDetail }  from '../../../hooks/usePluginDetail';
import { usePluginToggle }  from '../../../hooks/usePluginToggle';
import { PluginToolbar }    from './PluginToolbar';
import { PluginGrid }       from './PluginGrid';
import { PluginEmptyState } from './PluginEmptyState';
import { PluginDetailDrawer } from './PluginDetailDrawer';

interface PluginManagerProps {
  /** 現在のユーザーロール（auth.store の user.role を渡す）*/
  currentUserRole?: string;
}

export function PluginManager({ currentUserRole }: PluginManagerProps) {
  const [filter, setFilter]                   = useState('all');
  const [sort, setSort]                       = useState('name');
  const [selectedPluginId, setSelectedPluginId] = useState<string | undefined>();

  // ADMIN のみ toggle 可（§8 権限制御）
  const canToggle = currentUserRole === 'ADMIN';

  const { data, isLoading, error } = usePlugins({ filter, sort });
  const detailQuery                = usePluginDetail(selectedPluginId);
  const toggleMutation             = usePluginToggle();

  const items = useMemo(() => data?.items ?? [], [data]);

  const handleToggle = (pluginId: string, nextEnabled: boolean) => {
    toggleMutation.mutate(
      { pluginId, nextEnabled },
      {
        onSuccess: () => {
          // refetch は usePluginToggle 内で invalidate 済み
        },
      },
    );
  };

  const handleOpenDetail = (pluginId: string) => {
    setSelectedPluginId(pluginId);
  };

  const handleCloseDetail = () => {
    setSelectedPluginId(undefined);
  };

  return (
    <div style={s.root}>
      {/* ツールバー */}
      <PluginToolbar
        filter={filter}
        sort={sort}
        onFilterChange={setFilter}
        onSortChange={setSort}
      />

      {/* ローディング */}
      {isLoading && (
        <div style={s.message}>
          <span>読み込み中...</span>
        </div>
      )}

      {/* エラー */}
      {!isLoading && error && (
        <div style={{ ...s.message, color: '#f87171' }}>
          プラグイン一覧の取得に失敗しました。
        </div>
      )}

      {/* 空状態 */}
      {!isLoading && !error && items.length === 0 && <PluginEmptyState />}

      {/* グリッド */}
      {!isLoading && !error && items.length > 0 && (
        <PluginGrid
          items={items}
          canToggle={canToggle}
          loadingId={toggleMutation.isPending ? (toggleMutation.variables?.pluginId ?? null) : null}
          onOpenDetail={handleOpenDetail}
          onToggle={handleToggle}
        />
      )}

      {/* 詳細 Drawer */}
      <PluginDetailDrawer
        open={Boolean(selectedPluginId)}
        loading={detailQuery.isLoading}
        detail={detailQuery.data}
        canToggle={canToggle}
        toggleLoading={
          toggleMutation.isPending &&
          toggleMutation.variables?.pluginId === selectedPluginId
        }
        onClose={handleCloseDetail}
        onToggle={handleToggle}
      />
    </div>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    display:       'flex',
    flexDirection: 'column',
    gap:           16,
  },
  message: {
    fontSize: 13,
    color:    '#64748b',
    padding:  '24px 0',
    textAlign: 'center',
  },
};