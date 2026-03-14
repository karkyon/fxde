/**
 * apps/web/src/components/strategy/plugins/PluginEnableToggle.tsx
 *
 * プラグイン有効 / 無効トグルスイッチ
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.5 Enable/Disable 要件 / §11.3
 *
 * 仕様:
 *   - ON = Enabled / OFF = Disabled
 *   - mutate 中は disabled
 *   - optimistic update ではなく server confirmed update を採用
 *   - ADMIN 以外は disabled + tooltip 表示（§4.3 トグル制約）
 */

import React from 'react';

interface PluginEnableToggleProps {
  checked:  boolean;
  disabled?: boolean;
  loading?:  boolean;
  onChange:  (nextChecked: boolean) => void;
  /** disabled 理由ツールチップ（権限不足など）*/
  disabledReason?: string;
}

export function PluginEnableToggle({
  checked,
  disabled,
  loading,
  onChange,
  disabledReason,
}: PluginEnableToggleProps) {
  const isDisabled = disabled || loading;

  // トグルスイッチ（カスタム）
  const trackColor = checked && !isDisabled
    ? 'rgba(46,201,106,0.9)'
    : 'rgba(255,255,255,0.1)';
  const opacity = isDisabled ? 0.45 : 1;

  return (
    <span
      title={isDisabled ? (disabledReason ?? 'この操作には ADMIN 権限が必要です') : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity }}
    >
      <button
        role="switch"
        aria-checked={checked}
        disabled={isDisabled}
        onClick={() => !isDisabled && onChange(!checked)}
        style={{
          width:           36,
          height:          20,
          borderRadius:    10,
          border:          '1px solid rgba(255,255,255,0.15)',
          background:      trackColor,
          cursor:          isDisabled ? 'not-allowed' : 'pointer',
          position:        'relative',
          transition:      'background 0.2s',
          padding:         0,
          outline:         'none',
        }}
      >
        <span
          style={{
            position:   'absolute',
            top:        2,
            left:       checked ? 17 : 2,
            width:      14,
            height:     14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
            boxShadow:  '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
      <span style={{ fontSize: 12, color: '#64748b' }}>
        {loading ? '...' : checked ? 'Enabled' : 'Disabled'}
      </span>
    </span>
  );
}