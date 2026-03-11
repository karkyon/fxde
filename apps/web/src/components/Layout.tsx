import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const NAV_ITEMS = [
  { to: '/dashboard', label: '📊 Dashboard' },
  { to: '/trades', label: '💹 Trades' },
  { to: '/signals', label: '📡 Signals' },
  { to: '/settings', label: '⚙️ Settings' },
];

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
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

        <div style={styles.userBlock}>
          {user && (
            <div style={styles.userInfo}>
              <span style={styles.userName}>{user.name}</span>
              <span style={styles.userRole}>{user.role}</span>
            </div>
          )}
          <button style={styles.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#0f1117',
    color: '#e2e8f0',
    fontFamily:
      "'Inter', 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
  },
  sidebar: {
    width: 220,
    minWidth: 220,
    backgroundColor: '#1a1d27',
    borderRight: '1px solid #2d3148',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
  },
  brand: {
    padding: '24px 20px 20px',
    borderBottom: '1px solid #2d3148',
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  brandText: {
    fontSize: 22,
    fontWeight: 700,
    color: '#60a5fa',
    letterSpacing: '-0.5px',
  },
  brandVersion: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: 500,
  },
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
  },
  navLink: {
    display: 'block',
    padding: '10px 20px',
    color: '#94a3b8',
    textDecoration: 'none',
    borderRadius: 0,
    transition: 'all 0.15s',
    fontSize: 14,
    fontWeight: 500,
  },
  navLinkActive: {
    color: '#60a5fa',
    backgroundColor: '#1e2540',
    borderLeft: '3px solid #60a5fa',
    paddingLeft: 17,
  },
  userBlock: {
    padding: '16px 20px',
    borderTop: '1px solid #2d3148',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 10,
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#cbd5e1',
  },
  userRole: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  logoutBtn: {
    width: '100%',
    padding: '8px 0',
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: '28px 32px',
  },
};