import { useLatestSnapshot, useTrades, useLatestSignals } from '../hooks/queries';
import type { Signal, Trade } from '../types';

export default function DashboardPage() {
  const snapshot = useLatestSnapshot();
  const trades = useTrades({ limit: 5, status: 'OPEN' });
  const signals = useLatestSignals();

  return (
    <div>
      <h1 style={styles.pageTitle}>Dashboard</h1>

      <div style={styles.grid3}>
        {/* ── Snapshot ── */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>📊 Latest Snapshot</h2>
          {snapshot.isLoading && <Loader />}
          {snapshot.error && <ErrMsg msg="Snapshot 取得エラー" />}
          {snapshot.data && (
            <dl style={styles.dl}>
              <Stat label="Total P&L" value={fmtPnl(snapshot.data.totalPnl)} color={pnlColor(snapshot.data.totalPnl)} />
              <Stat label="Win Rate" value={`${(snapshot.data.winRate * 100).toFixed(1)}%`} />
              <Stat label="Trades" value={String(snapshot.data.tradeCount)} />
              <Stat label="Open" value={String(snapshot.data.openTradeCount)} />
              <Stat label="Avg R:R" value={snapshot.data.avgRr != null ? snapshot.data.avgRr.toFixed(2) : '—'} />
            </dl>
          )}
          {!snapshot.data && !snapshot.isLoading && !snapshot.error && (
            <p style={styles.muted}>スナップショットなし</p>
          )}
        </section>

        {/* ── Recent Trades ── */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>💹 Open Trades</h2>
          {trades.isLoading && <Loader />}
          {trades.error && <ErrMsg msg="Trades 取得エラー" />}
          {trades.data?.data.length === 0 && (
            <p style={styles.muted}>オープントレードなし</p>
          )}
          <ul style={styles.list}>
            {trades.data?.data.map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
          </ul>
        </section>

        {/* ── Latest Signals ── */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>📡 Latest Signals</h2>
          {signals.isLoading && <Loader />}
          {signals.error && <ErrMsg msg="Signals 取得エラー" />}
          {signals.data?.length === 0 && (
            <p style={styles.muted}>シグナルなし</p>
          )}
          <ul style={styles.list}>
            {signals.data?.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ─── Sub Components ───────────────────────────────────────────────────────────
function Loader() {
  return <p style={{ color: '#64748b', fontSize: 13 }}>Loading...</p>;
}

function ErrMsg({ msg }: { msg: string }) {
  return <p style={{ color: '#f87171', fontSize: 13 }}>{msg}</p>;
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={styles.statRow}>
      <dt style={styles.statLabel}>{label}</dt>
      <dd style={{ ...styles.statValue, color: color ?? '#e2e8f0' }}>{value}</dd>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  return (
    <li style={styles.listItem}>
      <span style={{ fontWeight: 600, color: '#60a5fa' }}>{trade.symbol}</span>
      <span
        style={{
          fontSize: 12,
          color: trade.direction === 'LONG' ? '#34d399' : '#f87171',
        }}
      >
        {trade.direction}
      </span>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>
        @ {trade.entryPrice}
      </span>
    </li>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const stateColor: Record<string, string> = {
    ENTRY_OK: '#34d399',
    SCORE_LOW: '#fbbf24',
    RISK_NG: '#f87171',
    LOCKED: '#94a3b8',
    COOLDOWN: '#a78bfa',
  };
  return (
    <li style={styles.listItem}>
      <span style={{ fontWeight: 600, color: '#60a5fa' }}>{signal.symbol}</span>
      <span
        style={{
          fontSize: 12,
          color: stateColor[signal.entryState] ?? '#e2e8f0',
          fontWeight: 600,
        }}
      >
        {signal.entryState}
      </span>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>
        Score: {signal.score}
      </span>
    </li>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtPnl(v: number) {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}
function pnlColor(v: number) {
  return v >= 0 ? '#34d399' : '#f87171';
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 24,
    color: '#f1f5f9',
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
  },
  card: {
    backgroundColor: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: 10,
    padding: '20px 24px',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 16,
    color: '#94a3b8',
    letterSpacing: '0.3px',
  },
  dl: { display: 'flex', flexDirection: 'column', gap: 10 },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: { fontSize: 13, color: '#64748b' },
  statValue: { fontSize: 15, fontWeight: 700 },
  list: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 },
  listItem: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #1e2540',
  },
  muted: { color: '#475569', fontSize: 13 },
};