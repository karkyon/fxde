/**
 * apps/api/src/jobs/queues.ts
 *
 * キュー名定数とジョブデータ型定義。
 * BullMQ の Queue / Processor 両側から import する共通定義ファイル。
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.1「キュー一覧」
 *   SPEC_v51_part4 §5.2「ジョブ定義（BullMQ）」
 *
 * v5.1 実装対象キュー（本ファイルで定義）:
 *   prediction-dispatch のみ Processor 実装済み。
 *   他キューは今後実装予定（Cron スケジューラ / 各 Worker）。
 */

import type { Timeframe } from '@fxde/types';

// ── キュー名定数（SPEC_v51_part4 §5.1 正本）────────────────────────────────
export const QUEUE_NAMES = {
  PRICE_SYNC:          'price-sync',
  SNAPSHOT_CAPTURE:    'snapshot-capture',
  NEWS_SYNC:           'news-sync',
  CALENDAR_SYNC:       'calendar-sync',
  PREDICTION_DISPATCH: 'prediction-dispatch',
  AI_SUMMARY_SYNC:     'ai-summary-sync',
  CLEANUP:             'cleanup',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// ── ジョブデータ型（SPEC_v51_part4 §5.2 正本）────────────────────────────────

export type PriceSyncJobData = {
  symbol:    string;
  timeframe: Timeframe;
};

export type SnapshotCaptureJobData = {
  userId:    string;
  symbol:    string;
  timeframe: Timeframe;
};

/** prediction-dispatch ジョブデータ（v5.1 stub 対象）*/
export type PredictionDispatchJobData = {
  jobId: string;
};

export type AiSummarySyncJobData = {
  userId:     string;
  snapshotId: string;
};

export type CleanupJobData = {
  target: 'sessions' | 'signals' | 'all';
};