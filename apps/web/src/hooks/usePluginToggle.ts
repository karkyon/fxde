/**
 * apps/web/src/hooks/usePluginToggle.ts
 *
 * プラグイン enable / disable mutation フック
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.5 Enable/Disable / §20.6 hooks 仕様
 *
 * - optimistic update ではなく server confirmed update を採用（§12 状態遷移）
 * - 成功時に plugins / plugin-detail クエリを invalidate して refetch
 * - ADMIN 権限チェックは Controller 側で実施。フロントは UI トグル制御のみ。
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pluginsApi }                  from '../lib/api';
import type { TogglePluginResponse }   from '@fxde/types';

interface TogglePluginParams {
  pluginId:    string;
  nextEnabled: boolean;
}

async function postToggle(
  pluginId: string,
  nextEnabled: boolean,
): Promise<TogglePluginResponse> {
  return nextEnabled
    ? pluginsApi.enable(pluginId)
    : pluginsApi.disable(pluginId);
}

export function usePluginToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pluginId, nextEnabled }: TogglePluginParams) =>
      postToggle(pluginId, nextEnabled),

    onSuccess: (_data, variables) => {
      // server confirmed update: レスポンス確認後に refetch
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
      void queryClient.invalidateQueries({
        queryKey: ['plugin-detail', variables.pluginId],
      });
    },
  });
}