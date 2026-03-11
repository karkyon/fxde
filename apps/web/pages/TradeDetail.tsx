import { useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useTrade,
  useTradeReview,
  useUpdateTrade,
  useCreateReview,
} from '../hooks/queries';

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: trade, isLoading, error } = useTrade(id!);
  const { data: review } = useTradeReview(id!);
  const updateTrade = useUpdateTrade(id!);
  const createReview = useCreateReview(id!);

  // Edit notes
  const [editMode, setEditMode] = useState(false);
  const [notes, setNotes] = useState('');

  // Review form
  const [reviewForm, setReviewForm] = useState({
    emotionScore: 5,
    disciplineScore: 5,
    notes: '',
  });
  const [showReviewForm, setShowReviewForm] = useState(false);

  const handleUpdateNotes = async (e: FormEvent) => {
    e.preventDefault();
    await updateTrade.mutateAsync({ notes });
    setEditMode(false);
  };

  const handleCreateReview = async (e: FormEvent) => {
    e.preventDefault();
    await createReview.mutateAsync({
      emotionScore: reviewForm.emotionScore,
      disciplineScore: reviewForm.disciplineScore,
      notes: reviewForm.notes,
    });
    setShowReviewForm(false);
  };

  if (isLoading) return <p style={styles.muted}>Loading...</p>;
  if (error || !trade) return <p style={styles.err}>Trade が見つかりません。</p>;

  return (
    <div>
      {/* Back */}
      <button style={styles.backBtn} onClick={() => navigate('/trades')}>
        ← Trades
      </button>

      <h1 style={styles.title}>
        {trade.symbol}{' '}
        <span style={{ color: trade.direction === 'LONG' ? '#34d399' : '#f87171' }}>
          {trade.direction}
        </span>
      </h1>

      <div style={styles.grid2}>
        {/* Trade Info */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Trade Info</h2>
          <dl style={styles.dl}>
            <Row label="Status" value={trade.status} />
            <Row label="Entry Price" value={String(trade.entryPrice)} />
            <Row label="Exit Price" value={trade.exitPrice != null ? String(trade.exitPrice) : '—'} />
            <Row label="Lot Size" value={String(trade.lotSize)} />
            <Row label="Stop Loss" value={trade.stopLoss != null ? String(trade.stopLoss) : '—'} />
            <Row label="Take Profit" value={trade.takeProfit != null ? String(trade.takeProfit) : '—'} />
            <Row
              label="P&L"
              value={trade.pnl != null ? (trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(2) : '—'}
              color={(trade.pnl ?? 0) >= 0 ? '#34d399' : '#f87171'}
            />
            <Row label="Strategy" value={trade.strategyTag ?? '—'} />
            <Row label="Opened" value={new Date(trade.openedAt).toLocaleString('ja-JP')} />
            {trade.closedAt && (
              <Row label="Closed" value={new Date(trade.closedAt).toLocaleString('ja-JP')} />
            )}
          </dl>

          {/* Notes edit */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={styles.cardSubtitle}>Notes</span>
              {!editMode && (
                <button style={styles.smallBtn} onClick={() => { setNotes(trade.notes ?? ''); setEditMode(true); }}>
                  Edit
                </button>
              )}
            </div>
            {editMode ? (
              <form onSubmit={handleUpdateNotes} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  style={styles.textarea}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" style={styles.primaryBtn} disabled={updateTrade.isPending}>Save</button>
                  <button type="button" style={styles.secondaryBtn} onClick={() => setEditMode(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <p style={styles.notesText}>{trade.notes || <em style={{ color: '#475569' }}>なし</em>}</p>
            )}
          </div>
        </section>

        {/* Review */}
        <section style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={styles.cardTitle}>Trade Review</h2>
            {!review && !showReviewForm && (
              <button style={styles.primaryBtn} onClick={() => setShowReviewForm(true)}>
                + Add Review
              </button>
            )}
          </div>

          {review ? (
            <dl style={styles.dl}>
              <Row label="Emotion Score" value={`${review.emotionScore} / 10`} />
              <Row label="Discipline Score" value={`${review.disciplineScore} / 10`} />
              <div style={{ marginTop: 12 }}>
                <span style={styles.cardSubtitle}>Review Notes</span>
                <p style={{ ...styles.notesText, marginTop: 6 }}>{review.notes}</p>
              </div>
              <Row label="Created" value={new Date(review.createdAt).toLocaleDateString('ja-JP')} />
            </dl>
          ) : showReviewForm ? (
            <form onSubmit={handleCreateReview} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ScoreField
                label="Emotion Score (1-10)"
                value={reviewForm.emotionScore}
                onChange={(v) => setReviewForm({ ...reviewForm, emotionScore: v })}
              />
              <ScoreField
                label="Discipline Score (1-10)"
                value={reviewForm.disciplineScore}
                onChange={(v) => setReviewForm({ ...reviewForm, disciplineScore: v })}
              />
              <div>
                <label style={styles.fieldLabel}>Notes</label>
                <textarea
                  required
                  value={reviewForm.notes}
                  onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })}
                  rows={4}
                  style={styles.textarea}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={styles.primaryBtn} disabled={createReview.isPending}>
                  {createReview.isPending ? 'Saving...' : 'Save Review'}
                </button>
                <button type="button" style={styles.secondaryBtn} onClick={() => setShowReviewForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <p style={styles.muted}>レビュー未作成</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Sub components ───────────────────────────────────────────────────────────
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.row}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={{ ...styles.dd, color: color ?? '#e2e8f0' }}>{value}</dd>
    </div>
  );
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label style={styles.fieldLabel}>{label}: <strong style={{ color: '#60a5fa' }}>{value}</strong></label>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', marginTop: 6, accentColor: '#2563eb' }}
      />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 },
  card: { backgroundColor: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '24px 28px' },
  cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#94a3b8' },
  cardSubtitle: { fontSize: 13, color: '#64748b', fontWeight: 600 },
  dl: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1e2540' },
  dt: { fontSize: 13, color: '#64748b' },
  dd: { fontSize: 13, fontWeight: 600 },
  primaryBtn: { padding: '8px 18px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  secondaryBtn: { padding: '8px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  smallBtn: { padding: '4px 12px', fontSize: 12, backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 5, cursor: 'pointer' },
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' },
  notesText: { fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 },
  fieldLabel: { fontSize: 13, color: '#64748b', fontWeight: 600 },
  muted: { color: '#475569', fontSize: 13 },
  err: { color: '#f87171', fontSize: 13 },
};