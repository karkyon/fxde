/**
 * apps/web/src/hooks/useSettings.ts
 *
 * 変更理由:
 *   Settings 型を UserSettingDto（@fxde/types）に一本化。
 *   旧実装の maxDailyLoss 等の独自フィールドは存在しない。
 *
 * 参照仕様: SPEC_v51_part5 §5「Settings API」
 *           SPEC_v51_part10 hooks/useSettings.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../lib/api';
import type { UpdateSettingsDto, ApplyPresetDto } from '@fxde/types';

export const settingsKeys = {
  all:  ['settings'] as const,
  mine: () => [...settingsKeys.all, 'mine'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.mine(),
    queryFn:  () => settingsApi.get(),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsDto) => settingsApi.update(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: settingsKeys.mine() }),
  });
}

export function useApplyPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyPresetDto) => settingsApi.applyPreset(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: settingsKeys.mine() }),
  });
}