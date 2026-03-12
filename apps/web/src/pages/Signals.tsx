// apps/web/src/pages/Signals.tsx
//
// 変更内容:
//   [Task4] SignalCard に以下の表示を追加（SignalResponse 型に存在するフィールド）
//           - signal.symbol      ← 未表示だったため追加
//           - signal.timeframe   ← 未表示だったため追加
//           - signal.snapshot.scoreTotal  ← 未表示だったため追加（スコア帯カラー付き）
//           - signal.snapshot.entryState  ← 未表示だったため追加
//
import { useState } from 'react';
import { useSignals } from '../hooks/useSignals';
import type { SignalResponse } from '@fxde/types';

// Signal type ごとの配色
const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  ENTRY_OK:         { bg: 'rgba(52,211,153,0.12)', text: '#34d399' },
  SCORE_LOW:        { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24' },
  RISK_NG:          { bg: 'rgba(248,113,113,0.12)', text: '#f87171' },
  LOCKED:           { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8' },
  COOLDOWN:         { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa' },
  PATTERN_DETECTED: { bg: 'rgba(96,165,250,0.12)',  text: '#60a5fa' },
};

// EntryState ごとの配色
const ENTRY_STATE_COLOR: Record<string, string> = {
  OK:         '#34d399',
  SCORE_LOW:  '#fbbf24',
  RISK_NG:    '#f87171',
  LOCKED:     '#94a3b8',
  COOLDOWN:   '#a78bfa',
};

// scoreTotal → カラー
function scoreColor(score: number): string {
  if (score >= 75) return '#34d399'; // high
  if (score >= 50) return '#fbbf24'; // mid
  return '#f87171';                  // low
}

export default function SignalsPage() {
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data, isLoading, error } = useSignals({ page, limit: LIMIT });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div>
      <h1 style={styles.title}>Signals</h1>

      {isLoading && <p style={styles.muted}>Loading...</p>}
      {error    && <p style={styles.errText}>Signals 取得エラー</p>}

      {data && data.data.length === 0 && (
        <p style={styles.muted}>シグナルがありません。</p>
      )}

      {data && data.data.length > 0 && (
        <>
          <div style={styles.list}>
            {data.data.map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>

          <div style={styles.pagination}>
            <button
              style={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ‹ Prev
            </button>
            <span style={styles.pageInfo}>
              {page} / {totalPages} ({data.total} 件)
            </span>
            <button
              style={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next ›
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: SignalResponse }) {
  const colors = TYPE_COLOR[signal.type] ?? { bg: '#1e293b', text: '#94a3b8' };

  return (
    <div style={{ ...styles.card, borderLeft: `3px solid ${colors.text}` }}>

      {/* ── Row 1: type badge / symbol / timeframe / 未確認 / 日時 ── */}
      <div style={styles.cardHeader}>
        <span style={{ ...styles.typeBadge, backgroundColor: colors.bg, color: colors.text }}>
          {signal.type}
        </span>
        <span style={styles.symbolBadge}>{signal.symbol}</span>
        <span style={styles.timeframeBadge}>{signal.timeframe}</span>
        {signal.acknowledgedAt == null && (
          <span style={styles.unackBadge}>未確認</span>
        )}
        <span style={styles.time}>
          {new Date(signal.triggeredAt).toLocaleString('ja-JP')}
        </span>
      </div>

      {/* ── Row 2: snapshot.scoreTotal / snapshot.entryState / 確認日時 ── */}
      <div style={styles.cardBody}>
        <span style={styles.metaItem}>
          Score:{' '}
          <strong style={{ color: scoreColor(signal.snapshot.scoreTotal) }}>
            {signal.snapshot.scoreTotal}
          </strong>
        </span>
        <span style={styles.metaItem}>
          State:{' '}
          <strong style={{ color: ENTRY_STATE_COLOR[signal.snapshot.entryState] ?? '#94a3b8' }}>
            {signal.snapshot.entryState}
          </strong>
        </span>
        {signal.acknowledgedAt && (
          <span style={styles.metaItem}>
            確認: {new Date(signal.acknowledgedAt).toLocaleString('ja-JP')}
          </span>
        )}
      </div>

    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  title:         { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' },
  list:          { display: 'flex', flexDirection: 'column', gap: 10 },
  card:          { backgroundColor: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '14px 18px' },
  cardHeader:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  cardBody:      { display: 'flex', gap: 16, flexWrap: 'wrap' },
  typeBadge:     { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: 0.5 },
  symbolBadge:   { fontSize: 12, fontWeight: 700, color: '#60a5fa', padding: '2px 8px', backgroundColor: 'rgba(96,165,250,0.1)', borderRadius: 4 },
  timeframeBadge:{ fontSize: 11, color: '#94a3b8', padding: '2px 6px', border: '1px solid #334155', borderRadius: 4 },
  unackBadge:    { fontSize: 11, color: '#fbbf24', border: '1px solid #78350f', borderRadius: 4, padding: '2px 8px' },
  time:          { fontSize: 12, color: '#64748b', marginLeft: 'auto' },
  metaItem:      { fontSize: 12, color: '#475569' },
  pagination:    { display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn:       { padding: '6px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  pageInfo:      { color: '#64748b', fontSize: 13 },
  muted:         { color: '#475569', fontSize: 13 },
  errText:       { color: '#f87171', fontSize: 13 },
};