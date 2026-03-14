/**
 * apps/web/src/components/strategy/plugins/PluginSourceViewer.tsx
 *
 * プラグインソースプレビュー（読み取り専用）
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.4 Source 表示要件 / §11.2
 *
 * 修正5: シンタックスハイライト・read-only editor スタイル・行番号を強化
 *   - 外部ライブラリ不使用（react-syntax-highlighter 未インストールのため）
 *   - TypeScript キーワードをトークンベースで色分け
 *   - editor 風のダークテーマを CSS で実現
 *   - 行番号表示（左ガター）
 *   - コピーボタン追加（オプション）
 *
 * 仕様上の絶対禁止事項:
 *   - 編集 UI（textarea / contenteditable）を一切含めない
 *   - 保存 / 編集 / 上書き ボタンを出さない
 */

import React, { useMemo, useState } from 'react';

interface PluginSourceViewerProps {
  code:      string;
  language?: string;
}

// ── TypeScript / JavaScript トークン色分け ────────────────────────────────
const TS_KEYWORDS = [
  'export', 'import', 'from', 'const', 'let', 'var', 'function', 'async',
  'await', 'return', 'interface', 'type', 'class', 'extends', 'implements',
  'new', 'this', 'if', 'else', 'for', 'while', 'try', 'catch', 'throw',
  'null', 'undefined', 'true', 'false', 'void', 'string', 'number',
  'boolean', 'Promise', 'default',
];

/** 1行のソースコードをスパン配列でシンタックスハイライトする */
function highlightLine(line: string): React.ReactNode[] {
  const spans: React.ReactNode[] = [];
  let i = 0;

  const push = (text: string, color?: string, key: number = i) => {
    spans.push(
      color
        ? <span key={key} style={{ color }}>{text}</span>
        : <span key={key}>{text}</span>,
    );
  };

  while (i < line.length) {
    // 行コメント
    if (line[i] === '/' && line[i + 1] === '/') {
      push(line.slice(i), '#6272a4', i);
      break;
    }

    // 文字列（シングル / ダブル / バッククォート）
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && !(line[j] === quote && line[j - 1] !== '\\')) j++;
      push(line.slice(i, j + 1), '#f1fa8c', i);
      i = j + 1;
      continue;
    }

    // 識別子 / キーワード
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[\w$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (TS_KEYWORDS.includes(word)) {
        push(word, '#ff79c6', i); // キーワード: ピンク
      } else if (/^[A-Z]/.test(word)) {
        push(word, '#8be9fd', i); // 型名: シアン
      } else {
        push(word, '#e2e8f0', i); // 通常識別子
      }
      i = j;
      continue;
    }

    // 数値
    if (/\d/.test(line[i])) {
      let j = i;
      while (j < line.length && /[\d.]/.test(line[j])) j++;
      push(line.slice(i, j), '#bd93f9', i); // 数値: パープル
      i = j;
      continue;
    }

    // 記号 / その他
    push(line[i], '#94a3b8', i);
    i++;
  }

  return spans;
}

export function PluginSourceViewer({
  code,
  language = 'typescript',
}: PluginSourceViewerProps) {
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => code.split('\n'), [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API 非対応環境では無視
    }
  };

  return (
    <section style={s.container}>
      {/* ── ヘッダー ──────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={s.title}>Source Preview</span>
          <span style={s.langBadge}>{language}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* コピーボタン */}
          <button style={s.copyBtn} onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          {/* Read Only バッジ（仕様: 固定表示必須）*/}
          <span style={s.readOnlyBadge}>Read Only</span>
        </div>
      </div>

      {/* ── 編集不可の注記（仕様必須）────────────────────────── */}
      <p style={s.notice}>🔒 Editing is disabled in FXDE</p>

      {/* ── コードエリア（editor 風）────────────────────────── */}
      <div style={s.editorWrap}>
        {/* 行番号ガター */}
        <div style={s.gutter} aria-hidden="true">
          {lines.map((_, idx) => (
            <div key={idx} style={s.gutterLine}>{idx + 1}</div>
          ))}
        </div>

        {/* コード本体 */}
        <div style={s.codeArea}>
          {lines.map((line, idx) => (
            <div key={idx} style={s.codeLine}>
              {highlightLine(line)}
              {/* 空行でも高さを確保 */}
              {line === '' && <span style={{ display: 'inline-block', width: 1 }}>&nbsp;</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── スタイル（editor 風ダークテーマ）────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  container: {
    background:   '#1e1e2e',      // editor 背景
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    overflow:     'hidden',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '8px 12px',
    background:     '#181825',
    borderBottom:   '1px solid rgba(255,255,255,0.06)',
  },
  title: {
    fontSize:   11,
    fontWeight: 700,
    color:      '#94a3b8',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  langBadge: {
    fontSize:   10,
    color:      '#6272a4',
    background: 'rgba(98,114,164,0.15)',
    borderRadius: 3,
    padding:    '1px 6px',
  },
  copyBtn: {
    background:   'rgba(255,255,255,0.06)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color:        '#64748b',
    fontSize:     10,
    padding:      '2px 8px',
    cursor:       'pointer',
  },
  readOnlyBadge: {
    fontSize:   10,
    fontWeight: 700,
    color:      '#f59e0b',
    background: 'rgba(245,158,11,0.1)',
    border:     '1px solid rgba(245,158,11,0.3)',
    borderRadius: 4,
    padding:    '2px 7px',
  },
  notice: {
    fontSize:   10,
    color:      '#44475a',
    margin:     0,
    padding:    '3px 12px',
    background: '#181825',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontStyle:  'italic',
  },
  editorWrap: {
    display:    'flex',
    overflowX:  'auto',
    maxHeight:  400,
    overflowY:  'auto',
  },
  gutter: {
    flexShrink:  0,
    minWidth:    40,
    background:  '#181825',
    borderRight: '1px solid rgba(255,255,255,0.04)',
    padding:     '12px 0',
    userSelect:  'none',
  },
  gutterLine: {
    textAlign:   'right',
    padding:     '0 10px',
    fontSize:     12,
    lineHeight:  '20px',
    color:       '#44475a',
    fontFamily:  '"JetBrains Mono", "Fira Code", Consolas, monospace',
  },
  codeArea: {
    flex:        1,
    padding:     '12px 16px',
    overflowX:   'visible',
  },
  codeLine: {
    fontSize:    12,
    lineHeight:  '20px',
    fontFamily:  '"JetBrains Mono", "Fira Code", Consolas, monospace',
    whiteSpace:  'pre',
    minHeight:   20,
  },
};