/**
 * apps/web/src/pages/Trades.tsx
 *
 * 修正内容（監査レポート A-1 対応）:
 *   Trade 独自型 → TradeDto (@fxde/types)
 *   direction → side  (BUY/SELL)
 *   LONG/SHORT → BUY/SELL
 *   lotSize → size
 *   stopLoss → sl / takeProfit → tp
 *   openedAt → entryTime / closedAt → exitTime
 *   notes → note / strategyTag → tags (string[])
 *   pnl → Number(trade.pnl) キャスト
 *   CANCELLED → CANCELED（末尾 D 1 つ）
 *   CloseTradeInput: exitTime フィールド追加
 */

import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useTrades,
  useCreateTrade,
  useCloseTrade,
  useDeleteTrade,
  useUpdateTrade,
  useStatsHourly,
  useStatsConsecutiveLoss,
  useStatsByScoreBand,
} from '../hooks/useTrades';
import type { TradeDto } from '@fxde/types';
import type { HourlyStats, ConsecutiveLossStats, ScoreBandStats } from '../lib/api';

const PAGE_LIMIT = 10;

const SYMBOLS = [
  'USDJPY', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDCHF',
  'USDCAD', 'BTCUSD', 'ETHUSD',
];

export default function TradesPage() {
  const navigate  = useNavigate();
  const [page, setPage]               = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate]   = useState(false);

  const { data, isLoading, error } = useTrades({
    page,
    limit: PAGE_LIMIT,
    status: statusFilter || undefined,
  });

  const createTrade = useCreateTrade();
  const deleteTrade = useDeleteTrade();

  // ── Create form ──────────────────────────────────────────────────────────
  const emptyForm = {
    symbol:     'USDJPY',
    side:       'BUY' as 'BUY' | 'SELL',
    entryPrice: '',
    entryTime:  new Date().toISOString().slice(0, 16), // datetime-local format
    size:       '',
    sl:         '',
    tp:         '',
    note:       '',
    tagsRaw:    '', // comma-separated → tags[]
  };
  const [form, setForm] = useState(emptyForm);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createTrade.mutateAsync({
      symbol:     form.symbol,
      side:       form.side,
      entryPrice: Number(form.entryPrice),
      entryTime:  new Date(form.entryTime).toISOString(),
      size:       Number(form.size),
      sl:         form.sl ? Number(form.sl) : undefined,
      tp:         form.tp ? Number(form.tp) : undefined,
      note:       form.note   || undefined,
      tags:       form.tagsRaw
        ? form.tagsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    });
    setShowCreate(false);
    setForm(emptyForm);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_LIMIT)) : 1;

  return (
    <div>
      {/* ── Header ── */}
      <div style={styles.header}>
        <h1 style={styles.title}>Trades</h1>
        <button style={styles.primaryBtn} onClick={() => setShowCreate(true)}>
          + New Trade
        </button>
      </div>

      {/* ── Filters ── */}
      <div style={styles.filters}>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={styles.select}
        >
          <option value="">All Status</option>
          <option value="OPEN">OPEN</option>
          <option value="CLOSED">CLOSED</option>
          <option value="CANCELED">CANCELED</option>
        </select>
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <Overlay onClose={() => setShowCreate(false)}>
          <h2 style={styles.modalTitle}>New Trade</h2>
          <form onSubmit={handleCreate} style={styles.formGrid}>
            <Field label="Symbol">
              <select
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                style={styles.input}
              >
                {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Side">
              <select
                value={form.side}
                onChange={(e) => setForm({ ...form, side: e.target.value as 'BUY' | 'SELL' })}
                style={styles.input}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </Field>
            <Field label="Entry Price *">
              <input
                type="number" step="any" required
                value={form.entryPrice}
                onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Entry Time *">
              <input
                type="datetime-local" required
                value={form.entryTime}
                onChange={(e) => setForm({ ...form, entryTime: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Size (lots) *">
              <input
                type="number" step="any" required
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Stop Loss">
              <input
                type="number" step="any"
                value={form.sl}
                onChange={(e) => setForm({ ...form, sl: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Take Profit">
              <input
                type="number" step="any"
                value={form.tp}
                onChange={(e) => setForm({ ...form, tp: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Tags (comma separated)">
              <input
                type="text"
                value={form.tagsRaw}
                onChange={(e) => setForm({ ...form, tagsRaw: e.target.value })}
                placeholder="breakout, trend"
                style={styles.input}
              />
            </Field>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Note">
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                  style={{ ...styles.input, width: '100%', resize: 'vertical' }}
                />
              </Field>
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" style={styles.secondaryBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={createTrade.isPending}>
                {createTrade.isPending ? '...' : 'Create'}
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {/* ── Table ── */}
      {isLoading && <p style={styles.muted}>Loading...</p>}
      {error     && <p style={styles.errText}>Trades 取得エラー</p>}
      {data && data.data.length === 0 && (
        <p style={styles.muted}>トレードがありません。</p>
      )}

      {data && data.data.length > 0 && (
        <>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Symbol', 'Side', 'Status', 'Entry', 'Exit', 'Size', 'SL', 'TP', 'P&L', 'Entry Time', 'Tags', 'Actions'].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((t) => (
                  <TradeRow
                    key={t.id}
                    trade={t}
                    onDetail={() => navigate(`/trades/${t.id}`)}
                    onDelete={() => {
                      if (window.confirm(`${t.symbol} を削除しますか？`)) {
                        deleteTrade.mutate(t.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
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
              {page} / {totalPages} ({data.total} trades)
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

      {/* ── Psychology Panel（SPEC Part 7 §1.4）── */}
      <PsychologyPanel />

    </div>
  );
}

// ─── TradeRow ─────────────────────────────────────────────────────────────────
function TradeRow({
  trade,
  onDetail,
  onDelete,
}: {
  trade: TradeDto;
  onDetail: () => void;
  onDelete: () => void;
}) {
  const [showClose, setShowClose] = useState(false);
  const [showEdit,  setShowEdit]  = useState(false);
  const closeTrade  = useCloseTrade(trade.id);
  const updateTrade = useUpdateTrade(trade.id);

  const [exitPrice, setExitPrice] = useState('');
  const [exitTime,  setExitTime]  = useState(new Date().toISOString().slice(0, 16));

  const [editForm, setEditForm] = useState({
    sl:      trade.sl   != null ? String(trade.sl)   : '',
    tp:      trade.tp   != null ? String(trade.tp)   : '',
    tagsRaw: trade.tags.join(', '),
    note:    trade.note ?? '',
  });

  const pnlNum = trade.pnl != null ? Number(trade.pnl) : null;

  const handleClose = async (e: FormEvent) => {
    e.preventDefault();
    await closeTrade.mutateAsync({
      exitPrice: Number(exitPrice),
      exitTime:  new Date(exitTime).toISOString(),
    });
    setShowClose(false);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    await updateTrade.mutateAsync({
      sl:   editForm.sl   ? Number(editForm.sl)   : undefined,
      tp:   editForm.tp   ? Number(editForm.tp)   : undefined,
      tags: editForm.tagsRaw
        ? editForm.tagsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      note: editForm.note || undefined,
    });
    setShowEdit(false);
  };

  return (
    <>
      <tr style={styles.tr}>
        <td style={styles.td}>
          <button style={styles.linkBtn} onClick={onDetail}>{trade.symbol}</button>
        </td>
        <td style={{ ...styles.td, color: trade.side === 'BUY' ? '#34d399' : '#f87171', fontWeight: 700 }}>
          {trade.side}
        </td>
        <td style={styles.td}><StatusBadge status={trade.status} /></td>
        <td style={styles.td}>{Number(trade.entryPrice)}</td>
        <td style={{ ...styles.td, color: '#94a3b8' }}>
          {trade.exitPrice != null ? Number(trade.exitPrice) : '—'}
        </td>
        <td style={styles.td}>{Number(trade.size)}</td>
        <td style={{ ...styles.td, color: '#f87171', fontSize: 12 }}>
          {trade.sl != null ? Number(trade.sl) : '—'}
        </td>
        <td style={{ ...styles.td, color: '#34d399', fontSize: 12 }}>
          {trade.tp != null ? Number(trade.tp) : '—'}
        </td>
        <td style={{ ...styles.td, color: pnlNum != null ? (pnlNum >= 0 ? '#34d399' : '#f87171') : '#94a3b8', fontWeight: 700 }}>
          {pnlNum != null ? (pnlNum >= 0 ? '+' : '') + pnlNum.toFixed(2) : '—'}
        </td>
        <td style={{ ...styles.td, color: '#64748b', fontSize: 12 }}>
          {new Date(trade.entryTime).toLocaleDateString('ja-JP')}
        </td>
        <td style={{ ...styles.td, fontSize: 12, color: '#a78bfa' }}>
          {trade.tags.length > 0 ? trade.tags.join(', ') : '—'}
        </td>
        <td style={styles.td}>
          <div style={{ display: 'flex', gap: 5 }}>
            <button style={styles.actionBtn} onClick={() => setShowEdit((v) => !v)}>Edit</button>
            {trade.status === 'OPEN' && (
              <button
                style={{ ...styles.actionBtn, color: '#fbbf24', borderColor: '#78350f' }}
                onClick={() => setShowClose((v) => !v)}
              >
                Close
              </button>
            )}
            <button
              style={{ ...styles.actionBtn, color: '#f87171', borderColor: '#7f1d1d' }}
              onClick={onDelete}
            >
              Del
            </button>
          </div>
        </td>
      </tr>

      {/* ── Inline Edit ── */}
      {showEdit && (
        <tr>
          <td colSpan={12} style={styles.inlineRow}>
            <form onSubmit={handleEdit} style={styles.inlineForm}>
              <span style={styles.inlineLabel}>SL:</span>
              <input type="number" step="any" value={editForm.sl}
                onChange={(e) => setEditForm({ ...editForm, sl: e.target.value })}
                style={{ ...styles.smallInput, width: 90 }} placeholder="Stop Loss" />
              <span style={styles.inlineLabel}>TP:</span>
              <input type="number" step="any" value={editForm.tp}
                onChange={(e) => setEditForm({ ...editForm, tp: e.target.value })}
                style={{ ...styles.smallInput, width: 90 }} placeholder="Take Profit" />
              <span style={styles.inlineLabel}>Tags:</span>
              <input type="text" value={editForm.tagsRaw}
                onChange={(e) => setEditForm({ ...editForm, tagsRaw: e.target.value })}
                style={{ ...styles.smallInput, width: 120 }} placeholder="tag1, tag2" />
              <span style={styles.inlineLabel}>Note:</span>
              <input type="text" value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                style={{ ...styles.smallInput, width: 160 }} placeholder="Note" />
              <button type="submit" style={styles.primaryBtn} disabled={updateTrade.isPending}>
                {updateTrade.isPending ? '...' : 'Save'}
              </button>
              <button type="button" style={styles.secondaryBtn} onClick={() => setShowEdit(false)}>
                Cancel
              </button>
            </form>
          </td>
        </tr>
      )}

      {/* ── Inline Close ── */}
      {showClose && (
        <tr>
          <td colSpan={12} style={styles.inlineRow}>
            <form onSubmit={handleClose} style={styles.inlineForm}>
              <span style={styles.inlineLabel}>Exit Price:</span>
              <input type="number" step="any" required value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                style={{ ...styles.smallInput, width: 130 }} placeholder="0.000" />
              <span style={styles.inlineLabel}>Exit Time:</span>
              <input type="datetime-local" required value={exitTime}
                onChange={(e) => setExitTime(e.target.value)}
                style={{ ...styles.smallInput, width: 180 }} />
              <button
                type="submit"
                style={{ ...styles.primaryBtn, backgroundColor: '#d97706' }}
                disabled={closeTrade.isPending}
              >
                {closeTrade.isPending ? 'Closing...' : 'Confirm Close'}
              </button>
              <button type="button" style={styles.secondaryBtn} onClick={() => setShowClose(false)}>
                Cancel
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── PsychologyPanel ─────────────────────────────────────────────────────────
// 参照: SPEC_v51_part7 §1.4 心理バイアス分析グラフ × 3

function BarChartSvg({
  data, xKey, yKey, color = '#60a5fa', yLabel = '',
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  yLabel?: string;
}) {
  if (data.length === 0) {
    return <p style={{ color: '#475569', fontSize: 12, padding: '12px 0' }}>データなし</p>;
  }
  const W = 320; const H = 120; const PAD = { t: 8, r: 8, b: 32, l: 36 };
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };
  const values = data.map((d) => Number(d[yKey] ?? 0));
  const maxV = Math.max(...values, 0.001);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;

  const barW = Math.max(4, inner.w / data.length - 4);

  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      {/* y-axis zero line */}
      {minV < 0 && (
        <line
          x1={PAD.l} x2={PAD.l + inner.w}
          y1={PAD.t + inner.h * (maxV / range)}
          y2={PAD.t + inner.h * (maxV / range)}
          stroke="#334155" strokeWidth={1}
        />
      )}
      {/* bars */}
      {data.map((d, i) => {
        const v = Number(d[yKey] ?? 0);
        const x = PAD.l + (i / data.length) * inner.w + 2;
        const barH = Math.abs(v / range) * inner.h;
        const y = v >= 0
          ? PAD.t + inner.h * (1 - v / range)
          : PAD.t + inner.h * (maxV / range);
        const c = v >= 0 ? color : '#E05252';
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill={c} opacity={0.8} rx={2} />
            <text
              x={x + barW / 2} y={H - 4}
              textAnchor="middle" fontSize={9} fill="#64748b"
            >
              {String(d[xKey] ?? '').replace('時', '').replace('-', '‑')}
            </text>
          </g>
        );
      })}
      {/* y-axis label */}
      <text x={0} y={H / 2} textAnchor="middle" fontSize={9} fill="#64748b"
        transform={`rotate(-90,8,${H / 2})`}>{yLabel}</text>
    </svg>
  );
}

function PsychologyPanel() {
  const { data: hourly = [] }       = useStatsHourly();
  const { data: consecutive = [] }  = useStatsConsecutiveLoss();
  const { data: byBand = [] }       = useStatsByScoreBand();

  return (
    <div style={{ marginTop: 32, marginBottom: 8 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>
        心理バイアス分析
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

        {/* ① 時間帯別成績 */}
        <div style={panelStyle}>
          <p style={panelTitle}>① 時間帯別 Win Rate (%)</p>
          <BarChartSvg
            data={hourly as unknown as Record<string, unknown>[]}
            xKey="hour" yKey="winRate"
            color="#2EC96A" yLabel="Win%"
          />
          <p style={panelNote}>JST 3時間帯区切り・CLOSEDトレードのみ</p>
        </div>

        {/* ② 連敗後勝率 */}
        <div style={panelStyle}>
          <p style={panelTitle}>② 連敗後 Win Rate (%)</p>
          <BarChartSvg
            data={consecutive as unknown as Record<string, unknown>[]}
            xKey="streak" yKey="winRate"
            color="#E8B830" yLabel="Win%"
          />
          <p style={panelNote}>N連敗直後のトレード勝率。5以上は同一バケツ</p>
        </div>

        {/* ③ スコア帯別平均PnL */}
        <div style={panelStyle}>
          <p style={panelTitle}>③ スコア帯別 Avg PnL</p>
          <BarChartSvg
            data={byBand as unknown as Record<string, unknown>[]}
            xKey="band" yKey="avgPnl"
            color="#60a5fa" yLabel="Avg PnL"
          />
          <p style={panelNote}>TradeReview.scoreAtEntry ベース。データ不足時は空</p>
        </div>

      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  backgroundColor: '#1a1d27',
  border: '1px solid #2d3148',
  borderRadius: 8,
  padding: '14px 16px',
};
const panelTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, marginTop: 0,
};
const panelNote: React.CSSProperties = {
  fontSize: 10, color: '#475569', marginTop: 6, marginBottom: 0,
};

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const bg: Record<string, string> = { OPEN: '#065f46', CLOSED: '#1e3a5f', CANCELED: '#3d2a00' };
  const fg: Record<string, string> = { OPEN: '#34d399', CLOSED: '#60a5fa', CANCELED: '#fbbf24' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700,
      backgroundColor: bg[status] ?? '#1e293b',
      color: fg[status] ?? '#94a3b8',
    }}>
      {status}
    </span>
  );
}

// ─── Overlay ──────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  title:       { fontSize: 22, fontWeight: 700, color: '#f1f5f9' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  filters:     { display: 'flex', gap: 10, marginBottom: 16 },
  select:      { padding: '7px 12px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13 },
  tableWrapper:{ overflowX: 'auto' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:          { textAlign: 'left', padding: '10px 12px', color: '#64748b', borderBottom: '1px solid #1e2540', fontWeight: 600, whiteSpace: 'nowrap' },
  tr:          { borderBottom: '1px solid #1e2540' },
  td:          { padding: '10px 12px', color: '#cbd5e1' },
  linkBtn:     { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: 0 },
  actionBtn:   { padding: '3px 10px', fontSize: 11, backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 5, cursor: 'pointer' },
  inlineRow:   { backgroundColor: '#10131c', padding: '12px 16px' },
  inlineForm:  { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  inlineLabel: { fontSize: 12, color: '#64748b' },
  smallInput:  { padding: '5px 8px', borderRadius: 5, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 12 },
  pagination:  { display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn:     { padding: '6px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  pageInfo:    { color: '#64748b', fontSize: 13 },
  primaryBtn:  { padding: '8px 18px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  secondaryBtn:{ padding: '8px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  overlay:     { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, zIndex: 999 },
  modal:       { backgroundColor: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '28px 32px', width: '100%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto' },
  modalTitle:  { fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#f1f5f9' },
  formGrid:    { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 },
  fieldLabel:  { display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 },
  input:       { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13 },
  muted:       { color: '#475569', fontSize: 13 },
  errText:     { color: '#f87171', fontSize: 13 },
};