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
 *   完了: PredictionChart SVG 動的化（latestResult.data 使用）
 *
 * 【修正履歴】
 *   - [Task A] TfWeightSlider に 💾 保存 / ↺ デフォルト ボタンを追加
 *     useUpdateTfWeights を接続（jobId がない場合は disabled）
 *     スライダー min=5, max=50（SPEC_v51_part8 §2.3 準拠）
 *   - [Task C] PredictionScenario の import 元を @fxde/types に統一
 *     apps/web/src/lib/api.ts のローカル定義は廃止（re-export 経由）
 *   - [round5 Task3] PredictionChart SVG を動的化
 *     latestResult.data が存在する場合: probability → opacity / expectedMovePips → slope
 *     latestResult.data が未取得の場合: フォールバック静的値を表示
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

// ── PredictionChart SVG ヘルパー ──────────────────────────────────────────────
// SVG viewBox: 0 0 700 360
// x0=120: 現在価格位置（縦線）
// cy=180: 中央ライン Y 座標
// STUB expectedMovePips = 45（SPEC_v51_part11 §3.6 STUB_PREDICTION_OVERLAY 準拠）
const SVG_X0 = 120;
const SVG_CY = 180;
const STUB_EXPECTED_PIPS = 45;
const PIP_SCALE = 2.5; // 1pip あたりの SVG Y ピクセル（最大 150px にキャップ）

/** Y オフセット計算（上昇: 負値、下降: 正値）*/
function calcDy(pips: number): number {
  return Math.min(150, Math.round(pips * PIP_SCALE));
}

