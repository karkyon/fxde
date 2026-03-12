/**
 * apps/web/src/pages/Settings.tsx
 *
 * 修正内容:
 *   旧フィールド（maxDailyLoss/maxWeeklyLoss/defaultLotSize/riskPerTrade/
 *   watchedSymbols/emailNotifications/timezone）を全廃。
 *   UserSettingDto の正本フィールドに合わせて再設計:
 *     preset / scoreThreshold / riskProfile / uiPrefs / featureSwitches / forceLock
 *
 * 【今回修正】TS2352 型キャストエラー修正:
 *   (s.riskProfile as Record<string, number>) → 直接プロパティアクセスに変更
 *   (s.uiPrefs    as Record<string, string>)  → 直接プロパティアクセスに変更
 *   (s.featureSwitches as Record<string, boolean>) → 直接プロパティアクセスに変更
 *   RiskProfile / UiPrefs / FeatureSwitches は型付き interface のため
 *   Record<string, xxx> へのキャストは型エラーになる。
 *
 * 参照: SPEC_v51_part2 §2 UserSetting model, SPEC_v51_part3 §5
 */

import { useState, useEffect, FormEvent } from 'react';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import type { UserSettingDto } from '@fxde/types';

type Preset = 'conservative' | 'standard' | 'aggressive';

interface FormState {
  preset: Preset;
  scoreThreshold: string;
  forceLock: boolean;
  // riskProfile
  maxRiskPct: string;
  maxDailyLossPct: string;
  maxStreak: string;
  cooldownMin: string;
  maxTrades: string;
  atrMultiplier: string;
  // uiPrefs
  theme: 'dark' | 'light';
  mode: 'beginner' | 'pro';
  defaultSymbol: string;
  defaultTimeframe: string;
  // featureSwitches
  aiSignal: boolean;
  patternBonus: boolean;
  newsLock: boolean;
  cooldownTimer: boolean;
  mtfPrediction: boolean;
}

// ── 修正箇所 ──────────────────────────────────────────────────────────────────
// 修正前（エラー）:
//   const rp = (s.riskProfile    as Record<string, number>)  ?? {};
//   const ui = (s.uiPrefs        as Record<string, string>)  ?? {};
//   const fs = (s.featureSwitches as Record<string, boolean>) ?? {};
//
// 修正後（直接プロパティアクセス）:
//   RiskProfile / UiPrefs / FeatureSwitches は型付き interface のため
//   キャスト不要。各フィールドに直接アクセスする。
// ─────────────────────────────────────────────────────────────────────────────
function toFormState(s: UserSettingDto): FormState {
  const rp = s.riskProfile;
  const ui = s.uiPrefs;
  const fs = s.featureSwitches;
  return {
    preset:           s.preset as Preset,
    scoreThreshold:   String(s.scoreThreshold),
    forceLock:        s.forceLock,
    maxRiskPct:       String(rp.maxRiskPct      ?? 1.0),
    maxDailyLossPct:  String(rp.maxDailyLossPct ?? 3.0),
    maxStreak:        String(rp.maxStreak        ?? 3),
    cooldownMin:      String(rp.cooldownMin      ?? 60),
    maxTrades:        String(rp.maxTrades        ?? 5),
    atrMultiplier:    String(rp.atrMultiplier    ?? 1.5),
    theme:            ui.theme            ?? 'dark',
    mode:             ui.mode             ?? 'pro',
    defaultSymbol:    ui.defaultSymbol    ?? 'EURUSD',
    defaultTimeframe: ui.defaultTimeframe ?? 'H4',
    aiSignal:         fs.aiSignal      ?? true,
    patternBonus:     fs.patternBonus  ?? true,
    newsLock:         fs.newsLock      ?? true,
    cooldownTimer:    fs.cooldownTimer ?? true,
    mtfPrediction:    fs.mtfPrediction ?? true,
  };
}

