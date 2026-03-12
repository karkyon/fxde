/**
 * apps/api/src/modules/predictions/predictions.service.ts
 *
 * 参照仕様:
 *   SPEC_v51_part3 §10「Predictions API」
 *   SPEC_v51_part4 §5.5「prediction-dispatch ワーカー（v5.1: スタブのみ）」
 *   SPEC_v51_part8 §9「Prediction Service プロセス設計（v5.1: スタブのみ実装）」
 *   SPEC_v51_part2「PredictionJob / PredictionResult Prisma schema」
 *
 * v5.1 実装スコープ:
 *   - POST /predictions/jobs → DB insert + BullMQ enqueue → 202
 *   - GET  /predictions/jobs/:id → DB read（status のみ）→ 200
 *   - GET  /predictions/latest  → DB read + サービス層で配列変換 → 200
 *
 * 実装禁止（v6 設計資料）:
 *   DTW / HMM / 類似検索 / WFV / 重み自動学習
 */

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue }       from 'bullmq';
import { PrismaService }              from '../../prisma/prisma.service';
import { QUEUE_NAMES }                from '../../jobs/queues';
import type { CreatePredictionJobInput } from '@fxde/types';

// ── STUB_PREDICTION_RESULT（Part8 §9.3 正本準拠）─────────────────────────────
// DB / API 返却 / フロント表示はすべてこの shape に統一する。
// DB に保存する形式（bull/neutral/bear キーのオブジェクト型）
export const STUB_PREDICTION_RESULT = {
  scenarios: {
    bull:    { probability: 0.63, target: '+0.8%', horizonBars: 12 },
    neutral: { probability: 0.22, target: '+0.1%', horizonBars: 12 },
    bear:    { probability: 0.15, target: '-0.5%', horizonBars: 12 },
  },
  stats: {
    matchedCases: 0,
    confidence:   0.55,
    note:         'v5.1 STUB result',
  },
  tfWeights: null,
  hmmState:  null,
} as const;

// ── PredictionScenario レスポンス型（Part3 §10 正本）─────────────────────────
// サービス層で DB オブジェクト型 → 配列型に変換して返す
// フロントは配列型のみ受け取る（DB shape と API shape を意図的に分離）
export interface PredictionScenario {
  id:          'bull' | 'neutral' | 'bear';
  label:       string;
  probability: number;
  pricePoints: { bar: number; price: number }[];
  maxPips:     number;
  avgTimeHours: number;
}

