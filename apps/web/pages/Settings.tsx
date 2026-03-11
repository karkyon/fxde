import { useState, useEffect, FormEvent } from 'react';
import { useSettings, useUpdateSettings } from '../hooks/queries';

export default function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings();
  const updateSettings = useUpdateSettings();

  const [form, setForm] = useState({
    maxDailyLoss: '',
    maxWeeklyLoss: '',
    defaultLotSize: '',
    riskPerTrade: '',
    watchedSymbols: '',
    emailNotifications: false,
    timezone: 'Asia/Tokyo',
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        maxDailyLoss: String(settings.maxDailyLoss),
        maxWeeklyLoss: String(settings.maxWeeklyLoss),
        defaultLotSize: String(settings.defaultLotSize),
        riskPerTrade: String(settings.riskPerTrade),
        watchedSymbols: settings.watchedSymbols.join(', '),
        emailNotifications: settings.emailNotifications,
        timezone: settings.timezone,
      });
    }
  }, [settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      maxDailyLoss: Number(form.maxDailyLoss),
      maxWeeklyLoss: Number(form.maxWeeklyLoss),
      defaultLotSize: Number(form.defaultLotSize),
      riskPerTrade: Number(form.riskPerTrade),
      watchedSymbols: form.watchedSymbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      emailNotifications: form.emailNotifications,
      timezone: form.timezone,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (isLoading) return <p style={styles.muted}>Loading...</p>;
  if (error) return <p style={styles.errText}>Settings 取得エラー</p>;

  return (
    <div>
      <h1 style={styles.title}>Settings</h1>

      <form onSubmit={handleSubmit} style={styles.card}>
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Risk Management</h2>
          <div style={styles.formGrid}>
            <Field label="Max Daily Loss ($)">
              <input
                type="number"
                step="any"
                value={form.maxDailyLoss}
                onChange={(e) => setForm({ ...form, maxDailyLoss: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Max Weekly Loss ($)">
              <input
                type="number"
                step="any"
                value={form.maxWeeklyLoss}
                onChange={(e) => setForm({ ...form, maxWeeklyLoss: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Default Lot Size">
              <input
                type="number"
                step="any"
                value={form.defaultLotSize}
                onChange={(e) => setForm({ ...form, defaultLotSize: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Risk Per Trade (%)">
              <input
                type="number"
                step="any"
                min="0"
                max="100"
                value={form.riskPerTrade}
                onChange={(e) => setForm({ ...form, riskPerTrade: e.target.value })}
                style={styles.input}
              />
            </Field>
          </div>
        </section>

        <div style={styles.divider} />

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Pairs & Notifications</h2>
          <div style={styles.formGrid}>
            <Field label="Watched Symbols (comma-separated)" style={{ gridColumn: '1/-1' }}>
              <input
                type="text"
                value={form.watchedSymbols}
                onChange={(e) => setForm({ ...form, watchedSymbols: e.target.value })}
                placeholder="USDJPY, EURUSD, XAUUSD"
                style={styles.input}
              />
            </Field>
            <Field label="Timezone">
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                style={styles.input}
              >
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
            <Field label="Email Notifications">
              <label style={styles.toggle}>
                <input
                  type="checkbox"
                  checked={form.emailNotifications}
                  onChange={(e) => setForm({ ...form, emailNotifications: e.target.checked })}
                  style={{ accentColor: '#2563eb', width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  {form.emailNotifications ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </Field>
          </div>
        </section>

        <div style={styles.footer}>
          {saved && (
            <span style={styles.savedMsg}>✓ 保存しました</span>
          )}
          <button type="submit" style={styles.primaryBtn} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <label style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' },
  card: { backgroundColor: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '28px 32px', maxWidth: 720 },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#64748b', marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.5px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
  input: { padding: '9px 12px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13, width: '100%' },
  toggle: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
  divider: { borderTop: '1px solid #2d3148', margin: '24px 0' },
  footer: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 24, paddingTop: 20, borderTop: '1px solid #2d3148' },
  primaryBtn: { padding: '10px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  savedMsg: { color: '#34d399', fontSize: 13, fontWeight: 600 },
  muted: { color: '#475569', fontSize: 13 },
  errText: { color: '#f87171', fontSize: 13 },
};