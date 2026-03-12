/**
 * apps/web/src/pages/Prediction.tsx  — PG-04 MTF 予測
 *
 * 変更内容:
 *   placeholder から仕様準拠の骨格 UI に前進。
 *   - TfWeightSlider（スライダー表示のみ / v5.1 は保存 API 非対応）
 *   - ジョブ作成フォーム（symbol / timeframe）
 *   - ジョブ状態ポーリング（usePredictionJob）
 *   - 最新予測結果表示（useLatestPrediction）
 *   - 3 シナリオ（bull / neutral / bear）確率バー表示
 *
 * アクセス権限: PRO | PRO_PLUS | ADMIN のみ（App.tsx ProGuard + backend RolesGuard）
 * 参照仕様: SPEC_v51_part5 §4「PG-04 MTF 予測（スタブ）」
 *           SPEC_v51_part3 §10「Predictions API」
 *           SPEC_v51_part10 §6.6「予測系エンドポイント（確定）」
 *           ワイヤーフレーム PG-04 section
 *
 * v5.1 実装状況:
 *   完了: ジョブ作成 / ポーリング / 結果表示骨格
 *   未完: TfWeight 保存 API（v5.1 仕様外）/ PredictionChart SVG（components/prediction/）
 */

import { useState } from 'react';
import {
  useCreatePredictionJob,
  usePredictionJob,
  useLatestPrediction,
} from '../hooks/usePredictionJob';
import type { PredictionScenario } from '../lib/api';

// ── 定数 ─────────────────────────────────────────────────────────────────────
const SYMBOLS = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCHF', 'USDCAD', 'XAUUSD'];
const TIMEFRAMES = ['M15', 'M30', 'H1', 'H4', 'H8', 'D1'];

// TfWeight スライダー（v5.1 は UI 表示のみ / 保存 API は仕様外）
const TF_WEIGHTS_DEFAULT = [
  { tf: 'W1',  value: 30 },
  { tf: 'D1',  value: 25 },
  { tf: 'H4',  value: 20 },
  { tf: 'H1',  value: 15 },
  { tf: 'M30', value: 10 },
];

// シナリオ配色（ワイヤーフレーム準拠）
const SCENARIO_COLOR: Record<string, string> = {
  bull:    '#2EC96A',
  neutral: '#E8B830',
  bear:    '#E05252',
};

