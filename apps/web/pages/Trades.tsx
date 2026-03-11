import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useTrades,
  useCreateTrade,
  useCloseTrade,
  useDeleteTrade,
  useUpdateTrade,
} from '../hooks/queries';
import type { Trade } from '../types';

const PAGE_LIMIT = 10;

export default function TradesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error } = useTrades({
    page,
    limit: PAGE_LIMIT,
    status: statusFilter || undefined,
  });

  const createTrade = useCreateTrade();
  const deleteTrade = useDeleteTrade();

  // ── Create form state ─────────────────────────────────────────────────────
  const emptyForm = {
    symbol: 'USDJPY',
    direction: 'LONG' as 'LONG' | 'SHORT',
    entryPrice: '',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    notes: '',
    strategyTag: '',
  };
  const [form, setForm] = useState(emptyForm);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createTrade.mutateAsync({
      symbol: form.symbol,
      direction: form.direction,
      entryPrice: Number(form.entryPrice),
      lotSize: Number(form.lotSize),
      stopLoss: form.stopLoss ? Number(form.stopLoss) : undefined,
      takeProfit: form.takeProfit ? Number(form.takeProfit) : undefined,
      notes: form.notes || undefined,
      strategyTag: form.strategyTag || undefined,
    });
    setShowCreate(false);
    setForm(emptyForm);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_LIMIT) : 1;

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
          <option value="CANCELLED">CANCELLED</option>
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
            <Field label="Direction">
              <select
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as 'LONG' | 'SHORT' })}
                style={styles.input}
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
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
            <Field label="Lot Size *">
              <input
                type="number" step="any" required
                value={form.lotSize}
                onChange={(e) => setForm({ ...form, lotSize: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Stop Loss">
              <input
                type="number" step="any"
                value={form.stopLoss}
                onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Take Profit">
              <input
                type="number" step="any"
                value={form.takeProfit}
                onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
                style={styles.input}
              />
            </Field>
            <Field label="Strategy Tag">
              <input
                type="text"
                value={form.strategyTag}
                onChange={(e) => setForm({ ...form, strategyTag: e.target.value })}
                placeholder="e.g. breakout, trend"
                style={styles.input}
              />
            </Field>
            <div />
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  style={{ ...styles.input, width: '100%', resize: 'vertical' }}
                />
              </Field>
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" style={styles.secondaryBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={createTrade.isPending}>
                {createTrade.isPending ? 'Saving...' : 'Create'}
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {/* ── Table ── */}
      {isLoading && <p style={styles.muted}>Loading...</p>}
      {error && <p style={styles.errText}>Trades 取得エラー</p>}
      {data && data.data.length === 0 && (
        <p style={styles.muted}>トレードがありません。</p>
      )}

      {data && data.data.length > 0 && (
        <>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Symbol', 'Dir', 'Status', 'Entry', 'Exit', 'Lot', 'SL', 'TP', 'P&L', 'Opened', 'Strategy', 'Actions'].map((h) => (
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

          {/* ── Pagination ── */}
          <div style={styles.pagination}>
            <button
              style={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ‹ Prev
            </button>
            <span style={styles.pageInfo}>
              {page} / {totalPages} &nbsp;({data.total} trades)
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

// ─── TradeRow ─────────────────────────────────────────────────────────────────
function TradeRow({
  trade,
  onDetail,
  onDelete,
}: {
  trade: Trade;
  onDetail: () => void;
  onDelete: () => void;
}) {
  const [showClose, setShowClose] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const closeTrade = useCloseTrade(trade.id);
  const updateTrade = useUpdateTrade(trade.id);

  const [exitPrice, setExitPrice] = useState('');
  const [editForm, setEditForm] = useState({
    stopLoss: trade.stopLoss != null ? String(trade.stopLoss) : '',
    takeProfit: trade.takeProfit != null ? String(trade.takeProfit) : '',
    strategyTag: trade.strategyTag ?? '',
    notes: trade.notes ?? '',
  });

  const handleClose = async (e: FormEvent) => {
    e.preventDefault();
    await closeTrade.mutateAsync({ exitPrice: Number(exitPrice) });
    setShowClose(false);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    await updateTrade.mutateAsync({
      stopLoss: editForm.stopLoss ? Number(editForm.stopLoss) : undefined,
      takeProfit: editForm.takeProfit ? Number(editForm.takeProfit) : undefined,
      strategyTag: editForm.strategyTag || undefined,
      notes: editForm.notes || undefined,
    });
    setShowEdit(false);
  };

  return (
    <>
      <tr style={styles.tr}>
        {/* Symbol */}
        <td style={styles.td}>
          <button style={styles.linkBtn} onClick={onDetail}>{trade.symbol}</button>
        </td>
        {/* Direction */}
        <td style={{ ...styles.td, color: trade.direction === 'LONG' ? '#34d399' : '#f87171', fontWeight: 700 }}>
          {trade.direction}
        </td>
        {/* Status */}
        <td style={styles.td}><StatusBadge status={trade.status} /></td>
        {/* Entry */}
        <td style={styles.td}>{trade.entryPrice}</td>
        {/* Exit */}
        <td style={{ ...styles.td, color: '#94a3b8' }}>{trade.exitPrice ?? '—'}</td>
        {/* Lot */}
        <td style={styles.td}>{trade.lotSize}</td>
        {/* SL */}
        <td style={{ ...styles.td, color: '#f87171', fontSize: 12 }}>{trade.stopLoss ?? '—'}</td>
        {/* TP */}
        <td style={{ ...styles.td, color: '#34d399', fontSize: 12 }}>{trade.takeProfit ?? '—'}</td>
        {/* PnL */}
        <td style={{
          ...styles.td,
          color: (trade.pnl ?? 0) >= 0 ? '#34d399' : '#f87171',
          fontWeight: 700,
        }}>
          {trade.pnl != null ? (trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(2) : '—'}
        </td>
        {/* Opened */}
        <td style={{ ...styles.td, color: '#64748b', fontSize: 12 }}>
          {new Date(trade.openedAt).toLocaleDateString('ja-JP')}
        </td>
        {/* Strategy */}
        <td style={{ ...styles.td, fontSize: 12, color: '#a78bfa' }}>
          {trade.strategyTag ?? '—'}
        </td>
        {/* Actions */}
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

      {/* ── Inline Edit Form ── */}
      {showEdit && (
        <tr>
          <td colSpan={12} style={styles.inlineRow}>
            <form onSubmit={handleEdit} style={styles.inlineForm}>
              <span style={styles.inlineLabel}>SL:</span>
              <input
                type="number" step="any"
                value={editForm.stopLoss}
                onChange={(e) => setEditForm({ ...editForm, stopLoss: e.target.value })}
                style={{ ...styles.smallInput, width: 90 }}
                placeholder="Stop Loss"
              />
              <span style={styles.inlineLabel}>TP:</span>
              <input
                type="number" step="any"
                value={editForm.takeProfit}
                onChange={(e) => setEditForm({ ...editForm, takeProfit: e.target.value })}
                style={{ ...styles.smallInput, width: 90 }}
                placeholder="Take Profit"
              />
              <span style={styles.inlineLabel}>Tag:</span>
              <input
                type="text"
                value={editForm.strategyTag}
                onChange={(e) => setEditForm({ ...editForm, strategyTag: e.target.value })}
                style={{ ...styles.smallInput, width: 110 }}
                placeholder="Strategy"
              />
              <span style={styles.inlineLabel}>Notes:</span>
              <input
                type="text"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                style={{ ...styles.smallInput, width: 160 }}
                placeholder="Notes"
              />
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

      {/* ── Inline Close Form ── */}
      {showClose && (
        <tr>
          <td colSpan={12} style={styles.inlineRow}>
            <form onSubmit={handleClose} style={styles.inlineForm}>
              <span style={styles.inlineLabel}>Exit Price:</span>
              <input
                type="number" step="any" required
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                style={{ ...styles.smallInput, width: 130 }}
                placeholder="0.000"
              />
              <button type="submit" style={{ ...styles.primaryBtn, backgroundColor: '#d97706' }} disabled={closeTrade.isPending}>
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

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const bg: Record<string, string> = { OPEN: '#065f46', CLOSED: '#1e3a5f', CANCELLED: '#3d2a00' };
  const fg: Record<string, string> = { OPEN: '#34d399', CLOSED: '#60a5fa', CANCELLED: '#fbbf24' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      backgroundColor: bg[status] ?? '#1e293b',
      color: fg[status] ?? '#94a3b8',
    }}>
      {status}
    </span>
  );
}

// ─── Modal Overlay ────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={styles.modal}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SYMBOLS = [
  'USDJPY', 'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY',
  'XAUUSD', 'XAGUSD', 'US30', 'NAS100',
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9' },
  filters: { marginBottom: 16, display: 'flex', gap: 12 },
  tableWrapper: { overflowX: 'auto', borderRadius: 8, border: '1px solid #2d3148' },
  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#1a1d27', whiteSpace: 'nowrap' },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700, backgroundColor: '#141722', borderBottom: '1px solid #2d3148' },
  tr: { borderBottom: '1px solid #1e2540' },
  td: { padding: '9px 12px', fontSize: 13, color: '#e2e8f0' },
  inlineRow: { backgroundColor: '#181c2a', padding: '10px 16px' },
  inlineForm: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  inlineLabel: { fontSize: 12, color: '#64748b', fontWeight: 600 },
  smallInput: { padding: '6px 10px', borderRadius: 5, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 12 },
  pagination: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, justifyContent: 'center' },
  pageBtn: { padding: '6px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  pageInfo: { fontSize: 13, color: '#64748b' },
  primaryBtn: { padding: '8px 18px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  secondaryBtn: { padding: '8px 14px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  actionBtn: { padding: '4px 9px', fontSize: 11, backgroundColor: '#1e2d3d', color: '#60a5fa', border: '1px solid #1e3a5f', borderRadius: 4, cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', color: '#60a5fa', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' },
  muted: { color: '#475569', fontSize: 13 },
  errText: { color: '#f87171', fontSize: 13 },
  input: { padding: '7px 11px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13, width: '100%' },
  select: { padding: '7px 11px', borderRadius: 6, border: '1px solid #334155', backgroundColor: '#0f1117', color: '#e2e8f0', fontSize: 13 },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { backgroundColor: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '32px 36px', width: 520, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
};