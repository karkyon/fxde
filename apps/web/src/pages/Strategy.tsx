/**
 * apps/web/src/pages/Strategy.tsx
 *
 * 参照仕様: SPEC_v51_part5 §4「PG-03 ストラテジー」
 *
 * 構成:
 *   上段: 手法カード一覧（登録済みストラテジー）
 *   中段: パターン定義一覧（フォーメーション / ローソク足）
 *   下段: Entry / Exit ルール設定 + フィボナッチ解説パネル
 *
 * SPEC §4.2 PatternCard 型を完全実装。
 * フォーメーション 6 種 + ローソク足 6 種 = 計 12 パターン。
 */

import { useState } from 'react';
import { PluginManager }   from '../components/strategy/plugins/PluginManager';
import { useAuthStore }    from '../stores/auth.store';

// ── 型定義（SPEC_v51_part5 §4.2）────────────────────────────────────────────
interface PatternCard {
  name:        string;
  category:    'formation' | 'candlestick';
  direction:   'BUY' | 'SELL' | 'BOTH';
  confidence:  number;   // 0.0〜1.0
  bonus:       number;   // スコア加算点
  detected:    boolean;
  svgPreview:  string;   // inline SVG path data
  description: string;
  conditions:  string[];
  entryLogic:  string;
  slLogic:     string;
  tpLogic:     string;
  learnUrl:    string;
}

// ── ストラテジー定義（手法カード）────────────────────────────────────────────
const STRATEGIES = [
  {
    id:          'trend-follow',
    name:        'トレンドフォロー',
    description: 'MA + MACD でトレンド方向を確認し、押し目でエントリー。',
    scoreMin:    75,
    riskPct:     1.0,
    tags:        ['MA', 'MACD', 'EMA50', 'SMA200'],
    active:      true,
  },
  {
    id:          'breakout',
    name:        'ブレイクアウト',
    description: 'レジスタンス／サポートのブレイク後、リテスト確認でエントリー。',
    scoreMin:    70,
    riskPct:     1.5,
    tags:        ['BB', 'ATR', 'Volume'],
    active:      true,
  },
  {
    id:          'range-scalp',
    name:        'レンジスキャルプ',
    description: 'RSI 30/70 と BB バンドを利用したレンジ内反転狙い。',
    scoreMin:    65,
    riskPct:     0.5,
    tags:        ['RSI', 'BB', 'M5', 'M15'],
    active:      false,
  },
];

