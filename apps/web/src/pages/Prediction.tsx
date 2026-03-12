/**
 * apps/web/src/pages/Prediction.tsx  — PG-04 MTF 予測
 *
 * 変更内容:
 *   placeholder から仕様準拠の骨格 UI に前進。
 *   - TfWeightSlider（スライダー + 💾 保存 / ↺ デフォルト ボタン）
 *   - ジョブ作成フォーム（symbol / timeframe）
 *   - ジョブ状態ポーリング（usePredictionJob）
 *   - 最新予測結果表示（useLatestPrediction）
 *   - 3 シナリオ（bull / neutral / bear）確率バー表示
 *
 * アクセス権限: PRO | PRO_PLUS | ADMIN のみ（App.tsx ProGuard + backend RolesGuard）
 * 参照仕様: SPEC_v51_part5 §4「PG-04 MTF 予測（スタブ）」
 *           SPEC_v51_part3 §10「Predictions API」
 *           SPEC_v51_part8 §2.3「TfWeight スライダー仕様」
 *           SPEC_v51_part10 §6.6「予測系エンドポイント（確定）」
 *           ワイヤーフレーム PG-04 section
 *
 * v5.1 実装状況:
 *   完了: ジョブ作成 / ポーリング / 結果表示骨格 / TfWeight 保存（PATCH）
 *   未完: PredictionChart SVG（components/prediction/ で本実装予定）
 *
 * 【修正履歴】
 *   - [Task A] TfWeightSlider に 💾 保存 / ↺ デフォルト ボタンを追加
 *     useUpdateTfWeights を接続（jobId がない場合は disabled）
 *     スライダー min=5, max=50（SPEC_v51_part8 §2.3 準拠）
 *   - [Task C] PredictionScenario の import 元を @fxde/types に統一
 *     apps/web/src/lib/api.ts のローカル定義は廃止（re-export 経由）
 */

import { useState } from 'react';
import {
  useCreatePredictionJob,
  usePredictionJob,
  useLatestPrediction,
  useUpdateTfWeights,
} from '../hooks/usePredictionJob';
import type { PredictionScenario } from '@fxde/types';
import type { Timeframe }          from '@fxde/types';
import { DEFAULT_TF_WEIGHTS }      from '@fxde/types';

// ── 定数 ─────────────────────────────────────────────────────────────────────
const SYMBOLS = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCHF', 'USDCAD', 'XAUUSD'];
const TIMEFRAMES: Timeframe[] = ['M15', 'M30', 'H1', 'H4', 'H8', 'D1'];

// TfWeight スライダー初期値
// エントリー足 H4 のデフォルト重みを採用（SPEC_v51_part8 §2.2 DEFAULT_TF_WEIGHTS.H4 準拠）
// 値は 0〜1 を % 表示（5〜50 の整数）に変換して使用
const TF_WEIGHTS_DEFAULT_LIST = [
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
  const [timeframe, setTimeframe] = useState<Timeframe>('H4');
  const [jobId,     setJobId]     = useState<string | null>(null);
  const [tfWeights, setTfWeights] = useState(TF_WEIGHTS_DEFAULT_LIST);

  const createJob    = useCreatePredictionJob();
  const jobStatus    = usePredictionJob(jobId);
  const latestResult = useLatestPrediction(symbol, timeframe);
  const updateTf     = useUpdateTfWeights(jobId);

  const handleCreateJob = async () => {
    try {
      const res = await createJob.mutateAsync({ symbol, timeframe });
      setJobId(res.jobId);
    } catch {
      // エラーは createJob.error で参照
    }
  };

  // TfWeight 保存: % 整数 → 0〜1 の小数に変換して送信
  const handleSaveTfWeights = async () => {
    const weights: Record<string, number> = {};
    for (const w of tfWeights) {
      weights[w.tf] = w.value / 100;
    }
    try {
      await updateTf.mutateAsync({ weights });
    } catch {
      // エラーは updateTf.error で参照
    }
  };

  const handleResetTfWeights = () => {
    setTfWeights(TF_WEIGHTS_DEFAULT_LIST);
  };

  const status    = jobStatus.data?.status;
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {tfWeights.map((w, i) => (
                <div key={w.tf} style={{ fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>{w.tf}</span>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{w.value}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={w.value}
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

            {/* 保存 / デフォルト ボタン */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                style={{
                  ...styles.primaryBtn,
                  flex: 1,
                  opacity: !jobId || updateTf.isPending ? 0.5 : 1,
                }}
                onClick={handleSaveTfWeights}
                disabled={!jobId || updateTf.isPending}
                title={!jobId ? 'ジョブを作成してから保存してください' : undefined}
              >
                {updateTf.isPending ? '保存中...' : '💾 保存'}
              </button>
              <button
                style={{ ...styles.secondaryBtn, flex: 1 }}
                onClick={handleResetTfWeights}
                disabled={updateTf.isPending}
              >
                ↺ デフォルト
              </button>
            </div>

            {!jobId && (
              <p style={{ ...styles.muted, marginTop: 6, fontSize: 11 }}>
                ※ ジョブを作成すると保存が有効になります
              </p>
            )}

            {updateTf.error && (
              <p style={styles.errText}>
                保存エラー: {(updateTf.error as Error).message}
              </p>
            )}

            {updateTf.isSuccess && (
              <p style={{ ...styles.muted, color: '#34d399', marginTop: 6, fontSize: 12 }}>
                ✓ 保存しました
              </p>
            )}
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
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)} style={styles.select}>
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
    gridTemplateColumns: '300px 1fr',
    gap: 16,
    alignItems: 'start',
  },
  leftPanel:  { display: 'flex', flexDirection: 'column' },
  rightPanel: { display: 'flex', flexDirection: 'column' },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '16px 18px',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#94a3b8',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  symbolBadge: {
    fontSize: 12,
    fontWeight: 400,
    color: '#6366f1',
    background: 'rgba(99,102,241,0.15)',
    borderRadius: 4,
    padding: '2px 8px',
  },
  muted: {
    color: '#64748b',
    fontSize: 13,
  },
  formRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    color: '#94a3b8',
    width: 72,
    flexShrink: 0,
  },
  select: {
    flex: 1,
    background: '#1e2130',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#e2e8f0',
    padding: '4px 8px',
    fontSize: 13,
  },
  primaryBtn: {
    width: '100%',
    padding: '8px 0',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  secondaryBtn: {
    width: '100%',
    padding: '8px 0',
    background: 'rgba(255,255,255,0.06)',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  errText: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 6,
  },
  statusBox: {
    marginTop: 12,
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    padding: '10px 12px',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 12,
  },
  statusLabel: { color: '#64748b' },
  statusValue: { color: '#e2e8f0', fontFamily: 'monospace' },
  chartPlaceholder: {
    height: 280,
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  chartNote: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    padding: '4px 0 8px',
  },
  scenarioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 10,
  },
  scenarioCard: {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid',
    borderRadius: 8,
    padding: '12px 14px',
  },
  barTrack: {
    height: 6,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.4s ease',
  },
  stubBadge: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'right',
    marginTop: 4,
  },
};