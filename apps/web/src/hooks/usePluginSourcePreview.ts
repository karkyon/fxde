/**
 * apps/web/src/hooks/usePluginSourcePreview.ts
 *
 * 修正3: Source Preview を専用 API（GET /plugins/:id/source-preview）から取得する hook
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.4 Source 表示要件 / §20.6 hooks 仕様
 *
 * - detail payload から直接 sourcePreview を参照する方式を廃止
 * - 専用エンドポイントのみから取得し、readOnly: true を保証する
 */

import { useQuery }                     from '@tanstack/react-query';
import { pluginsApi }                   from '../lib/api';
import type { PluginSourcePreviewResponse } from '@fxde/types';

async function fetchSourcePreview(pluginId: string): Promise<PluginSourcePreviewResponse> {
  return pluginsApi.sourcePreview(pluginId);
}

export function usePluginSourcePreview(pluginId?: string) {
  return useQuery({
    queryKey: ['plugin-source-preview', pluginId],
    queryFn:  () => fetchSourcePreview(pluginId as string),
    enabled:  Boolean(pluginId),
    // source preview は更新頻度が低いため長めのキャッシュを設定
    staleTime: 5 * 60 * 1000,
  });
}