/**
 * apps/web/src/pages/Plan.tsx (PG-06)
 *
 * 変更内容（round6）:
 *   placeholder から脱却し、仕様範囲内の最低限完成状態に引き上げ。
 *
 * 表示内容:
 *   - FREE / BASIC / PRO / PRO_PLUS / ADMIN のプラン比較
 *   - PLAN_LIMITS（packages/types）に基づいた制限値表示
 *   - 現在のユーザーロールのハイライト
 *   - /prediction（PRO以上）への誘導
 *
 * 参照: SPEC_v51_part5 §6 / packages/types/src/index.ts PLAN_LIMITS
 *       FXDE_v51_wireframe_integrated_v4.html (PG-06)
 */

import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { PLAN_LIMITS } from '@fxde/types';
import type { UserRole } from '@fxde/types';

// ── プラン表示設定 ────────────────────────────────────────────────────────
const PLAN_DISPLAY: Array<{
  role:        UserRole;
  label:       string;
  color:       string;
  badge:       string;
  description: string;
}> = [
  {
    role:        'FREE',
    label:       'Free',
    color:       '#64748b',
    badge:       '',
    description: '無料プラン。基本的なトレード管理が利用できます。',
  },
  {
    role:        'BASIC',
    label:       'Basic',
    color:       '#3b82f6',
    badge:       '人気',
    description: 'AI サマリー付き。複数通貨ペアのスナップショットが利用可能。',
  },
  {
    role:        'PRO',
    label:       'Pro',
    color:       '#8b5cf6',
    badge:       'おすすめ',
    description: '予測エンジン・全通貨ペア対応。プロトレーダー向け。',
  },
  {
    role:        'PRO_PLUS',
    label:       'Pro+',
    color:       '#f59e0b',
    badge:       '最上位',
    description: '最大シンボル数・AI サマリー無制限。ヘビーユーザー向け。',
  },
  {
    role:        'ADMIN',
    label:       'Admin',
    color:       '#ef4444',
    badge:       '管理者',
    description: '管理者専用。制限なし。',
  },
];

// ── 機能フラグ ───────────────────────────────────────────────────────────
const FEATURES: Array<{ label: string; roles: UserRole[] }> = [
  { label: 'トレード管理（無制限）',     roles: ['FREE', 'BASIC', 'PRO', 'PRO_PLUS', 'ADMIN'] },
  { label: 'スナップショット（20回/日）', roles: ['FREE'] },
  { label: 'スナップショット（無制限）',  roles: ['BASIC', 'PRO', 'PRO_PLUS', 'ADMIN'] },
  { label: 'AI マーケットサマリー（3回/日）', roles: ['BASIC'] },
  { label: 'AI マーケットサマリー（無制限）', roles: ['PRO', 'PRO_PLUS', 'ADMIN'] },
  { label: '予測エンジン（Prediction）',  roles: ['PRO', 'PRO_PLUS', 'ADMIN'] },
  { label: '通貨ペア 1 銘柄',            roles: ['FREE'] },
  { label: '通貨ペア 4 銘柄',            roles: ['BASIC'] },
  { label: '通貨ペア 8 銘柄',            roles: ['PRO', 'PRO_PLUS'] },
  { label: '通貨ペア 無制限',            roles: ['ADMIN'] },
  { label: 'チャート・インジケーター',    roles: ['FREE', 'BASIC', 'PRO', 'PRO_PLUS', 'ADMIN'] },
  { label: '戦略分析（Strategy）',       roles: ['FREE', 'BASIC', 'PRO', 'PRO_PLUS', 'ADMIN'] },
];

function formatLimit(val: number): string {
  if (val === Infinity) return '無制限';
  return String(val);
}