// ── パターン定義（SPEC §4.2 フォーメーション 6 種 + ローソク足 6 種）────────
const PATTERNS: PatternCard[] = [
  // ── フォーメーション ──
  {
    name:        'ダブルボトム',
    category:    'formation',
    direction:   'BUY',
    confidence:  0.72,
    bonus:       8,
    detected:    true,
    svgPreview:  'M10,80 Q30,40 50,80 Q70,120 90,80 Q110,40 130,10',
    description: '2 回底値をつけた後に反転上昇するパターン。',
    conditions:  ['2 回の底値がほぼ同水準', 'ネックライン上抜け確認', '出来高増加'],
    entryLogic:  'ネックライン突破後リテストでロングエントリー',
    slLogic:     '直近安値の 1 pip 下',
    tpLogic:     'ネックラインから底値までの値幅分を上に投影',
    learnUrl:    'https://example.com/double-bottom',
  },
  {
    name:        'ヘッド＆ショルダーズ',
    category:    'formation',
    direction:   'SELL',
    confidence:  0.58,
    bonus:       10,
    detected:    false,
    svgPreview:  'M10,70 Q30,40 50,70 Q70,10 90,70 Q110,40 130,70',
    description: '頭と両肩を形成する天井反転パターン。',
    conditions:  ['左肩 → 頭部 → 右肩の形成確認', 'ネックライン下抜け', '出来高パターン一致'],
    entryLogic:  'ネックライン割れ後リテストでショートエントリー',
    slLogic:     '右肩高値の 1 pip 上',
    tpLogic:     '頭部からネックラインの距離を下に投影',
    learnUrl:    'https://example.com/head-shoulders',
  },
  {
    name:        'トライアングル',
    category:    'formation',
    direction:   'BOTH',
    confidence:  0.45,
    bonus:       5,
    detected:    false,
    svgPreview:  'M10,30 L130,70 M10,90 L130,70',
    description: '収束するトライアングル。ブレイク方向に順張り。',
    conditions:  ['高値切り下げ + 安値切り上げ', 'ブレイク方向確認', 'ATR 収縮確認'],
    entryLogic:  'ブレイク足確定後エントリー',
    slLogic:     'トライアングル内側 1 ATR',
    tpLogic:     'トライアングル高さ分を投影',
    learnUrl:    'https://example.com/triangle',
  },
  {
    name:        'フラッグ',
    category:    'formation',
    direction:   'BUY',
    confidence:  0.63,
    bonus:       6,
    detected:    true,
    svgPreview:  'M10,90 L50,20 M50,20 L70,35 L90,25 L110,38 L130,28',
    description: '強い上昇後の旗形小休止。継続パターン。',
    conditions:  ['強い上昇 pole の確認', '緩やかな下降チャネル形成', '出来高減少後のブレイク'],
    entryLogic:  '上辺ブレイク後エントリー',
    slLogic:     'フラッグ下辺の 1 pip 下',
    tpLogic:     'ポール高さをブレイク点から上に投影',
    learnUrl:    'https://example.com/flag',
  },
  {
    name:        'カップ＆ハンドル',
    category:    'formation',
    direction:   'BUY',
    confidence:  0.41,
    bonus:       9,
    detected:    false,
    svgPreview:  'M10,20 Q60,100 110,20 Q120,10 130,15',
    description: 'カップ形成後にハンドルを形成する強気パターン。',
    conditions:  ['U 字カップの形成', 'ハンドル部の小幅下落', 'ブレイクアウト確認'],
    entryLogic:  'ハンドル上限ブレイク後エントリー',
    slLogic:     'ハンドル安値の 1 pip 下',
    tpLogic:     'カップ深さ分を上に投影',
    learnUrl:    'https://example.com/cup-handle',
  },
  {
    name:        'ライジングウェッジ',
    category:    'formation',
    direction:   'SELL',
    confidence:  0.52,
    bonus:       7,
    detected:    false,
    svgPreview:  'M10,80 L130,30 M10,100 L130,55',
    description: '上昇しながら収束するウェッジ。下落反転シグナル。',
    conditions:  ['高値安値ともに切り上げ', '収束するチャネル', 'RSI ダイバージェンス推奨'],
    entryLogic:  '下辺ブレイク確定後ショート',
    slLogic:     '直近高値の 1 pip 上',
    tpLogic:     '起点の高値と安値の幅をブレイク点から下投影',
    learnUrl:    'https://example.com/rising-wedge',
  },
  // ── ローソク足 ──
  {
    name:        'ピンバー',
    category:    'candlestick',
    direction:   'BOTH',
    confidence:  0.68,
    bonus:       4,
    detected:    true,
    svgPreview:  'M70,10 L70,90 M60,80 L80,80 M60,85 L80,85',
    description: '長いヒゲで反転意志を示すローソク足。',
    conditions:  ['ヒゲが実体の 2 倍以上', 'サポ・レジ付近', '前トレンドの確認'],
    entryLogic:  'ピンバー確定後次足でエントリー',
    slLogic:     'ピンバーの先端の 1 pip 外',
    tpLogic:     '直近の高値または安値',
    learnUrl:    'https://example.com/pinbar',
  },
  {
    name:        'エンゴルフィング',
    category:    'candlestick',
    direction:   'BOTH',
    confidence:  0.61,
    bonus:       5,
    detected:    false,
    svgPreview:  'M40,30 L40,80 M60,20 L60,90 M35,40 L45,40 M55,25 L65,25',
    description: '前足を包む大きな実体で反転を示す。',
    conditions:  ['前足を完全に包む実体', '出来高増加', 'トレンド末端での出現'],
    entryLogic:  'エンゴルフィング確定後エントリー',
    slLogic:     'エンゴルフィング足の反対端',
    tpLogic:     'RR 1:2 以上',
    learnUrl:    'https://example.com/engulfing',
  },
  {
    name:        '明けの明星',
    category:    'candlestick',
    direction:   'BUY',
    confidence:  0.55,
    bonus:       6,
    detected:    false,
    svgPreview:  'M30,20 L30,70 M70,55 L70,65 M110,30 L110,60',
    description: '3 本組みの底値反転パターン。',
    conditions:  ['陰線 → 小実体（星）→ 陽線', '星がギャップ', '3 本目が 1 本目の中値上'],
    entryLogic:  '3 本目確定後エントリー',
    slLogic:     '星の安値下',
    tpLogic:     '直近抵抗帯',
    learnUrl:    'https://example.com/morning-star',
  },
  {
    name:        'シューティングスター',
    category:    'candlestick',
    direction:   'SELL',
    confidence:  0.59,
    bonus:       4,
    detected:    false,
    svgPreview:  'M70,10 L70,90 M60,80 L80,80 M60,85 L80,85',
    description: '上ヒゲが長く天井反転を示す。',
    conditions:  ['上ヒゲが実体の 2 倍以上', '上昇後の出現', '小さい実体'],
    entryLogic:  '確定後次足でショート',
    slLogic:     '上ヒゲ先端の 1 pip 上',
    tpLogic:     '直近サポート帯',
    learnUrl:    'https://example.com/shooting-star',
  },
  {
    name:        'ドージ',
    category:    'candlestick',
    direction:   'BOTH',
    confidence:  0.38,
    bonus:       2,
    detected:    false,
    svgPreview:  'M70,40 L70,80 M50,60 L90,60',
    description: '始値と終値がほぼ同値。方向感喪失サイン。',
    conditions:  ['実体が極小', 'ヒゲの均衡', 'トレンド末端での出現で有効'],
    entryLogic:  '次足の方向でエントリー判断',
    slLogic:     'ドージのヒゲ先端',
    tpLogic:     'RR 1:1.5 以上',
    learnUrl:    'https://example.com/doji',
  },
  {
    name:        '三兵',
    category:    'candlestick',
    direction:   'BOTH',
    confidence:  0.64,
    bonus:       7,
    detected:    false,
    svgPreview:  'M30,70 L30,50 M70,55 L70,35 M110,40 L110,15',
    description: '同方向に 3 本連続する強いトレンド継続パターン。',
    conditions:  ['3 本とも同方向の実体', '各足が前足の中値以上', 'ヒゲが小さい'],
    entryLogic:  '3 本目確定後押し目待ち',
    slLogic:     '1 本目の安値（または高値）',
    tpLogic:     'トレンド方向の直近節目',
    learnUrl:    'https://example.com/three-soldiers',
  },
];