export default function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings();
  const updateSettings = useUpdateSettings();

  const [form, setForm] = useState<FormState>({
    preset: 'standard',
    scoreThreshold: '75',
    forceLock: false,
    maxRiskPct: '1.0',
    maxDailyLossPct: '3.0',
    maxStreak: '3',
    cooldownMin: '60',
    maxTrades: '5',
    atrMultiplier: '1.5',
    theme: 'dark',
    mode: 'pro',
    defaultSymbol: 'EURUSD',
    defaultTimeframe: 'H4',
    aiSignal: true,
    patternBonus: true,
    newsLock: true,
    cooldownTimer: true,
    mtfPrediction: true,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm(toFormState(settings));
  }, [settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      preset:         form.preset,
      scoreThreshold: Number(form.scoreThreshold),
      forceLock:      form.forceLock,
      riskProfile: {
        maxRiskPct:      Number(form.maxRiskPct),
        maxDailyLossPct: Number(form.maxDailyLossPct),
        maxStreak:       Number(form.maxStreak),
        cooldownMin:     Number(form.cooldownMin),
        maxTrades:       Number(form.maxTrades),
        atrMultiplier:   Number(form.atrMultiplier),
      },
      uiPrefs: {
        theme:            form.theme,
        mode:             form.mode,
        defaultSymbol:    form.defaultSymbol,
        defaultTimeframe: form.defaultTimeframe,
      },
      featureSwitches: {
        aiSignal:      form.aiSignal,
        patternBonus:  form.patternBonus,
        newsLock:      form.newsLock,
        cooldownTimer: form.cooldownTimer,
        mtfPrediction: form.mtfPrediction,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (isLoading) return <p style={styles.muted}>Loading...</p>;
  if (error)     return <p style={styles.errText}>Settings 取得エラー</p>;

  return (
    <div>
      <h1 style={styles.title}>Settings</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── General ── */}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>General</h2>
          <div style={styles.formGrid}>
            <Field label="Preset">
              <select
                value={form.preset}
                onChange={(e) => setForm({ ...form, preset: e.target.value as Preset })}
                style={styles.input}
              >
                <option value="conservative">conservative</option>
                <option value="standard">standard</option>
                <option value="aggressive">aggressive</option>
              </select>
            </Field>
            <Field label="Score Threshold (50–95)">
              <input
                type="number" min={50} max={95}
                value={form.scoreThreshold}
                onChange={(e) => setForm({ ...form, scoreThreshold: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Force Lock">
              <label style={styles.toggle}>
                <input
                  type="checkbox"
                  checked={form.forceLock}
                  onChange={(e) => setForm({ ...form, forceLock: e.target.checked })}
                />
                <span style={{ marginLeft: 8 }}>全エントリーをロック</span>
              </label>
            </Field>
          </div>
        </section>

        {/* ── Risk Profile ── */}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Risk Profile</h2>
          <div style={styles.formGrid}>
            <Field label="Max Risk Per Trade (%)">
              <input type="number" step="0.1" min={0.1} max={5}
                value={form.maxRiskPct}
                onChange={(e) => setForm({ ...form, maxRiskPct: e.target.value })}
                style={styles.input} />
            </Field>
            <Field label="Max Daily Loss (%)">
              <input type="number" step="0.1" min={0.5} max={20}
                value={form.maxDailyLossPct}
                onChange={(e) => setForm({ ...form, maxDailyLossPct: e.target.value })}
                style={styles.input} />
            </Field>
            <Field label="Max Consecutive Loss">
              <input type="number" min={1} max={10}
                value={form.maxStreak}
                onChange={(e) => setForm({ ...form, maxStreak: e.target.value })}
                style={styles.input} />
            </Field>
            <Field label="Cooldown (min)">
              <input type="number" min={5} max={480}
                value={form.cooldownMin}
                onChange={(e) => setForm({ ...form, cooldownMin: e.target.value })}
                style={styles.input} />
            </Field>
            <Field label="Max Trades Per Day">
              <input type="number" min={1} max={20}
                value={form.maxTrades}
                onChange={(e) => setForm({ ...form, maxTrades: e.target.value })}
                style={styles.input} />
            </Field>
            <Field label="ATR Multiplier">
              <input type="number" step="0.1" min={0.5} max={5}
                value={form.atrMultiplier}
                onChange={(e) => setForm({ ...form, atrMultiplier: e.target.value })}
                style={styles.input} />
            </Field>
          </div>
        </section>

        {/* ── UI Prefs ── */}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>UI Preferences</h2>
          <div style={styles.formGrid}>
            <Field label="Theme">
              <select value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value as 'dark' | 'light' })}
                style={styles.input}>
                <option value="dark">dark</option>
                <option value="light">light</option>
              </select>
            </Field>
            <Field label="Mode">
              <select value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as 'beginner' | 'pro' })}
                style={styles.input}>
                <option value="beginner">beginner</option>
                <option value="pro">pro</option>
              </select>
            </Field>
            <Field label="Default Symbol">
              <input type="text" value={form.defaultSymbol}
                onChange={(e) => setForm({ ...form, defaultSymbol: e.target.value })}
                style={styles.input} />
            </Field>
            <Field label="Default Timeframe">
              <select value={form.defaultTimeframe}
                onChange={(e) => setForm({ ...form, defaultTimeframe: e.target.value })}
                style={styles.input}>
                {['M1','M5','M15','M30','H1','H4','H8','D1','W1','MN'].map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* ── Feature Switches ── */}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Feature Switches</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([
              ['aiSignal',      'AI Signal 表示'],
              ['patternBonus',  'パターンボーナス加算'],
              ['newsLock',      'ニュース前ロック'],
              ['cooldownTimer', '冷却タイマー有効'],
              ['mtfPrediction', 'MTF 予測機能'],
            ] as [keyof FormState, string][]).map(([key, label]) => (
              <label key={key} style={styles.toggle}>
                <input
                  type="checkbox"
                  checked={form[key] as boolean}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                <span style={{ marginLeft: 8, fontSize: 13, color: '#cbd5e1' }}>{label}</span>
              </label>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button type="submit" style={styles.primaryBtn} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? '保存中...' : '保存'}
          </button>
          {saved && <span style={{ color: '#34d399', fontSize: 13 }}>✓ 保存しました</span>}
        </div>
      </form>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  title:        { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' },
  card:         { backgroundColor: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '20px 24px' },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 },
  formGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 },
  label:        { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 },
  input:        { width: '100%', padding: '8px 10px', backgroundColor: '#0f1117', border: '1px solid #2d3148', borderRadius: 6, color: '#e2e8f0', fontSize: 13 },
  toggle:       { display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 13 },
  primaryBtn:   { padding: '10px 28px', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  muted:        { color: '#475569', fontSize: 13 },
  errText:      { color: '#f87171', fontSize: 13 },
};