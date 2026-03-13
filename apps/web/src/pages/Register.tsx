/**
 * apps/web/src/pages/Register.tsx
 *
 * backend 契約:
 *   POST /api/v1/auth/register
 *   body: { email: string; password: string }
 *   ※ RegisterSchema（packages/types）は confirmPassword を含まない
 *   ※ confirmPassword はフロント側バリデーションのみ
 *   ※ パスワード要件: 12文字以上・72文字以下・大文字/小文字/数字を各1文字以上
 *
 * 参照: SPEC_v51_part3 §2 / auth.schema.ts / auth.controller.ts
 */

import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

// パスワード要件（RegisterSchema と同期）
const PASSWORD_RULES = {
  minLength: 12,
  maxLength: 72,
  pattern:   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
};

function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_RULES.minLength) {
    return `パスワードは ${PASSWORD_RULES.minLength} 文字以上で入力してください`;
  }
  if (pw.length > PASSWORD_RULES.maxLength) {
    return `パスワードは ${PASSWORD_RULES.maxLength} 文字以内で入力してください`;
  }
  if (!PASSWORD_RULES.pattern.test(pw)) {
    return 'パスワードは英大文字・小文字・数字を各1文字以上含めてください';
  }
  return null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const setUser  = useAuthStore((s) => s.setUser);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // ── フロント側バリデーション ──────────────────────────
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    if (password !== confirm) {
      setError('パスワードと確認用パスワードが一致しません');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.register({ email, password });
      // 登録成功後、アクセストークンをメモリに保持してログイン状態に
      if (res.accessToken) {
        const { setAccessToken } = await import('../lib/api');
        setAccessToken(res.accessToken);
        setUser(res.user);
      }
      setSuccess(true);
      // 登録完了後はダッシュボードへ
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = anyErr?.response?.data?.message ?? anyErr?.message ?? '登録に失敗しました';
      // 重複メール等のバックエンドエラーをわかりやすく
      if (typeof msg === 'string' && msg.toLowerCase().includes('email')) {
        setError('このメールアドレスはすでに登録されています');
      } else {
        setError(typeof msg === 'string' ? msg : '登録に失敗しました。時間をおいて再度お試しください。');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ color: '#34d399', marginBottom: 8 }}>登録完了</h2>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>ダッシュボードへ移動します…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* ── Header ── */}
        <div style={styles.header}>
          <span style={styles.logo}>FXDE</span>
          <p style={styles.subtitle}>FX Discipline Engine v5.1</p>
          <p style={{ ...styles.subtitle, marginTop: 4 }}>新規アカウント登録</p>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
              style={styles.input}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div style={styles.field}>
            <label style={styles.label}>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="12文字以上（大文字・小文字・数字を含む）"
              required
              disabled={loading}
              style={styles.input}
              autoComplete="new-password"
            />
            <p style={styles.hint}>
              12〜72文字・英大文字・小文字・数字を各1文字以上
            </p>
          </div>

          {/* Confirm Password */}
          <div style={styles.field}>
            <label style={styles.label}>パスワード（確認）</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="パスワードを再入力"
              required
              disabled={loading}
              style={styles.input}
              autoComplete="new-password"
            />
          </div>

          {/* Error */}
          {error && <p style={styles.error}>{error}</p>}

          {/* Submit */}
          <button
            type="submit"
            style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? '登録中…' : 'アカウントを作成'}
          </button>
        </form>

        {/* ── Footer Link ── */}
        <p style={styles.footer}>
          すでにアカウントをお持ちですか？{' '}
          <Link to="/login" style={styles.link}>ログインはこちら</Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    minHeight:       '100vh',
    backgroundColor: '#0f1117',
  },
  card: {
    width:           380,
    backgroundColor: '#1a1d27',
    border:          '1px solid #2d3148',
    borderRadius:    12,
    padding:         '40px 36px',
  },
  header: {
    textAlign:    'center',
    marginBottom: 28,
  },
  logo: {
    display:       'block',
    fontSize:      36,
    fontWeight:    800,
    color:         '#60a5fa',
    letterSpacing: '-1px',
    marginBottom:  6,
  },
  subtitle: {
    fontSize: 13,
    color:    '#64748b',
    margin:   0,
  },
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           16,
  },
  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           5,
  },
  label: {
    fontSize:   13,
    fontWeight: 600,
    color:      '#94a3b8',
  },
  hint: {
    fontSize: 11,
    color:    '#475569',
    margin:   '3px 0 0',
  },
  input: {
    width:           '100%',
    padding:         '10px 14px',
    fontSize:        14,
    backgroundColor: '#0f1117',
    border:          '1px solid #334155',
    borderRadius:    8,
    color:           '#e2e8f0',
    outline:         'none',
    boxSizing:       'border-box',
  },
  error: {
    fontSize:        13,
    color:           '#f87171',
    backgroundColor: '#2d1515',
    padding:         '8px 12px',
    borderRadius:    6,
    border:          '1px solid #7f1d1d',
    margin:          0,
  },
  button: {
    padding:         '12px 0',
    backgroundColor: '#2563eb',
    color:           '#fff',
    border:          'none',
    borderRadius:    8,
    fontSize:        15,
    fontWeight:      600,
    cursor:          'pointer',
    transition:      'background 0.15s',
    marginTop:       4,
  },
  footer: {
    textAlign:    'center',
    fontSize:     13,
    color:        '#64748b',
    marginTop:    20,
    marginBottom: 0,
  },
  link: {
    color:          '#60a5fa',
    textDecoration: 'none',
  },
};