/**
 * apps/web/src/components/layout/Layout.tsx
 *
 * 参照仕様:
 *   SPEC_v51_part5 §1.1「レイアウト構造」
 *   SPEC_v51_part10「ディレクトリ構成 components/layout/」
 *   FXDE_v51_wireframe_integrated.html — .app-shell CSS Grid 定義
 *
 * レイアウト構成（正本準拠）:
 *   grid-template-areas:
 *     "top    top"
 *     "side   ticker"
 *     "side   main"
 *
 * 変更履歴:
 *   - v2: TopBar / TickerBar を追加し4要素構成に修正（タスクA）
 *         既存 Sidebar / ユーザーセクション / 免責フッターはそのまま維持
 */

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

// ── CSS 変数相当の定数 ────────────────────────────────────────────────────
const TOPBAR_H  = 56;   // px
const SIDEBAR_W = 220;  // px
const TICKER_H  = 44;   // px

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

// ─────────────────────────────────────────────────────────────────────────────
// TopBar 補助コンポーネント: Clock（ローカル + UTC）
// SPEC_v51_part5 §1.3 TopBar 仕様準拠
// ─────────────────────────────────────────────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const local = now.toLocaleTimeString('ja-JP');
  const utc   = now.toUTCString().slice(-12, -4); // HH:MM:SS
  return (
    <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#e2e8f0' }}>{local}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>UTC {utc}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TickerBar: 監視ペアの横スクロール表示
// SPEC_v51_part5 §1.3 Ticker Bar 仕様準拠（stub 表示）
// 将来: TanStack Query で price-sync キャッシュからポーリング（30秒）
// ─────────────────────────────────────────────────────────────────────────────

/** stub ティッカーデータ（将来 API 連携で置き換え）*/
const STUB_TICKERS = [
  { symbol: 'EURUSD', price: '1.0842', change: '+0.24%', up: true,  score: 72 },
  { symbol: 'USDJPY', price: '149.80', change: '-0.18%', up: false, score: 48 },
  { symbol: 'GBPUSD', price: '1.2711', change: '+0.12%', up: true,  score: 78 },
  { symbol: 'AUDUSD', price: '0.6534', change: '+0.05%', up: true,  score: 65 },
];

function TickerBar() {
  return (
    <div style={styles.tickerInner}>
      <span style={styles.tickerLabel}>Ticker</span>
      {STUB_TICKERS.map((t) => (
        <div key={t.symbol} style={styles.tickerItem}>
          <span style={styles.tickerSymbol}>{t.symbol}</span>
          <span style={styles.tickerPrice}>{t.price}</span>
          <span style={{ color: t.up ? '#2EC96A' : '#E05252', fontSize: 11 }}>
            {t.change}
          </span>
          <span style={{
            fontSize: 10,
            color: t.score >= 75 ? '#2EC96A' : t.score >= 50 ? '#E8B830' : '#E05252',
          }}>
            {t.score}
          </span>
        </div>
      ))}
      <span style={styles.tickerMuted}>Plan limits: FREE=1 / BASIC=4 / PRO=8</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout（メインエクスポート）
// ─────────────────────────────────────────────────────────────────────────────
export default function Layout() {
  const logout   = useAuthStore((s) => s.logout);
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={styles.shell}>

      {/* ── TopBar ── grid-area: top ───────────────────────────── */}
      <header style={styles.topbar}>
        <div style={styles.topbarInner}>
          <span style={styles.brandText}>FX<span style={{ color: '#2EC96A' }}>DE</span></span>
          <span style={styles.brandVersion}>v5.1</span>
          <div style={styles.divider} />
          <span style={styles.topbarMuted}>EUR/USD</span>
          <div style={styles.topbarRight}>
            <Clock />
            {user && (
              <div style={styles.userChip}>
                <span style={styles.userEmail}>{user.email}</span>
                <span style={styles.userRoleBadge}>{user.role}</span>
                <button onClick={handleLogout} style={styles.logoutBtn} data-testid="logout-btn">
                  ログアウト
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Sidebar ── grid-area: side ────────────────────────── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarNav}>
          <p style={styles.navLabel}>Navigation</p>
          <nav>
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
                {'proOnly' in item && item.proOnly && (
                  <span style={styles.proBadge}>PRO</span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* 免責フッター（SPEC_v51_part5 §1.2）*/}
        <p style={styles.disclaimer}>
          <span style={{ color: '#E05252', fontWeight: 600 }}>※ 免責事項</span>
          <br />
          本ツールは情報提供のみを目的とし、投資助言ではありません。
          投資の最終判断はご自身の責任で行ってください。
        </p>
      </aside>

      {/* ── TickerBar ── grid-area: ticker ───────────────────── */}
      <div style={styles.ticker}>
        <TickerBar />
      </div>

      {/* ── Main Content ── grid-area: main ──────────────────── */}
      <main style={styles.main}>
        <Outlet />
      </main>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// スタイル定義
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  // ── App Shell: CSS Grid 4エリア ──────────────────────────────────────────
  // FXDE_v51_wireframe の .app-shell grid 定義に準拠
  shell: {
    display:             'grid',
    gridTemplateColumns: `${SIDEBAR_W}px 1fr`,
    gridTemplateRows:    `${TOPBAR_H}px ${TICKER_H}px 1fr`,
    gridTemplateAreas:   '"top top" "side ticker" "side main"',
    minHeight:           '100vh',
    background:          '#0D0F14',
    color:               '#E2E8F0',
    fontFamily:          'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,

  // ── TopBar ────────────────────────────────────────────────────────────────
  topbar: {
    gridArea:     'top',
    height:       TOPBAR_H,
    background:   '#161920',
    borderBottom: '1px solid #252830',
    position:     'sticky' as const,
    top:          0,
    zIndex:       40,
  } as React.CSSProperties,
  topbarInner: {
    height:     '100%',
    padding:    '0 16px',
    display:    'flex',
    alignItems: 'center',
    gap:        12,
  } as React.CSSProperties,
  brandText: {
    fontSize:      18,
    fontWeight:    700,
    fontFamily:    'monospace',
    color:         '#4D9FFF',
    letterSpacing: '0.06em',
  } as React.CSSProperties,
  brandVersion: {
    fontSize: 10,
    color:    '#475569',
  } as React.CSSProperties,
  divider: {
    width:      1,
    height:     20,
    background: '#252830',
    flexShrink: 0,
  } as React.CSSProperties,
  topbarMuted: {
    fontSize: 13,
    color:    '#94A3B8',
  } as React.CSSProperties,
  topbarRight: {
    marginLeft: 'auto',
    display:    'flex',
    alignItems: 'center',
    gap:        16,
  } as React.CSSProperties,
  userChip: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    padding:      '4px 10px',
    background:   '#0D0F14',
    border:       '1px solid #252830',
    borderRadius: 8,
  } as React.CSSProperties,
  userEmail: {
    fontSize:     12,
    color:        '#94A3B8',
    maxWidth:     160,
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
  } as React.CSSProperties,
  userRoleBadge: {
    fontSize:      10,
    color:         '#E8B830',
    fontWeight:    700,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  logoutBtn: {
    background:   'none',
    border:       '1px solid #334155',
    color:        '#64748b',
    padding:      '3px 8px',
    borderRadius: 4,
    cursor:       'pointer',
    fontSize:     11,
  } as React.CSSProperties,

  // ── Sidebar ───────────────────────────────────────────────────────────────
  sidebar: {
    gridArea:      'side',
    width:         SIDEBAR_W,
    height:        `calc(100vh - ${TOPBAR_H}px)`,
    position:      'sticky' as const,
    top:           TOPBAR_H,
    background:    '#161920',
    borderRight:   '1px solid #252830',
    display:       'flex',
    flexDirection: 'column' as const,
    overflowY:     'auto' as const,
  } as React.CSSProperties,
  sidebarNav: {
    flex:    1,
    padding: '12px 0',
  } as React.CSSProperties,
  navLabel: {
    fontSize:      10,
    color:         '#475569',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    padding:       '0 16px',
    margin:        '0 0 8px',
  } as React.CSSProperties,
  navLink: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '8px 16px',
    color:          '#94A3B8',
    textDecoration: 'none',
    fontSize:       13,
    borderLeft:     '3px solid transparent',
  } as React.CSSProperties,
  navLinkActive: {
    background: 'rgba(77,159,255,0.10)',
    color:      '#4D9FFF',
    borderLeft: '3px solid #4D9FFF',
  } as React.CSSProperties,
  proBadge: {
    fontSize:     9,
    background:   'linear-gradient(90deg,#E8B830,#E05252)',
    color:        '#fff',
    borderRadius: 3,
    padding:      '1px 5px',
    fontWeight:   700,
  } as React.CSSProperties,
  disclaimer: {
    fontSize:   10,
    color:      '#374151',
    padding:    '10px 14px',
    lineHeight: 1.5,
    borderTop:  '1px solid #252830',
    margin:     0,
  } as React.CSSProperties,

  // ── TickerBar ─────────────────────────────────────────────────────────────
  ticker: {
    gridArea:    'ticker',
    height:      TICKER_H,
    background:  '#161920',
    borderBottom: '1px solid #252830',
    overflowX:   'auto' as const,
  } as React.CSSProperties,
  tickerInner: {
    height:     '100%',
    minWidth:   'max-content',
    display:    'flex',
    alignItems: 'center',
    gap:        16,
    padding:    '0 16px',
  } as React.CSSProperties,
  tickerLabel: {
    fontSize:      10,
    color:         '#475569',
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    marginRight:   4,
    flexShrink:    0,
  } as React.CSSProperties,
  tickerItem: {
    display:      'flex',
    alignItems:   'center',
    gap:          6,
    padding:      '3px 8px',
    border:       '1px solid #252830',
    borderRadius: 4,
    fontFamily:   'monospace',
  } as React.CSSProperties,
  tickerSymbol: {
    fontSize:   11,
    color:      '#94A3B8',
    fontWeight: 600,
  } as React.CSSProperties,
  tickerPrice: {
    fontSize: 12,
    color:    '#E2E8F0',
  } as React.CSSProperties,
  tickerMuted: {
    fontSize:   10,
    color:      '#475569',
    flexShrink: 0,
  } as React.CSSProperties,

  // ── Main Content ─────────────────────────────────────────────────────────
  main: {
    gridArea:  'main',
    overflowY: 'auto' as const,
    padding:   '24px',
    background: '#0D0F14',
  } as React.CSSProperties,
} as const;