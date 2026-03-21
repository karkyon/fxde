import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ email, password });
      navigate('/dashboard');

    } catch (e) {
      setError('メールアドレスまたはパスワードが正しくありません。');

    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo}>FXDE</span>
          <p style={styles.subtitle}>FX Discipline Engine v5.1</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
              autoComplete="email"
              data-testid="email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
              autoComplete="current-password"
              data-testid="password"
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button} disabled={loading} data-testid="login-btn">
            {loading ? 'ログインしています...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#0f1117',
  },
  card: {
    width: 360,
    backgroundColor: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: 12,
    padding: '40px 36px',
  },
  header: {
    textAlign: 'center',
    marginBottom: 32,
  },
  logo: {
    display: 'block',
    fontSize: 36,
    fontWeight: 800,
    color: '#60a5fa',
    letterSpacing: '-1px',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#94a3b8',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
  },
  error: {
    fontSize: 13,
    color: '#f87171',
    backgroundColor: '#2d1515',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #7f1d1d',
  },
  button: {
    padding: '12px 0',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};