// ── ラベルマップ ──────────────────────────────────────────────────────────────
const SCENARIO_LABELS: Record<'bull' | 'neutral' | 'bear', string> = {
  bull:    '強気シナリオ',
  neutral: 'レンジシナリオ',
  bear:    '弱気シナリオ',
};

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.PREDICTION_DISPATCH)
    private readonly predictionQueue: Queue,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // POST /predictions/jobs
  // ジョブ登録 → DB insert（QUEUED）→ BullMQ enqueue → 202 Accepted
  // 参照: SPEC_v51_part3 §10 / part4 §5.1
  // ──────────────────────────────────────────────────────────────────────────
  async createJob(userId: string, input: CreatePredictionJobInput) {
    this.logger.log(`createJob userId=${userId} symbol=${input.symbol} tf=${input.timeframe}`);

    // DB insert（status: QUEUED はスキーマのデフォルト値）
    const job = await this.prisma.predictionJob.create({
      data: {
        userId,
        symbol:      input.symbol,
        timeframe:   input.timeframe,
        requestData: { symbol: input.symbol, timeframe: input.timeframe },
      },
    });

    // BullMQ enqueue（イベント駆動。Cron なし）
    // 参照: SPEC_v51_part4 §5.5 / §5.7
    //   > prediction-dispatch キューは Cron スケジュールを持たない。
    //   > POST /api/v1/predictions/jobs 受付時にイベント駆動で enqueue される。
    await this.predictionQueue.add(
      'prediction-dispatch',
      { jobId: job.id },
      {
        attempts:         3,
        backoff:          { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail:     { count: 200 },
      },
    );

    this.logger.log(`createJob enqueued jobId=${job.id}`);

    // POST /predictions/jobs → 202 Accepted レスポンス
    // 参照: SPEC_v51_part3 §10 CreateJobResponse
    return {
      jobId:            job.id,
      status:           'QUEUED' as const,
      estimatedSeconds: 3, // v5.1 スタブ固定値（< 3秒 part8 §9.4 準拠）
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /predictions/jobs/:id
  // ジョブ状態確認（フロントは 5 秒ポーリング）
  // 参照: SPEC_v51_part3 §10 JobStatusResponse
  // ──────────────────────────────────────────────────────────────────────────
  async getJobStatus(userId: string, jobId: string) {
    const job = await this.prisma.predictionJob.findFirst({
      where: { id: jobId, userId }, // 他ユーザーのジョブは参照不可
    });

    if (!job) {
      throw new NotFoundException(`PredictionJob id=${jobId} not found`);
    }

    // 参照: SPEC_v51_part3 §10 JobStatusResponse
    // ⚠️ status は JobStatus enum と完全一致。'DONE' は使用禁止。
    return {
      jobId:        job.id,
      status:       job.status,
      createdAt:    job.createdAt.toISOString(),
      completedAt:  job.finishedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage ?? undefined,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /predictions/latest?symbol=EURUSD&timeframe=H4
  // 最新予測結果返却（v5.1: スタブ固定 JSON）
  //
  // 参照: SPEC_v51_part3 §10 PredictionLatestResponse
  // ⚠️ shape 変換規約（Part3 §10 明記）:
  //   DB / Part8 STUB は bull/neutral/bear キーのオブジェクト型で保存。
  //   API レスポンスではこのオブジェクトを PredictionScenario[] 配列に変換して返す。
  //   サービス層が変換責務を持つ。フロントは配列型のみ受け取る。
  // ──────────────────────────────────────────────────────────────────────────
  async getLatest(userId: string, symbol: string, timeframe?: string) {
    this.logger.debug(`getLatest userId=${userId} symbol=${symbol} tf=${timeframe ?? '-'}`);

    // 当ユーザーの最新 SUCCEEDED ジョブを取得（symbol / timeframe でフィルタ）
    const where: Record<string, unknown> = {
      userId,
      symbol,
      status: 'SUCCEEDED',
    };
    if (timeframe) where['timeframe'] = timeframe;

    const job = await this.prisma.predictionJob.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      include: { result: true },
    });

    if (!job || !job.result) {
      throw new NotFoundException(
        `No succeeded prediction found for symbol=${symbol}${timeframe ? ` timeframe=${timeframe}` : ''}`,
      );
    }

    // DB 保存済み resultData を取得
    const resultData = job.result.resultData as typeof STUB_PREDICTION_RESULT;

    // DB オブジェクト型 → PredictionScenario[] 配列へ変換（サービス層責務）
    // 参照: SPEC_v51_part3 §10 PredictionLatestResponse.result.scenarios
    const scenarioKeys = ['bull', 'neutral', 'bear'] as const;
    const scenarios: PredictionScenario[] = scenarioKeys.map((key) => ({
      id:          key,
      label:       SCENARIO_LABELS[key],
      probability: resultData.scenarios[key].probability,
      // v5.1 スタブ: pricePoints / maxPips / avgTimeHours は固定値
      pricePoints: [],
      maxPips:     0,
      avgTimeHours: 0,
    }));

    // 参照: SPEC_v51_part3 §10 PredictionLatestResponse
    return {
      jobId:     job.id,
      symbol:    job.symbol,
      timeframe: job.timeframe,
      createdAt: job.createdAt.toISOString(),
      result: {
        scenarios,
        stub: true as const, // v5.1 スタブ結果であることを明示するフラグ
      },
    };
  }
}