// ── フィボナッチレベル定義 ────────────────────────────────────────────────────
const FIB_LEVELS = [
  { level: '0.0%',   color: '#94a3b8', note: '起点' },
  { level: '23.6%',  color: '#60a5fa', note: '浅い押し' },
  { level: '38.2%',  color: '#34d399', note: '標準押し（浅め）' },
  { level: '50.0%',  color: '#fbbf24', note: '中間' },
  { level: '61.8%',  color: '#f59e0b', note: '黄金比 — 主要サポート' },
  { level: '78.6%',  color: '#f87171', note: '深い押し' },
  { level: '100.0%', color: '#94a3b8', note: '終点' },
];

// ── Entry / Exit ルール ───────────────────────────────────────────────────────
const ENTRY_RULES = [
  { id: 1, label: 'スコア閾値',     value: '75 点以上' },
  { id: 2, label: 'トレンド一致',   value: 'EMA50 > SMA200（BUY）/ EMA50 < SMA200（SELL）' },
  { id: 3, label: 'RSI 条件',      value: 'BUY: RSI < 60 / SELL: RSI > 40' },
  { id: 4, label: 'MTF 整合',      value: 'H4 + H1 方向一致' },
  { id: 5, label: 'パターン確認',   value: '検出パターン ≥ 1 が推奨（必須ではない）' },
];

