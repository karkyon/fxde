/**
 * apps/web/src/pages/TradeDetail.tsx
 *
 * 修正内容（監査レポート A-1 対応）:
 *   direction → side  (BUY/SELL)
 *   lotSize   → size
 *   stopLoss  → sl
 *   takeProfit→ tp
 *   openedAt  → entryTime
 *   closedAt  → exitTime
 *   notes     → note
 *   strategyTag→ tags (string[])
 *   pnl       → Number(trade.pnl) でキャスト（Decimal→number）
 *   review フィールド: emotionScore/disciplineScore/notes 廃止
 *     → scoreAtEntry / disciplined / psychology.selfNote に変更
 */

import { useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useTrade,
  useTradeReview,
  useUpdateTrade,
  useCreateReview,
} from '../hooks/useTrades';
import type { TradeReviewResponse } from '../lib/api';

// EntryState の選択肢（CreateTradeReviewInput.ruleChecks.entryState）
const ENTRY_STATES = ['ENTRY_OK', 'SCORE_LOW', 'RISK_NG', 'LOCKED', 'COOLDOWN'] as const;

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: trade, isLoading, error } = useTrade(id!);
  const { data: review } = useTradeReview(id!);
  const updateTrade  = useUpdateTrade(id!);
  const createReview = useCreateReview(id!);

  // Edit note
  const [editMode, setEditMode] = useState(false);
  const [note, setNote] = useState('');

  // Review form — CreateTradeReviewInput の正本フィールド
  const [reviewForm, setReviewForm] = useState({
    scoreAtEntry: 75,
    disciplined:  true,
    // ruleChecks の最小フィールド
    scoreOk:    true,
    riskOk:     true,
    eventLock:  false,
    cooldown:   false,
    entryState: 'ENTRY_OK' as typeof ENTRY_STATES[number],
    // psychology
    emotion:  '',
    selfNote: '',
  });
  const [showReviewForm, setShowReviewForm] = useState(false);

  const handleUpdateNote = async (e: FormEvent) => {
    e.preventDefault();
    await updateTrade.mutateAsync({ note });
    setEditMode(false);
  };

  const handleCreateReview = async (e: FormEvent) => {
    e.preventDefault();
    await createReview.mutateAsync({
      scoreAtEntry: reviewForm.scoreAtEntry,
      disciplined:  reviewForm.disciplined,
      ruleChecks: {
        scoreOk:    reviewForm.scoreOk,
        riskOk:     reviewForm.riskOk,
        eventLock:  reviewForm.eventLock,
        cooldown:   reviewForm.cooldown,
        patterns:   [],
        entryState: reviewForm.entryState,
      },
      psychology: {
        emotion:      reviewForm.emotion   || undefined,
        selfNote:     reviewForm.selfNote  || undefined,
        biasDetected: [],
      },
    });
    setShowReviewForm(false);
  };

  if (isLoading)       return <p style={styles.muted}>Loading...</p>;
  if (error || !trade) return <p style={styles.err}>Trade が見つかりません。</p>;

  const pnlNum = trade.pnl != null ? Number(trade.pnl) : null;

  return (
    <div>
      <button style={styles.backBtn} onClick={() => navigate('/trades')}>
        ← Trades
      </button>

      <h1 style={styles.title}>
        {trade.symbol}{' '}
        <span style={{ color: trade.side === 'BUY' ? '#34d399' : '#f87171' }}>
          {trade.side}
        </span>
      </h1>

      <div style={styles.grid2}>
        {/* ── Trade Info ── */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Trade Info</h2>
          <dl style={styles.dl}>
            <Row label="Status"      value={trade.status} />
            <Row label="Entry Price" value={String(trade.entryPrice)} />
            <Row label="Exit Price"  value={trade.exitPrice != null ? String(trade.exitPrice) : '—'} />
            <Row label="Size (lots)" value={String(trade.size)} />
            <Row label="Stop Loss"   value={trade.sl != null ? String(trade.sl) : '—'} />
            <Row label="Take Profit" value={trade.tp != null ? String(trade.tp) : '—'} />
            <Row
              label="P&L"
              value={pnlNum != null ? (pnlNum >= 0 ? '+' : '') + pnlNum.toFixed(2) : '—'}
              color={pnlNum != null ? (pnlNum >= 0 ? '#34d399' : '#f87171') : undefined}
            />
            <Row label="Tags"   value={trade.tags.length > 0 ? trade.tags.join(', ') : '—'} />
            <Row label="Opened" value={new Date(trade.entryTime).toLocaleString('ja-JP')} />
            {trade.exitTime && (
              <Row label="Closed" value={new Date(trade.exitTime).toLocaleString('ja-JP')} />
            )}
          </dl>

          {/* Note edit */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={styles.cardSubtitle}>Note</span>
              {!editMode && (
                <button
                  style={styles.smallBtn}
                  onClick={() => { setNote(trade.note ?? ''); setEditMode(true); }}
                >
                  Edit
                </button>
              )}
            </div>
            {editMode ? (
              <form onSubmit={handleUpdateNote} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  style={styles.textarea}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" style={styles.primaryBtn} disabled={updateTrade.isPending}>Save</button>
                  <button type="button" style={styles.secondaryBtn} onClick={() => setEditMode(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <p style={styles.notesText}>{trade.note || <em style={{ color: '#475569' }}>なし</em>}</p>
            )}
          </div>
        </section>

        {/* ── Trade Review ── */}
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
            <ReviewDetail review={review} />
          ) : showReviewForm ? (
            <form onSubmit={handleCreateReview} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Score at Entry */}
              <div>
                <label style={styles.fieldLabel}>
                  Score at Entry (0–100): <strong style={{ color: '#60a5fa' }}>{reviewForm.scoreAtEntry}</strong>
                </label>
                <input
                  type="range" min={0} max={100}
                  value={reviewForm.scoreAtEntry}
                  onChange={(e) => setReviewForm({ ...reviewForm, scoreAtEntry: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#2563eb', marginTop: 6 }}
                />
              </div>

              {/* Disciplined */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={reviewForm.disciplined}
                  onChange={(e) => setReviewForm({ ...reviewForm, disciplined: e.target.checked })}
                />
                <span style={{ color: reviewForm.disciplined ? '#34d399' : '#f87171' }}>
                  {reviewForm.disciplined ? '✅ ルール遵守でエントリー' : '❌ ルール違反エントリー'}
                </span>
              </label>

              {/* Entry State */}
              <div>
                <label style={styles.fieldLabel}>Entry State</label>
                <select
                  value={reviewForm.entryState}
                  onChange={(e) => setReviewForm({ ...reviewForm, entryState: e.target.value as typeof ENTRY_STATES[number] })}
                  style={styles.selectInput}
                >
                  {ENTRY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Rule Checks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                  ['scoreOk',   'Score OK'],
                  ['riskOk',    'Risk OK'],
                  ['eventLock', 'Event Lock'],
                  ['cooldown',  'Cooldown'],
                ] as [keyof typeof reviewForm, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={reviewForm[key] as boolean}
                      onChange={(e) => setReviewForm({ ...reviewForm, [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Emotion */}
              <div>
                <label style={styles.fieldLabel}>Emotion (感情)</label>
                <input
                  type="text"
                  placeholder="例: 冷静、焦り、リベンジ"
                  value={reviewForm.emotion}
                  onChange={(e) => setReviewForm({ ...reviewForm, emotion: e.target.value })}
                  style={styles.selectInput}
                />
              </div>

              {/* Self Note */}
              <div>
                <label style={styles.fieldLabel}>Self Note (振り返りメモ)</label>
                <textarea
                  value={reviewForm.selfNote}
                  onChange={(e) => setReviewForm({ ...reviewForm, selfNote: e.target.value })}
                  rows={3}
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

// ─── ReviewDetail ─────────────────────────────────────────────────────────────
function ReviewDetail({ review }: { review: TradeReviewResponse }) {
  const psych = (review.psychology as Record<string, string | string[]> | null) ?? {};
  return (
    <dl style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Row label="Score at Entry" value={String(review.scoreAtEntry)} />
      <Row
        label="Disciplined"
        value={review.disciplined ? '✅ 遵守' : '❌ 違反'}
        color={review.disciplined ? '#34d399' : '#f87171'}
      />
      {psych.emotion && (
        <Row label="Emotion" value={String(psych.emotion)} />
      )}
      {psych.selfNote && (
        <div>
          <dt style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Self Note</dt>
          <dd style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{String(psych.selfNote)}</dd>
        </div>
      )}
      <Row label="Created" value={new Date(review.createdAt).toLocaleDateString('ja-JP')} />
    </dl>
  );
}

// ─── Sub components ───────────────────────────────────────────────────────────
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1e2540' }}>
      <dt style={{ fontSize: 13, color: '#64748b' }}>{label}</dt>
      <dd style={{ fontSize: 13, fontWeight: 600, color: color ?? '#e2e8f0' }}>{value}</dd>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  backBtn:     { background: 'none', border: 'none', color: '#60a5fa', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 },
  title:       { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' },
  grid2:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 },
  card:        { backgroundColor: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '24px 28px' },
  cardTitle:   { fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#94a3b8' },
  cardSubtitle:{ fontSize: 13, color: '#64748b', fontWeight: 600 },
  dl:          { display: 'flex', flexDirection: 'column', gap: 10 },
  primaryBtn:  { padding: '8px 18px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  secondaryBtn:{ padding: '8px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  smallBtn:    { padding: '4px 12px', fontSize: 12, backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 5, cursor: 'pointer' },
  textarea:    { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' },
  selectInput: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13, marginTop: 4 },
  notesText:   { fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 },
  fieldLabel:  { fontSize: 13, color: '#64748b', fontWeight: 600 },
  muted:       { color: '#475569', fontSize: 13 },
  err:         { color: '#f87171', fontSize: 13 },
};