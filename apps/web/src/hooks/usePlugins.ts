/**
 * apps/web/src/hooks/usePlugins.ts
 *
 * プラグイン一覧取得フック
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §20.6 hooks 仕様
 *
 * - TanStack Query 使用（SPEC_v51_part5 §9.6 規約準拠）
 * - raw fetch ではなく api.ts の axios インスタンスを使用
 *   → 401 自動リフレッシュ・AT ヘッダー付与が自動的に機能する
 */

import { useMemo }          from 'react';
import { useQuery }         from '@tanstack/react-query';
import { pluginsApi }       from '../lib/api';
import type { PluginListResponse } from '@fxde/types';

export interface UsePluginsParams {
  filter?: string;
  sort?:   string;
}

async function fetchPlugins(params: UsePluginsParams): Promise<PluginListResponse> {
  return pluginsApi.list({ filter: params.filter, sort: params.sort });
}

export function usePlugins(params: UsePluginsParams) {
  const queryKey = useMemo(
    () => ['plugins', { filter: params.filter, sort: params.sort }] as const,
    [params.filter, params.sort],
  );

  return useQuery({
    queryKey,
    queryFn:  () => fetchPlugins(params),
    staleTime: 30_000,
  });
}