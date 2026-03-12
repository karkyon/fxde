/**
 * apps/web/src/components/layout/Layout.tsx
 *
 * 変更理由:
 *   - components/Layout.tsx → components/layout/Layout.tsx に移動（Part 10 構成準拠）
 *   - Sidebar ナビゲーション項目を仕様正本（Part 5 §1.3）に統一
 *   - 廃止項目（/signals）削除
 *   - 追加項目（/strategy, /chart, /plan）追加
 *   - stores/authStore → stores/auth.store に変更
 *   - Outlet を react-router-dom から import
 *
 * 参照仕様: SPEC_v51_part5 §1.3「サイドバーナビゲーション（7 項目）」
 *           SPEC_v51_part10「ディレクトリ構成」components/layout/
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

// SPEC_v51_part5 §1.3 確定ナビゲーション 7 項目
const NAV_ITEMS = [
  { id: 'PG-01', to: '/dashboard',   label: '📊 ダッシュボード' },
  { id: 'PG-02', to: '/trades',      label: '💹 トレード' },
  { id: 'PG-03', to: '/strategy',    label: '📐 ストラテジー' },
  { id: 'PG-04', to: '/prediction',  label: '🔮 MTF 予測', proOnly: true },
  { id: 'PG-07', to: '/chart',       label: '📈 チャート' },
  { id: 'PG-05', to: '/settings',    label: '⚙️ 設定' },
  { id: 'PG-06', to: '/plan',        label: '💳 プラン' },
] as const;

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);
  const user   = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <span style={styles.brandText}>FXDE</span>
          <span style={styles.brandVersion}>v5.1</span>
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* ユーザー情報 + ログアウト */}
        <div style={styles.userSection}>
          {user && (
            <div style={styles.userInfo}>
              <span style={styles.userEmail}>{user.email}</span>
              <span style={styles.userRole}>{user.role}</span>
            </div>
          )}
          <button onClick={handleLogout} style={styles.logoutBtn}>
            ログアウト
          </button>
        </div>

        {/* 免責フッター（SPEC_v51_part5 §1.2）*/}
        <p style={styles.disclaimer}>
          ※ 本ツールは情報提供のみを目的とし、投資助言ではありません。
          投資の最終判断はご自身の責任で行ってください。
        </p>
      </aside>

      {/* Main Content */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

// ── スタイル ─────────────────────────────────────────────────────────────
const styles = {
  shell: {
    display:       'flex',
    minHeight:     '100vh',
    background:    '#0f1117',
    color:         '#e2e8f0',
    fontFamily:    'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  sidebar: {
    width:         '220px',
    flexShrink:    0,
    background:    '#161b27',
    borderRight:   '1px solid #1e2736',
    display:       'flex',
    flexDirection: 'column' as const,
    padding:       '16px 0',
  } as React.CSSProperties,
  brand: {
    display:       'flex',
    alignItems:    'baseline',
    gap:           '6px',
    padding:       '0 16px 20px',
    borderBottom:  '1px solid #1e2736',
  } as React.CSSProperties,
  brandText: {
    fontSize:    '20px',
    fontWeight:  700,
    color:       '#60a5fa',
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  brandVersion: {
    fontSize: '11px',
    color:    '#475569',
  } as React.CSSProperties,
  nav: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column' as const,
    padding:       '12px 0',
    gap:           '2px',
  } as React.CSSProperties,
  navLink: {
    display:        'block',
    padding:        '8px 16px',
    color:          '#94a3b8',
    textDecoration: 'none',
    fontSize:       '13px',
    borderRadius:   '4px',
    margin:         '0 8px',
    transition:     'background 0.15s',
  } as React.CSSProperties,
  navLinkActive: {
    background: '#1e3a5f',
    color:      '#60a5fa',
  } as React.CSSProperties,
  userSection: {
    padding:      '12px 16px',
    borderTop:    '1px solid #1e2736',
    display:      'flex',
    flexDirection: 'column' as const,
    gap:          '8px',
  } as React.CSSProperties,
  userInfo: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           '2px',
  } as React.CSSProperties,
  userEmail: {
    fontSize: '12px',
    color:    '#64748b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  userRole: {
    fontSize:     '10px',
    color:        '#3b82f6',
    fontWeight:   600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  logoutBtn: {
    background:   'none',
    border:       '1px solid #334155',
    color:        '#94a3b8',
    padding:      '6px 12px',
    borderRadius: '4px',
    cursor:       'pointer',
    fontSize:     '12px',
    textAlign:    'left' as const,
  } as React.CSSProperties,
  disclaimer: {
    fontSize:   '9px',
    color:      '#374151',
    padding:    '8px 12px',
    lineHeight: 1.4,
  } as React.CSSProperties,
  main: {
    flex:       1,
    overflow:   'auto',
    padding:    '24px',
  } as React.CSSProperties,
} as const;