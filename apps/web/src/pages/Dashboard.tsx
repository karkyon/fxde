/**
 * apps/web/src/pages/Dashboard.tsx
 *
 * 修正内容:
 *   - Signal / Trade 独自型を削除 → TradeDto (@fxde/types), SignalResponse (../lib/api) に変更
 *   - useLatestSignals() は ApiPaginatedResponse<SignalResponse> を返すため .data.map() に修正
 *   - snapshot.data は SnapshotResponse 型（queryFn 修正後に正しく推論される）
 */

import { useLatestSnapshot } from '../hooks/useSnapshot';
import { useTrades }         from '../hooks/useTrades';
import { useLatestSignals }  from '../hooks/useSignals';
import type { TradeDto } from '@fxde/types';
import type { SignalResponse } from '@fxde/types';
import AiSummaryBox from '../components/dashboard/AiSummaryBox';

export default function DashboardPage() {
  const snapshot = useLatestSnapshot();
  const trades   = useTrades({ limit: 5, status: 'OPEN' });
  const signals  = useLatestSignals();

  return (
    <div>
      <h1 style={styles.pageTitle}>Dashboard</h1>

      <div style={styles.grid3}>
        {/* ── Snapshot ── */}
        <section style={styles.card} data-testid="score-ring">
          <h2 style={styles.cardTitle}>📊 Latest Snapshot</h2>
          {snapshot.isLoading && <Loader />}
          {snapshot.error && <ErrMsg msg="Snapshot 取得エラー" />}
          {snapshot.data && (
            <dl style={styles.dl}>
              <Stat
                label="Total Score"
                value={String(snapshot.data.scoreTotal)}
                color={snapshot.data.scoreTotal >= 75 ? '#34d399' : '#f87171'}
              />
              <Stat label="Entry State" value={snapshot.data.entryState} />
              <Stat label="Symbol"      value={snapshot.data.symbol} />
              <Stat label="Timeframe"   value={snapshot.data.timeframe} />
              <Stat
                label="Captured"
                value={new Date(snapshot.data.capturedAt).toLocaleString('ja-JP')}
              />
            </dl>
          )}
          {!snapshot.data && !snapshot.isLoading && !snapshot.error && (
            <p style={styles.muted}>スナップショットなし</p>
          )}
        </section>

        {/* ── Recent Open Trades ── */}
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
          {signals.data?.data.length === 0 && (
            <p style={styles.muted}>シグナルなし</p>
          )}
          <ul style={styles.list}>
            {signals.data?.data.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </ul>
        </section>
      </div>
      {/* ── AI Summary ── */}
      {snapshot.data && (
        <div style={{ marginTop: 16 }}>
          <AiSummaryBox
            symbol={snapshot.data.symbol}
            timeframe={snapshot.data.timeframe}
          />
        </div>
      )}
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
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: color ?? '#e2e8f0' }}>{value}</span>
    </div>
  );
}

function TradeRow({ trade }: { trade: TradeDto }) {
  const pnlNum = trade.pnl != null ? Number(trade.pnl) : null;
  return (
    <li style={styles.listItem}>
      <span style={{ fontWeight: 700 }}>{trade.symbol}</span>
      <span
        style={{
          color: trade.side === 'BUY' ? '#34d399' : '#f87171',
          fontWeight: 700,
          marginLeft: 8,
        }}
      >
        {trade.side}
      </span>
      {pnlNum != null && (
        <span
          style={{
            marginLeft: 'auto',
            color: pnlNum >= 0 ? '#34d399' : '#f87171',
            fontWeight: 600,
          }}
        >
          {pnlNum >= 0 ? '+' : ''}
          {pnlNum.toFixed(2)}
        </span>
      )}
    </li>
  );
}

function SignalRow({ signal }: { signal: SignalResponse }) {
  return (
    <li style={styles.listItem}>
      <span style={{ color: '#60a5fa', fontWeight: 600 }}>{signal.type}</span>
      <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>
        {new Date(signal.triggeredAt).toLocaleString('ja-JP')}
      </span>
      {signal.acknowledgedAt == null && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#fbbf24',
            border: '1px solid #78350f',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          未確認
        </span>
      )}
    </li>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  pageTitle: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 20,
  },
  card: {
    backgroundColor: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: 10,
    padding: '24px 28px',
  },
  cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#94a3b8' },
  dl:   { display: 'flex', flexDirection: 'column', gap: 8 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 13,
    padding: '6px 0',
    borderBottom: '1px solid #1e2540',
  },
  statRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1e2540' },
  statLabel: { fontSize: 13, color: '#64748b' },
  statValue: { fontSize: 13, fontWeight: 600 },
  muted: { color: '#475569', fontSize: 13 },
};