/**
 * apps/web/src/hooks/usePluginDetail.ts
 *
 * プラグイン詳細取得フック（Drawer 開閉時に on-demand fetch）
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §20.6 hooks 仕様
 */

import { useQuery }        from '@tanstack/react-query';
import { pluginsApi }      from '../lib/api';
import type { PluginDetailResponse } from '@fxde/types';

async function fetchPluginDetail(pluginId: string): Promise<PluginDetailResponse> {
  return pluginsApi.detail(pluginId);
}

export function usePluginDetail(pluginId?: string) {
  return useQuery({
    queryKey: ['plugin-detail', pluginId],
    queryFn:  () => fetchPluginDetail(pluginId as string),
    enabled:  Boolean(pluginId),
    staleTime: 60_000,
  });
}