const EXIT_RULES = [
  { id: 1, label: 'SL（損切り）',   value: 'ATR × 1.5 または直近スイング' },
  { id: 2, label: 'TP1（利確 1）',  value: 'RR 1:1.5 — 半分決済' },
  { id: 3, label: 'TP2（利確 2）',  value: 'RR 1:2.5 または次の節目' },
  { id: 4, label: 'トレーリング',   value: 'TP1 到達後 SL を BE（建値）に移動' },
  { id: 5, label: '強制クローズ',   value: '重要指標 30 分前にポジション整理' },
];

// ────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────────────────
export default function StrategyPage() {
  const [patternTab, setPatternTab]   = useState<'formation' | 'candlestick'>('formation');
  const [selectedPattern, setSelectedPattern] = useState<PatternCard | null>(null);
  const [ruleTab, setRuleTab]         = useState<'entry' | 'exit' | 'fib'>('entry');
  // plugins タブ用メインタブ state（fxde_plugin_system_完全設計書 §1.2）
  const [activeMainTab, setActiveMainTab] = useState<'strategy' | 'plugins'>('strategy');
  const user = useAuthStore((s) => s.user);

  const filteredPatterns = PATTERNS.filter((p) => p.category === patternTab);

  return (
    <div style={s.root}>
      <h1 style={s.pageTitle}>📐 ストラテジー</h1>

      {/* ── メインタブ（strategy / plugins）fxde_plugin_system_完全設計書 §1.2  */}
      <div style={s.mainTabRow}>
        {([
          { id: 'strategy' as const, label: '📐 ストラテジー' },
          { id: 'plugins'  as const, label: '🧩 Plugins'      },
        ]).map(({ id, label }) => (
          <button
            key={id}
            style={{
              ...s.mainTabBtn,
              ...(activeMainTab === id ? s.mainTabBtnActive : {}),
            }}
            onClick={() => setActiveMainTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── plugins タブ  */}
      {activeMainTab === 'plugins' && (
        <PluginManager currentUserRole={user?.role} />
      )}

      {/* ── strategy タブ（既存コンテンツ）*/}
      {activeMainTab === 'strategy' && (<>

        {/* ══════════════════════════════════════
            上段: 手法カード一覧
            ══════════════════════════════════════ */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>手法一覧</h2>
          <div style={s.strategyGrid}>
            {STRATEGIES.map((st) => (
              <div key={st.id} style={{ ...s.strategyCard, opacity: st.active ? 1 : 0.5 }}>
                <div style={s.strategyHeader}>
                  <span style={s.strategyName}>{st.name}</span>
                  <span style={{
                    ...s.activeBadge,
                    background: st.active ? 'rgba(46,201,106,0.15)' : 'rgba(148,163,184,0.1)',
                    color:      st.active ? '#2ec96a' : '#64748b',
                  }}>
                    {st.active ? '有効' : '無効'}
                  </span>
                </div>
                <p style={s.strategyDesc}>{st.description}</p>
                <div style={s.strategyMeta}>
                  <span style={s.metaItem}>スコア閾値: <b>{st.scoreMin}</b></span>
                  <span style={s.metaItem}>リスク: <b>{st.riskPct}%</b></span>
                </div>
                <div style={s.tagRow}>
                  {st.tags.map((t) => (
                    <span key={t} style={s.tag}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════
            中段: パターン定義一覧
            ══════════════════════════════════════ */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>パターン定義</h2>

          {/* タブ */}
          <div style={s.tabRow}>
            {(['formation', 'candlestick'] as const).map((tab) => (
              <button
                key={tab}
                style={{ ...s.tabBtn, ...(patternTab === tab ? s.tabBtnActive : {}) }}
                onClick={() => { setPatternTab(tab); setSelectedPattern(null); }}
              >
                {tab === 'formation' ? '📊 フォーメーション' : '🕯 ローソク足'}
              </button>
            ))}
          </div>

          {/* パターングリッド */}
          <div style={s.patternGrid}>
            {filteredPatterns.map((p) => (
              <PatternCardItem
                key={p.name}
                pattern={p}
                selected={selectedPattern?.name === p.name}
                onClick={() => setSelectedPattern(selectedPattern?.name === p.name ? null : p)}
              />
            ))}
          </div>

          {/* 詳細パネル */}
          {selectedPattern && (
            <PatternDetail pattern={selectedPattern} onClose={() => setSelectedPattern(null)} />
          )}
        </section>

        {/* ══════════════════════════════════════
            下段: Entry / Exit ルール + フィボナッチ
            ══════════════════════════════════════ */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Entry / Exit ルール &amp; フィボナッチ</h2>

          <div style={s.tabRow}>
            {([
              { id: 'entry', label: '📥 Entry ルール' },
              { id: 'exit',  label: '📤 Exit ルール'  },
              { id: 'fib',   label: '🌀 フィボナッチ'  },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                style={{ ...s.tabBtn, ...(ruleTab === id ? s.tabBtnActive : {}) }}
                onClick={() => setRuleTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={s.card}>
            {ruleTab === 'entry' && (
              <table style={s.ruleTable}>
                <tbody>
                  {ENTRY_RULES.map((r) => (
                    <tr key={r.id}>
                      <td style={s.ruleLabel}>{r.label}</td>
                      <td style={s.ruleValue}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {ruleTab === 'exit' && (
              <table style={s.ruleTable}>
                <tbody>
                  {EXIT_RULES.map((r) => (
                    <tr key={r.id}>
                      <td style={s.ruleLabel}>{r.label}</td>
                      <td style={s.ruleValue}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {ruleTab === 'fib' && (
              <div>
                <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
                  直近スイング高値 → 安値（BUY 押し目）または 安値 → 高値（SELL 戻り）を基準として測定。
                </p>
                {/* SVG フィボナッチチャート */}
                <svg viewBox="0 0 500 200" style={{ width: '100%', maxWidth: 500, marginBottom: 16 }}>
                  {FIB_LEVELS.map((fib, i) => {
                    const y = 10 + i * 26;
                    const pct = parseFloat(fib.level) / 100;
                    const barW = (1 - pct) * 340;
                    return (
                      <g key={fib.level}>
                        <line x1="80" y1={y + 8} x2="420" y2={y + 8} stroke="#1e2130" strokeWidth={1} />
                        <rect x="80" y={y} width={barW} height={16} fill={fib.color} opacity={0.15} rx={2} />
                        <text x="75" y={y + 12} fill={fib.color} fontSize={11} textAnchor="end">{fib.level}</text>
                        <text x="425" y={y + 12} fill="#64748b" fontSize={10}>{fib.note}</text>
                      </g>
                    );
                  })}
                </svg>
                <p style={{ color: '#475569', fontSize: 11 }}>
                  ※ 61.8% と 38.2% が主要エントリーゾーン。スコア 75 点以上と組み合わせると精度向上。
                </p>
              </div>
            )}
          </div>
        </section>
        
      </>)}
    </div>
  );
}

// ── PatternCardItem ───────────────────────────────────────────────────────────
function PatternCardItem({
  pattern,
  selected,
  onClick,
}: {
  pattern:  PatternCard;
  selected: boolean;
  onClick:  () => void;
}) {
  const confPct  = Math.round(pattern.confidence * 100);
  const dirColor = pattern.direction === 'BUY'  ? '#34d399'
                 : pattern.direction === 'SELL' ? '#f87171'
                 : '#fbbf24';

  return (
    <div
      style={{
        ...s.patternCard,
        borderColor: selected ? '#6366f1' : (pattern.detected ? '#2ec96a44' : 'rgba(255,255,255,0.08)'),
        background:  selected ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      {/* SVGプレビュー */}
      <div style={s.svgBox}>
        <svg viewBox="0 0 140 100" style={{ width: '100%', height: 60 }}>
          <path
            d={pattern.svgPreview}
            fill="none"
            stroke={dirColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>{pattern.name}</span>
          {pattern.detected && (
            <span style={{ fontSize: 10, color: '#2ec96a', background: 'rgba(46,201,106,0.12)', borderRadius: 3, padding: '1px 5px' }}>
              検出中
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: dirColor }}>{pattern.direction}</span>
          <span style={{ color: '#94a3b8' }}>+{pattern.bonus}pt</span>
        </div>

        {/* 信頼度バー */}
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 2 }}>
            <span>信頼度</span><span>{confPct}%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${confPct}%`, background: dirColor, borderRadius: 2, opacity: 0.7 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PatternDetail ─────────────────────────────────────────────────────────────
function PatternDetail({ pattern, onClose }: { pattern: PatternCard; onClose: () => void }) {
  const dirColor = pattern.direction === 'BUY'  ? '#34d399'
                 : pattern.direction === 'SELL' ? '#f87171'
                 : '#fbbf24';
  return (
    <div style={s.detailPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>{pattern.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>

      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>{pattern.description}</p>

      <div style={s.detailGrid}>
        <div>
          <div style={s.detailLabel}>検出条件</div>
          <ul style={s.detailList}>
            {pattern.conditions.map((c, i) => <li key={i} style={s.detailListItem}>・{c}</li>)}
          </ul>
        </div>
        <div>
          <div style={s.detailLabel}>エントリーロジック</div>
          <p style={s.detailText}>{pattern.entryLogic}</p>
          <div style={{ ...s.detailLabel, marginTop: 8 }}>SL 設定</div>
          <p style={s.detailText}>{pattern.slLogic}</p>
          <div style={{ ...s.detailLabel, marginTop: 8 }}>TP 目標</div>
          <p style={s.detailText}>{pattern.tpLogic}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: dirColor, fontWeight: 700 }}>{pattern.direction}</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>ボーナス +{pattern.bonus}pt</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>信頼度 {Math.round(pattern.confidence * 100)}%</span>
      </div>
    </div>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:           { color: '#e2e8f0', padding: '0 4px' },
  pageTitle:      { fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 },
  // Plugin System メインタブ（fxde_plugin_system_完全設計書 §1.2）
  mainTabRow:       { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 },
  mainTabBtn:       { background: 'transparent', border: 'none', borderRadius: 6, color: '#64748b', fontSize: 13, fontWeight: 500, padding: '6px 14px', cursor: 'pointer' },
  mainTabBtnActive: { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontWeight: 700 },
  section:        { marginBottom: 24 },
  sectionTitle:   { fontSize: 13, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 },

  // 手法カード
  strategyGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  strategyCard:   { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' },
  strategyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  strategyName:   { fontWeight: 700, fontSize: 14 },
  activeBadge:    { fontSize: 11, borderRadius: 4, padding: '2px 7px' },
  strategyDesc:   { fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 },
  strategyMeta:   { display: 'flex', gap: 12, marginBottom: 8 },
  metaItem:       { fontSize: 12, color: '#64748b' },
  tagRow:         { display: 'flex', flexWrap: 'wrap', gap: 4 },
  tag:            { fontSize: 10, background: 'rgba(99,102,241,0.12)', color: '#818cf8', borderRadius: 3, padding: '1px 6px' },

  // タブ
  tabRow:         { display: 'flex', gap: 6, marginBottom: 12 },
  tabBtn:         { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#64748b', padding: '6px 14px', fontSize: 12, cursor: 'pointer' },
  tabBtnActive:   { background: 'rgba(99,102,241,0.15)', borderColor: '#6366f1', color: '#a5b4fc' },

  // パターングリッド
  patternGrid:    { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  patternCard:    { border: '1px solid', borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.15s' },
  svgBox:         { background: 'rgba(0,0,0,0.25)', padding: '8px 10px' },

  // 詳細パネル
  detailPanel:    { marginTop: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '16px 18px' },
  detailGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  detailLabel:    { fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 },
  detailList:     { margin: 0, padding: 0, listStyle: 'none' },
  detailListItem: { fontSize: 12, color: '#94a3b8', marginBottom: 3 },
  detailText:     { fontSize: 12, color: '#cbd5e1', margin: 0, lineHeight: 1.5 },

  // ルール表
  card:           { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '16px 18px' },
  ruleTable:      { width: '100%', borderCollapse: 'collapse' },
  ruleLabel:      { padding: '7px 12px 7px 0', fontSize: 13, color: '#94a3b8', width: 160, borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' },
  ruleValue:      { padding: '7px 0', fontSize: 13, color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
};