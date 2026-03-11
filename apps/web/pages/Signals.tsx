import { useState } from 'react';
import { useSignals } from '../hooks/queries';
import type { EntryState, Signal } from '../types';

const PAGE_LIMIT = 20;

const STATE_COLOR: Record<EntryState, { bg: string; text: string }> = {
  ENTRY_OK: { bg: '#065f46', text: '#34d399' },
  SCORE_LOW: { bg: '#3d2e00', text: '#fbbf24' },
  RISK_NG: { bg: '#4c0519', text: '#f87171' },
  LOCKED: { bg: '#1e293b', text: '#94a3b8' },
  COOLDOWN: { bg: '#2e1065', text: '#a78bfa' },
};

export default function SignalsPage() {
  const [page, setPage] = useState(1);
  const [symbolFilter, setSymbolFilter] = useState('');

  const { data, isLoading, error } = useSignals({
    page,
    limit: PAGE_LIMIT,
    symbol: symbolFilter || undefined,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_LIMIT) : 1;

  return (
    <div>
      <h1 style={styles.title}>Signals</h1>

      {/* Filter */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <input
          placeholder="Symbol filter (e.g. USDJPY)"
          value={symbolFilter}
          onChange={(e) => { setSymbolFilter(e.target.value.toUpperCase()); setPage(1); }}
          style={{ ...styles.input, width: 200 }}
        />
        <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>
          自動更新: 60秒
        </span>
      </div>

      {isLoading && <p style={styles.muted}>Loading...</p>}
      {error && <p style={styles.errText}>Signals 取得エラー</p>}

      {data && (
        <>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Symbol', 'Entry State', 'Score Band', 'Score', 'Generated At'].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <SignalRow key={s.id} signal={s} />
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.pagination}>
            <button style={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
            <span style={styles.pageInfo}>{page} / {totalPages} ({data.total} signals)</span>
            <button style={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
          </div>
        </>
      )}
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const colors = STATE_COLOR[signal.entryState] ?? { bg: '#1e293b', text: '#94a3b8' };
  return (
    <tr style={styles.tr}>
      <td style={{ ...styles.td, fontWeight: 700, color: '#60a5fa' }}>{signal.symbol}</td>
      <td style={styles.td}>
        <span style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 700,
          backgroundColor: colors.bg,
          color: colors.text,
        }}>
          {signal.entryState}
        </span>
      </td>
      <td style={styles.td}>
        <ScoreBandBadge band={signal.scoreBand} />
      </td>
      <td style={{ ...styles.td, fontWeight: 600 }}>{signal.score}</td>
      <td style={{ ...styles.td, color: '#64748b', fontSize: 12 }}>
        {new Date(signal.generatedAt).toLocaleString('ja-JP')}
      </td>
    </tr>
  );
}

function ScoreBandBadge({ band }: { band: string }) {
  const map: Record<string, string> = { HIGH: '#34d399', MID: '#fbbf24', LOW: '#f87171' };
  return (
    <span style={{ color: map[band] ?? '#94a3b8', fontWeight: 700, fontSize: 13 }}>{band}</span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#f1f5f9' },
  tableWrapper: { overflowX: 'auto', borderRadius: 8, border: '1px solid #2d3148' },
  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#1a1d27' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 700, backgroundColor: '#141722', borderBottom: '1px solid #2d3148' },
  tr: { borderBottom: '1px solid #1e2540' },
  td: { padding: '10px 14px', fontSize: 13, color: '#e2e8f0' },
  pagination: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, justifyContent: 'center' },
  pageBtn: { padding: '6px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  pageInfo: { fontSize: 13, color: '#64748b' },
  input: { padding: '7px 11px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13 },
  muted: { color: '#475569', fontSize: 13 },
  errText: { color: '#f87171', fontSize: 13 },
};