export default function PlanPage() {
  const navigate  = useNavigate();
  const user      = useAuthStore((s) => s.user);
  const userRole  = (user?.role ?? 'FREE') as UserRole;
  const isPro     = ['PRO', 'PRO_PLUS', 'ADMIN'].includes(userRole);

  return (
    <div style={s.page}>
      {/* ── ヘッダー ── */}
      <div style={s.header}>
        <h1 style={s.title}>プラン</h1>
        <p style={s.subtitle}>
          現在のプラン:{' '}
          <span style={{ color: PLAN_DISPLAY.find((p) => p.role === userRole)?.color ?? '#e2e8f0', fontWeight: 700 }}>
            {PLAN_DISPLAY.find((p) => p.role === userRole)?.label ?? userRole}
          </span>
        </p>
      </div>

      {/* ── 予測エンジン誘導バナー（FREE / BASIC のみ）── */}
      {!isPro && (
        <div style={s.upgradeBanner}>
          <div style={s.bannerLeft}>
            <span style={s.bannerIcon}>🔮</span>
            <div>
              <p style={s.bannerTitle}>予測エンジンを利用するには PRO 以上が必要です</p>
              <p style={s.bannerDesc}>
                Prediction ページでは AI ベースの相場予測（stub実装）を確認できます。
                PRO プランにアップグレードしてご利用ください。
              </p>
            </div>
          </div>
          <button style={s.upgradeBtn} onClick={() => alert('プランアップグレードは管理者にお問い合わせください')}>
            アップグレード
          </button>
        </div>
      )}

      {/* ── プランカード ── */}
      <div style={s.grid}>
        {PLAN_DISPLAY.map(({ role, label, color, badge, description }) => {
          const limits    = PLAN_LIMITS[role];
          const isCurrent = role === userRole;
          return (
            <div
              key={role}
              style={{
                ...s.card,
                borderColor: isCurrent ? color : '#2d3148',
                boxShadow:   isCurrent ? `0 0 0 2px ${color}40` : 'none',
              }}
            >
              {/* カードヘッダー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ ...s.planLabel, color }}>{label}</span>
                {badge && (
                  <span style={{ ...s.badge, backgroundColor: `${color}20`, color }}>
                    {badge}
                  </span>
                )}
                {isCurrent && (
                  <span style={{ ...s.badge, backgroundColor: '#22c55e20', color: '#22c55e', marginLeft: 'auto' }}>
                    現在のプラン
                  </span>
                )}
              </div>

              {/* 説明 */}
              <p style={s.desc}>{description}</p>

              {/* 制限値 */}
              <dl style={s.dl}>
                <div style={s.dlRow}>
                  <dt style={s.dt}>通貨ペア上限</dt>
                  <dd style={s.dd}>{formatLimit(limits.maxSymbols)}</dd>
                </div>
                <div style={s.dlRow}>
                  <dt style={s.dt}>スナップショット / 日</dt>
                  <dd style={s.dd}>{formatLimit(limits.maxSnapshotsPerDay)}</dd>
                </div>
                <div style={s.dlRow}>
                  <dt style={s.dt}>AI サマリー / 日</dt>
                  <dd style={s.dd}>{formatLimit(limits.aiSummaryPerDay)}</dd>
                </div>
                <div style={s.dlRow}>
                  <dt style={s.dt}>予測エンジン</dt>
                  <dd style={{ ...s.dd, color: ['PRO', 'PRO_PLUS', 'ADMIN'].includes(role) ? '#34d399' : '#f87171' }}>
                    {['PRO', 'PRO_PLUS', 'ADMIN'].includes(role) ? '✓ 利用可' : '✗ 利用不可'}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      {/* ── 機能対応表 ── */}
      <section style={s.featureSection}>
        <h2 style={s.sectionTitle}>機能対応表</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>機能</th>
                {PLAN_DISPLAY.map(({ role, label, color }) => (
                  <th key={role} style={{ ...s.th, color: role === userRole ? color : '#94a3b8' }}>
                    {label}
                    {role === userRole && <span style={{ fontSize: 10, display: 'block', color }}>← 現在</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(({ label, roles }) => (
                <tr key={label}>
                  <td style={s.tdLabel}>{label}</td>
                  {PLAN_DISPLAY.map(({ role }) => (
                    <td key={role} style={{ ...s.td, textAlign: 'center' }}>
                      {roles.includes(role) ? (
                        <span style={{ color: '#34d399', fontSize: 16 }}>✓</span>
                      ) : (
                        <span style={{ color: '#334155', fontSize: 16 }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── アクションボタン ── */}
      <div style={s.actions}>
        {isPro ? (
          <button style={s.primaryBtn} onClick={() => navigate('/prediction')}>
            予測エンジンを使う →
          </button>
        ) : (
          <button style={s.upgradeBtn2} onClick={() => alert('プランアップグレードは管理者にお問い合わせください')}>
            PRO にアップグレードして予測エンジンを使う
          </button>
        )}
        <button style={s.secondaryBtn} onClick={() => navigate('/dashboard')}>
          ← ダッシュボードに戻る
        </button>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth:   1100,
    margin:     '0 auto',
    padding:    '24px 16px 48px',
    color:      '#e2e8f0',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize:   24,
    fontWeight: 700,
    color:      '#e2e8f0',
    margin:     '0 0 6px',
  },
  subtitle: {
    fontSize: 14,
    color:    '#94a3b8',
    margin:   0,
  },
  upgradeBanner: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: '#1e1b4b',
    border:          '1px solid #4338ca',
    borderRadius:    10,
    padding:         '16px 20px',
    marginBottom:    24,
    gap:             16,
    flexWrap:        'wrap',
  },
  bannerLeft: {
    display: 'flex',
    gap:     12,
    alignItems: 'flex-start',
  },
  bannerIcon: {
    fontSize:   28,
    lineHeight: 1,
    flexShrink: 0,
  },
  bannerTitle: {
    fontSize:   14,
    fontWeight: 600,
    color:      '#a5b4fc',
    margin:     '0 0 4px',
  },
  bannerDesc: {
    fontSize: 12,
    color:    '#6366f1',
    margin:   0,
  },
  upgradeBtn: {
    padding:         '10px 20px',
    backgroundColor: '#4338ca',
    color:           '#fff',
    border:          'none',
    borderRadius:    8,
    fontSize:        14,
    fontWeight:      600,
    cursor:          'pointer',
    whiteSpace:      'nowrap',
    flexShrink:      0,
  },
  grid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap:                 12,
    marginBottom:        32,
  },
  card: {
    backgroundColor: '#1a1d27',
    border:          '2px solid #2d3148',
    borderRadius:    10,
    padding:         '16px',
    transition:      'border-color 0.2s',
  },
  planLabel: {
    fontSize:   18,
    fontWeight: 800,
  },
  badge: {
    fontSize:     10,
    fontWeight:   700,
    padding:      '2px 6px',
    borderRadius: 4,
  },
  desc: {
    fontSize:     12,
    color:        '#64748b',
    margin:       '0 0 12px',
    lineHeight:   1.5,
  },
  dl: {
    margin: 0,
  },
  dlRow: {
    display:       'flex',
    justifyContent: 'space-between',
    borderBottom:  '1px solid #1e2030',
    padding:       '5px 0',
  },
  dt: {
    fontSize: 11,
    color:    '#64748b',
  },
  dd: {
    fontSize:   12,
    fontWeight: 600,
    color:      '#e2e8f0',
    margin:     0,
  },
  featureSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize:     16,
    fontWeight:   700,
    color:        '#e2e8f0',
    margin:       '0 0 12px',
    paddingBottom: 8,
    borderBottom:  '1px solid #2d3148',
  },
  table: {
    width:          '100%',
    borderCollapse: 'collapse',
    fontSize:       13,
  },
  th: {
    padding:     '8px 12px',
    textAlign:   'center',
    color:       '#94a3b8',
    fontWeight:  600,
    borderBottom: '2px solid #2d3148',
    whiteSpace:  'nowrap',
  },
  tdLabel: {
    padding:     '7px 12px',
    color:       '#94a3b8',
    borderBottom: '1px solid #1e2030',
    fontSize:    12,
    whiteSpace:  'nowrap',
  },
  td: {
    padding:     '7px 12px',
    borderBottom: '1px solid #1e2030',
  },
  actions: {
    display: 'flex',
    gap:     12,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    padding:         '12px 24px',
    backgroundColor: '#7c3aed',
    color:           '#fff',
    border:          'none',
    borderRadius:    8,
    fontSize:        14,
    fontWeight:      600,
    cursor:          'pointer',
  },
  upgradeBtn2: {
    padding:         '12px 24px',
    backgroundColor: '#2563eb',
    color:           '#fff',
    border:          'none',
    borderRadius:    8,
    fontSize:        14,
    fontWeight:      600,
    cursor:          'pointer',
  },
  secondaryBtn: {
    padding:         '12px 20px',
    backgroundColor: 'transparent',
    color:           '#94a3b8',
    border:          '1px solid #334155',
    borderRadius:    8,
    fontSize:        14,
    cursor:          'pointer',
  },
};