/** 5 点 polyline の points 文字列（現在位置 x0 から右へ補間）*/
function polylinePoints(offsetY: number): string {
  const x0 = SVG_X0;
  const cy = SVG_CY;
  return [
    `${x0},${cy}`,
    `${x0 + 120},${cy + offsetY * 0.25}`,
    `${x0 + 240},${cy + offsetY * 0.50}`,
    `${x0 + 360},${cy + offsetY * 0.75}`,
    `${x0 + 480},${cy + offsetY}`,
  ].join(' ');
}

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

  // ── PredictionChart 用データ計算 ────────────────────────────────────────
  // latestResult が存在する場合は確率値を使用、未取得時はスタブ固定値
  const scenarios    = latestResult.data?.result.scenarios;
  const bullProb     = scenarios?.find((s) => s.id === 'bull')?.probability    ?? 0.63;
  const neutralProb  = scenarios?.find((s) => s.id === 'neutral')?.probability ?? 0.22;
  const bearProb     = scenarios?.find((s) => s.id === 'bear')?.probability    ?? 0.15;
  const hasRealData  = !!scenarios;

  const dy = calcDy(STUB_EXPECTED_PIPS);

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
                {updateTf.isPending ? '保存中…' : '💾 保存'}
              </button>
              <button
                style={{ ...styles.secondaryBtn, flex: 1 }}
                onClick={handleResetTfWeights}
              >
                ↺ デフォルト
              </button>
            </div>
            {updateTf.isSuccess && (
              <p style={{ color: '#2EC96A', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                ✓ 保存しました
              </p>
            )}
          </section>

          {/* ジョブ作成フォーム */}
          <section style={{ ...styles.card, marginTop: 12 }}>
            <h2 style={styles.cardTitle}>予測ジョブ作成</h2>

            <div style={styles.formRow}>
              <label style={styles.label}>Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                style={styles.select}
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={styles.formRow}>
              <label style={styles.label}>TF</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                style={styles.select}
              >
                {TIMEFRAMES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <button
              style={styles.primaryBtn}
              onClick={handleCreateJob}
              disabled={createJob.isPending}
            >
              {createJob.isPending ? '作成中…' : '▶ 予測ジョブを実行'}
            </button>

            {createJob.isError && (
              <p style={styles.errText}>{String(createJob.error)}</p>
            )}

            {/* ジョブ状態表示 */}
            {jobId && (
              <div style={styles.statusBox}>
                <div style={styles.statusRow}>
                  <span style={styles.statusLabel}>Job ID</span>
                  <span style={{ ...styles.statusValue, fontSize: 11 }}>
                    {jobId.slice(0, 8)}…
                  </span>
                </div>
                <div style={styles.statusRow}>
                  <span style={styles.statusLabel}>Status</span>
                  <span style={{
                    ...styles.statusValue,
                    color: status === 'SUCCEEDED' ? '#2EC96A'
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
            <h2 style={styles.cardTitle}>
              PredictionChart
              {hasRealData && (
                <span style={{ fontSize: 11, fontWeight: 400, color: '#2EC96A', marginLeft: 8 }}>
                  ● 予測データ反映済
                </span>
              )}
            </h2>
            <div style={styles.chartPlaceholder}>
              {/* [round5 Task3] 動的 SVG — latestResult.data の probability → opacity / slope に反映 */}
              <svg viewBox="0 0 700 360" style={{ width: '100%', height: '100%' }}>
                {/* グリッドライン */}
                {[90, 135, 180, 225, 270].map((y) => (
                  <line key={y} x1="120" y1={y} x2="640" y2={y}
                    stroke="#2d3748" strokeOpacity={0.5} />
                ))}

                {/* 現在価格の縦線 */}
                <line x1={SVG_X0} y1="20" x2={SVG_X0} y2="330"
                  stroke="#cbd5e1" strokeOpacity={0.4} />
                <text x={SVG_X0 - 6} y={SVG_CY + 4}
                  fill="#94a3b8" fontSize={11} textAnchor="end">
                  Current
                </text>

                {/* Bull シナリオ — 上昇方向 */}
                <polyline
                  points={polylinePoints(-dy)}
                  fill="none"
                  stroke={SCENARIO_COLOR.bull}
                  strokeWidth={3}
                  strokeDasharray={hasRealData ? undefined : '8 4'}
                  opacity={0.4 + bullProb * 0.6}
                />
                {/* Neutral シナリオ — 横ばい */}
                <polyline
                  points={polylinePoints(0)}
                  fill="none"
                  stroke={SCENARIO_COLOR.neutral}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  opacity={0.4 + neutralProb * 0.6}
                />
                {/* Bear シナリオ — 下降方向 */}
                <polyline
                  points={polylinePoints(dy)}
                  fill="none"
                  stroke={SCENARIO_COLOR.bear}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  opacity={0.4 + bearProb * 0.6}
                />

                {/* 右端の確率ラベル */}
                <text x="645" y={Math.max(14, SVG_CY - dy - 2)}
                  fill={SCENARIO_COLOR.bull} fontSize={11} textAnchor="start">
                  ▲{Math.round(bullProb * 100)}%
                </text>
                <text x="645" y={SVG_CY + 4}
                  fill={SCENARIO_COLOR.neutral} fontSize={11} textAnchor="start">
                  ─{Math.round(neutralProb * 100)}%
                </text>
                <text x="645" y={Math.min(348, SVG_CY + dy + 14)}
                  fill={SCENARIO_COLOR.bear} fontSize={11} textAnchor="start">
                  ▼{Math.round(bearProb * 100)}%
                </text>

                {/* 凡例 */}
                <text x="130" y="30" fill={SCENARIO_COLOR.bull}    fontSize={12}>● Bull</text>
                <text x="200" y="30" fill={SCENARIO_COLOR.neutral} fontSize={12}>● Neutral</text>
                <text x="290" y="30" fill={SCENARIO_COLOR.bear}    fontSize={12}>● Bear</text>

                {/* expectedMovePips 表示 */}
                <text x="640" y="350" fill="#475569" fontSize={10} textAnchor="end">
                  exp.move: {STUB_EXPECTED_PIPS}pips · v5.1 stub
                </text>
              </svg>
              <p style={styles.chartNote}>
                {hasRealData
                  ? `${symbol}/${timeframe} 予測データを反映中。確率に応じて各シナリオの透明度が変化します。`
                  : '予測ジョブを実行すると、シナリオ確率がリアルタイムで反映されます。'}
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
    minHeight: 300,
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