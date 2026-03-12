/**
 * apps/web/src/components/dashboard/AiSummaryBox.tsx
 *
 * 参照仕様: SPEC_v51_part10 §2「components/dashboard/AiSummaryBox.tsx」
 *           SPEC_v51_part4 §6「AI 市場要約機能」
 *
 * 表示:
 *   - サマリーテキスト（最大 200 字）
 *   - 「生成」ボタン（ローディング中はスピナー）
 *   - BASIC: 残り回数バッジ
 *   - FREE: 利用不可メッセージ
 */

import { useGenerateAiSummary, useLatestAiSummary } from '../../hooks/useAiSummary';
import { useAuthStore } from '../../stores/auth.store';

interface Props {
  symbol:    string;
  timeframe: string;
}

export default function AiSummaryBox({ symbol, timeframe }: Props) {
  const user     = useAuthStore((s) => s.user);
  const isFree   = !user || user.role === 'FREE';
  const isBasic  = user?.role === 'BASIC';

  const latest   = useLatestAiSummary(symbol, timeframe, !isFree);
  const generate = useGenerateAiSummary(symbol, timeframe);

  const handleGenerate = () => {
    generate.mutate(undefined);
  };

  return (
    <div style={s.box}>
      <div style={s.header}>
        <span style={s.title}>🤖 AI 市場要約</span>
        {isBasic && latest.data?.remainingToday != null && (
          <span style={s.badge}>残り {latest.data.remainingToday} 回</span>
        )}
      </div>

      {isFree ? (
        <p style={s.locked}>⚠️ AI 要約は BASIC プラン以上でご利用いただけます</p>
      ) : (
        <>
          <div style={s.summaryArea}>
            {latest.isLoading && (
              <p style={s.muted}>読み込み中...</p>
            )}
            {latest.data?.summary ? (
              <p style={s.summary}>{latest.data.summary}</p>
            ) : !latest.isLoading && (
              <p style={s.muted}>まだ要約がありません。「生成」を押してください。</p>
            )}
            {generate.data?.summary && (
              <p style={s.summary}>{generate.data.summary}</p>
            )}
          </div>

          <div style={s.footer}>
            {latest.data?.generatedAt && (
              <span style={s.timestamp}>
                {new Date(latest.data.generatedAt).toLocaleString('ja-JP')}
              </span>
            )}
            <button
              style={{
                ...s.btn,
                opacity: generate.isPending ? 0.6 : 1,
                cursor:  generate.isPending ? 'not-allowed' : 'pointer',
              }}
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? '生成中...' : '✨ 生成'}
            </button>
          </div>

          {generate.isError && (
            <p style={s.error}>
              {generate.error instanceof Error
                ? generate.error.message
                : '生成に失敗しました'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  box:         { background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '14px 16px' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title:       { fontSize: 13, fontWeight: 700, color: '#a5b4fc' },
  badge:       { fontSize: 11, background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 4, padding: '2px 8px' },
  summaryArea: { minHeight: 60, marginBottom: 10 },
  summary:     { fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, margin: 0 },
  muted:       { fontSize: 12, color: '#64748b', margin: 0 },
  locked:      { fontSize: 12, color: '#f59e0b', margin: 0 },
  footer:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  timestamp:   { fontSize: 11, color: '#475569' },
  btn:         { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, color: '#a5b4fc', fontSize: 12, fontWeight: 600, padding: '5px 14px' },
  error:       { fontSize: 12, color: '#f87171', marginTop: 8 },
};