// ─────────────────────────────────────────────────────────────────────────────
export default function PredictionPage() {
  const [symbol,    setSymbol]    = useState('EURUSD');
  const [timeframe, setTimeframe] = useState('H4');
  const [jobId,     setJobId]     = useState<string | null>(null);
  const [tfWeights, setTfWeights] = useState(TF_WEIGHTS_DEFAULT);

  const createJob   = useCreatePredictionJob();
  const jobStatus   = usePredictionJob(jobId);
  const latestResult = useLatestPrediction(symbol, timeframe);

  const handleCreateJob = async () => {
    try {
      const res = await createJob.mutateAsync({ symbol, timeframe });
      setJobId(res.jobId);
    } catch {
      // エラーは createJob.error で参照
    }
  };

  const status = jobStatus.data?.status;
  const isPolling = status === 'QUEUED' || status === 'RUNNING';

  return (
    <div style={styles.root}>
      <h1 style={styles.pageTitle}>🔮 MTF 予測</h1>

      {/* v5.1 スタブ通知 */}
      <div style={styles.stubNotice}>
        v5.1 では Prediction Engine は stub 実装のみ。
        DTW / HMM / 類似局面検索は v6 対象。
      </div>

      <div style={styles.grid}>
        {/* ── 左パネル: TfWeightSlider + ジョブ作成 ──────────────────── */}
        <aside style={styles.leftPanel}>
          {/* TfWeightSlider */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>TfWeightSlider</h2>
            <p style={styles.muted}>（v5.1: 表示のみ / 保存 API は v6 対象）</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {tfWeights.map((w, i) => (
                <div key={w.tf} style={{ fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>{w.tf}</span>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{w.value}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={w.value}
                    onChange={(e) => {
                      const next = [...tfWeights];
                      next[i] = { ...w, value: Number(e.target.value) };
                      setTfWeights(next);
                    }}
                    style={{ width: '100%', accentColor: '#6366f1' }}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ジョブ作成 */}
          <section style={{ ...styles.card, marginTop: 12 }}>
            <h2 style={styles.cardTitle}>Prediction Job</h2>

            <div style={styles.formRow}>
              <label style={styles.label}>Symbol</label>
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={styles.select}>
                {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={styles.formRow}>
              <label style={styles.label}>Timeframe</label>
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={styles.select}>
                {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>

            <button
              style={styles.primaryBtn}
              onClick={handleCreateJob}
              disabled={createJob.isPending}
            >
              {createJob.isPending ? '送信中...' : '予測ジョブ作成'}
            </button>

            {createJob.error && (
              <p style={styles.errText}>
                ジョブ作成エラー: {(createJob.error as Error).message}
              </p>
            )}

            {/* ジョブ状態 */}
            {jobId && (
              <div style={styles.statusBox}>
                <div style={styles.statusRow}>
                  <span style={styles.statusLabel}>JobID</span>
                  <span style={{ ...styles.statusValue, fontSize: 11 }}>{jobId.slice(0, 8)}…</span>
                </div>
                <div style={styles.statusRow}>
                  <span style={styles.statusLabel}>Status</span>
                  <span style={{
                    ...styles.statusValue,
                    color: status === 'SUCCEEDED' ? '#34d399'
                         : status === 'FAILED'    ? '#f87171'
                         : '#fbbf24',
                  }}>
                    {isPolling ? `${status} ...` : (status ?? 'loading')}
                  </span>
                </div>
                {jobStatus.data?.completedAt && (
                  <div style={styles.statusRow}>
                    <span style={styles.statusLabel}>Completed</span>
                    <span style={styles.statusValue}>
                      {new Date(jobStatus.data.completedAt).toLocaleTimeString('ja-JP')}
                    </span>
                  </div>
                )}
                {jobStatus.data?.errorMessage && (
                  <p style={styles.errText}>{jobStatus.data.errorMessage}</p>
                )}
                <div style={styles.statusRow}>
                  <span style={styles.statusLabel}>Stub Source</span>
                  <span style={{ ...styles.statusValue, color: '#a78bfa' }}>STUB_PREDICTION_RESULT</span>
                </div>
              </div>
            )}
          </section>
        </aside>

        {/* ── 右パネル: PredictionChart + 結果 ──────────────────────── */}
        <main style={styles.rightPanel}>
          {/* PredictionChart エリア */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>PredictionChart</h2>
            <div style={styles.chartPlaceholder}>
              {/* TODO: components/prediction/PredictionChart.tsx を実装し差し替え */}
              <svg viewBox="0 0 700 360" style={{ width: '100%', height: '100%' }}>
                {/* 現在価格ライン */}
                <line x1="120" y1="20" x2="120" y2="330" stroke="#cbd5e1" strokeOpacity={0.4} />
                {/* Bull シナリオ */}
                <polyline
                  points="120,180 190,165 260,150 330,130 400,110 470,95 540,82 610,68"
                  fill="none" stroke="#2EC96A" strokeWidth={3}
                />
                {/* Neutral シナリオ */}
                <polyline
                  points="120,180 190,182 260,178 330,183 400,180 470,185 540,181 610,184"
                  fill="none" stroke="#E8B830" strokeWidth={2}
                />
                {/* Bear シナリオ */}
                <polyline
                  points="120,180 190,196 260,212 330,230 400,248 470,262 540,275 610,290"
                  fill="none" stroke="#E05252" strokeWidth={2} strokeDasharray="6 3"
                />
                {/* 凡例 */}
                <text x="130" y="75"  fill="#2EC96A" fontSize={12}>Bull</text>
                <text x="130" y="190" fill="#E8B830" fontSize={12}>Neutral</text>
                <text x="130" y="295" fill="#E05252" fontSize={12}>Bear</text>
                <text x="115" y="185" fill="#94a3b8" fontSize={11} textAnchor="end">Current</text>
              </svg>
              <p style={styles.chartNote}>
                ※ v5.1 stub チャート。components/prediction/PredictionChart.tsx で本実装予定。
              </p>
            </div>
          </section>

          {/* 予測結果パネル */}
          <section style={{ ...styles.card, marginTop: 12 }}>
            <h2 style={styles.cardTitle}>
              予測結果
              <span style={styles.symbolBadge}>{symbol} / {timeframe}</span>
            </h2>

            {latestResult.isLoading && <p style={styles.muted}>Loading...</p>}

            {latestResult.error && (
              <p style={styles.muted}>
                予測結果なし（このシンボル/TFのジョブを作成してください）
              </p>
            )}

            {latestResult.data && (
              <>
                <div style={styles.scenarioGrid}>
                  {latestResult.data.result.scenarios.map((s: PredictionScenario) => (
                    <ScenarioCard key={s.id} scenario={s} />
                  ))}
                </div>

                <div style={styles.stubBadge}>
                  STUB: {latestResult.data.result.stub ? 'true' : 'false'}
                  {' '}&nbsp;|&nbsp;{' '}
                  Generated: {new Date(latestResult.data.createdAt).toLocaleString('ja-JP')}
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

// ── ScenarioCard ──────────────────────────────────────────────────────────────
function ScenarioCard({ scenario }: { scenario: PredictionScenario }) {
  const color = SCENARIO_COLOR[scenario.id] ?? '#94a3b8';
  const pct   = Math.round(scenario.probability * 100);

  return (
    <div style={{ ...styles.scenarioCard, borderColor: color + '44' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color }}>{scenario.label}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color }}>
          {pct}%
        </span>
      </div>
      {/* 確率バー */}
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#64748b' }}>
        <span>maxPips: {scenario.maxPips}</span>
        <span>avgTime: {scenario.avgTimeHours}h</span>
      </div>
    </div>
  );
}

// ── スタイル定義 ──────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    color: '#e2e8f0',
    padding: '0 4px',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 12,
  },
  stubNotice: {
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: '#fbbf24',
    marginBottom: 16,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: 16,
  },
  leftPanel: {},
  rightPanel: {},
  card: {
    background: '#1a1f2e',
    border: '1px solid #2d3748',
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#94a3b8',
    marginBottom: 12,
  },
  muted: {
    color: '#64748b',
    fontSize: 13,
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    color: '#94a3b8',
  },
  select: {
    background: '#0f1117',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#e2e8f0',
    padding: '6px 8px',
    fontSize: 13,
  },
  primaryBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 4,
  },
  errText: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 8,
  },
  statusBox: {
    background: '#0f1117',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 6,
    fontSize: 13,
  },
  statusLabel: {
    color: '#64748b',
  },
  statusValue: {
    color: '#e2e8f0',
    fontFamily: 'monospace',
  },
  chartPlaceholder: {
    background: '#0f1117',
    border: '1px dashed #334155',
    borderRadius: 10,
    height: 360,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  chartNote: {
    position: 'absolute' as const,
    bottom: 8,
    left: 0,
    right: 0,
    textAlign: 'center' as const,
    fontSize: 11,
    color: '#475569',
  },
  symbolBadge: {
    marginLeft: 8,
    fontSize: 11,
    color: '#6366f1',
    fontFamily: 'monospace',
    background: 'rgba(99,102,241,0.1)',
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 400,
    textTransform: 'none' as const,
    letterSpacing: 0,
  },
  scenarioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginTop: 12,
  },
  scenarioCard: {
    background: '#0f1117',
    border: '1px solid',
    borderRadius: 10,
    padding: 14,
  },
  barTrack: {
    background: '#1e293b',
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.5s ease',
  },
  stubBadge: {
    marginTop: 12,
    fontSize: 11,
    color: '#475569',
    textAlign: 'right' as const,
  },
};