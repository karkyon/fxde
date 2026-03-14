/**
 * apps/web/src/components/strategy/plugins/PluginSourceViewer.tsx
 *
 * プラグインソースプレビュー（読み取り専用）
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.4 Source 表示要件 / §11.2
 *
 * 仕様:
 *   - read-only 表示専用（編集 UI は存在しない）
 *   - モノスペースフォント / 行番号表示
 *   - "Read Only" バッジ固定表示
 *   - "Editing is disabled in FXDE" 注記表示
 *   - 保存 / 編集 / 上書き UI は絶対に追加しない
 */

import React, { useMemo } from 'react';

interface PluginSourceViewerProps {
  code:      string;
  language?: string;
}

export function PluginSourceViewer({
  code,
  language = 'typescript',
}: PluginSourceViewerProps) {
  // 行番号を付与
  const lines = useMemo(() => code.split('\n'), [code]);

  return (
    <section style={s.container}>
      {/* ヘッダー */}
      <div style={s.header}>
        <div>
          <span style={s.title}>Source Preview</span>
          <span style={s.langBadge}>{language}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Read Only バッジ（固定）*/}
          <span style={s.readOnlyBadge}>Read Only</span>
        </div>
      </div>

      {/* 編集不可の説明 */}
      <p style={s.notice}>Editing is disabled in FXDE</p>

      {/* コードビュー（行番号付き）*/}
      <div style={s.codeWrap}>
        <table style={s.table} aria-label="source preview">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td style={s.lineNum} aria-hidden="true">
                  {idx + 1}
                </td>
                <td style={s.lineCode}>
                  <code>{line || '\u00A0'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  container: {
    background:   'rgba(0,0,0,0.25)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    overflow:     'hidden',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '10px 14px 8px',
    borderBottom:   '1px solid rgba(255,255,255,0.06)',
    gap:            8,
  },
  title: {
    fontSize:     12,
    fontWeight:   700,
    color:        '#94a3b8',
    marginRight:  8,
  },
  langBadge: {
    fontSize:     10,
    color:        '#64748b',
    background:   'rgba(255,255,255,0.05)',
    borderRadius: 3,
    padding:      '1px 6px',
  },
  readOnlyBadge: {
    fontSize:     10,
    fontWeight:   600,
    color:        '#f59e0b',
    background:   'rgba(245,158,11,0.1)',
    border:       '1px solid rgba(245,158,11,0.3)',
    borderRadius: 4,
    padding:      '2px 7px',
  },
  notice: {
    fontSize:    11,
    color:       '#475569',
    margin:      0,
    padding:     '4px 14px',
    fontStyle:   'italic',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  codeWrap: {
    overflowX:  'auto',
    maxHeight:  360,
    overflowY:  'auto',
  },
  table: {
    borderCollapse: 'collapse',
    width:          '100%',
    fontFamily:     '"JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSize:       12,
    lineHeight:     '20px',
  },
  lineNum: {
    userSelect:     'none',
    textAlign:      'right',
    padding:        '0 12px',
    color:          '#334155',
    minWidth:       36,
    verticalAlign:  'top',
    borderRight:    '1px solid rgba(255,255,255,0.05)',
  },
  lineCode: {
    padding:        '0 14px',
    color:          '#cbd5e1',
    whiteSpace:     'pre',
    verticalAlign:  'top',
  },
};