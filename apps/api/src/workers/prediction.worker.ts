/**
 * apps/api/src/workers/prediction.worker.ts
 *
 * Prediction ジョブ実行フロー全体を担うワーカーヘルパークラス。
 * BullMQ Processor（prediction-dispatch.processor.ts）から呼び出される。
 *
 * v5.1 実装フロー（SPEC_v51_part8 §9 準拠）:
 *   job start
 *   ↓ loadMtfCandles   — market_candles テーブル参照（空の場合はスタブ）
 *   ↓ generateFeatures — スタブ（v6: DTW / テクニカル指標特徴量に差し替え）
 *   ↓ runInference     — PredictionsService.generatePrediction() 呼び出し
 *   ↓ saveResult       — PredictionResult テーブルに upsert
 *   job done
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.5「prediction-dispatch ワーカー」
 *   SPEC_v51_part8 §9「Prediction Service プロセス設計（v5.1: スタブのみ実装）」
 *   SPEC_v51_part8 §9.3「STUB_PREDICTION_RESULT（固定返却データ）」
 *
 * v5.1 実装禁止（v6 設計資料）:
 *   DTW / HMM 分類 / 特徴量抽出本実装 / WFV / 自動重み学習
 *   これらは SPEC_v51_part8 §B（v6 設計資料）に保持されている。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }       from '../prisma/prisma.service';
import { PredictionsService }  from '../modules/predictions/predictions.service';
import type { Timeframe }      from '@fxde/types';
import { STUB_PREDICTION_RESULT } from '@fxde/types';

// ── 内部型定義 ──────────────────────────────────────────────────────────────

/** loadMtfCandles の戻り値（v5.1 stub 型）*/
interface MtfCandleStub {
  timeframe: Timeframe;
  count:     number;
}

/** generateFeatures の戻り値（v5.1 stub 型）*/
interface FeatureStub {
  symbol:    string;
  timeframe: Timeframe;
  generated: boolean;
}

/** runInference / generatePrediction の出力型 */
export interface InferenceResult {
  probabilities: {
    bullish: number;
    neutral: number;
    bearish: number;
  };
  expectedMovePips: number;
  confidence:       'high' | 'medium' | 'low';
  forecastHorizonH: number;
}

// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class PredictionWorker {
  private readonly logger = new Logger(PredictionWorker.name);

  constructor(
    private readonly db:          PrismaService,
    private readonly predictions: PredictionsService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // runJob: エントリーポイント
  // prediction-dispatch.processor.ts の process() から呼び出される。
  //
  // ステータス更新（RUNNING / SUCCEEDED / FAILED）は
  // processor 側で行うため、ここでは純粋にフロー処理のみ担当する。
  // ──────────────────────────────────────────────────────────────────────────
  async runJob(jobId: string): Promise<void> {
    this.logger.log(`PredictionWorker.runJob start jobId=${jobId}`);

    // ── 1. ジョブ情報取得 ──────────────────────────────────────────────────
    const job = await this.db.predictionJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    const symbol    = job.symbol;
    const timeframe = job.timeframe as Timeframe;

    // ── 2. MTF ローソク足ロード ────────────────────────────────────────────
    // v5.1: market_candles テーブル参照。データがなければスタブ配列を返す。
    // v6:   全時間足の市場データを並列取得する実装に差し替え予定。
    const candles = await this.loadMtfCandles(symbol, timeframe);
    this.logger.debug(
      `loadMtfCandles done symbol=${symbol} tf=${timeframe} entries=${candles.length}`,
    );

    // ── 3. 特徴量生成 ─────────────────────────────────────────────────────
    // v5.1: スタブ（フラグを返すのみ）
    // v6:   DTW / パターン特徴量 / テクニカル指標の抽出に差し替え予定。
    const features = await this.generateFeatures(symbol, timeframe, candles);
    this.logger.debug(
      `generateFeatures done symbol=${features.symbol} generated=${features.generated}`,
    );

    // ── 4. モデル推論 ─────────────────────────────────────────────────────
    // PredictionsService.generatePrediction() を呼び出す。
    // v5.1: STUB_PREDICTION_RESULT 準拠の固定値を返す。
    // v6:   MTF 特徴量 + HMM による実推論に差し替え予定。
    const inference = await this.runInference(symbol, timeframe);
    this.logger.debug(
      `runInference done bullish=${inference.probabilities.bullish} ` +
      `neutral=${inference.probabilities.neutral} ` +
      `bearish=${inference.probabilities.bearish}`,
    );

    // ── 5. 結果保存 ───────────────────────────────────────────────────────
    await this.saveResult(jobId, inference);
    this.logger.log(`PredictionWorker.runJob done jobId=${jobId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: MTF ローソク足ロード（private）
  // v5.1: DB から取得試行。空の場合はスタブ配列を返す。
  // ──────────────────────────────────────────────────────────────────────────
  private async loadMtfCandles(
    symbol:    string,
    timeframe: Timeframe,
  ): Promise<MtfCandleStub[]> {
    const rows = await this.db.marketCandle.findMany({
      where:   { symbol, timeframe: timeframe as never },
      orderBy: { time: 'desc' },
      take:    100,
    });

    if (rows.length > 0) {
      return [{ timeframe, count: rows.length }];
    }

    // DB にデータが無い場合は v5.1 スタブ
    // 参照: SPEC_v51_part8 §2.1「デフォルト重みテーブル H4 推奨」
    return [
      { timeframe: 'W1',  count: 0 },
      { timeframe: 'D1',  count: 0 },
      { timeframe: 'H4',  count: 0 },
      { timeframe: 'H1',  count: 0 },
      { timeframe: 'M30', count: 0 },
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3: 特徴量生成（private）
  // v5.1: スタブ（generated フラグを返すのみ）
  // v6: DTW / テクニカル指標 / マルチTF特徴量の抽出に差し替え予定。
  // ──────────────────────────────────────────────────────────────────────────
  private async generateFeatures(
    symbol:    string,
    timeframe: Timeframe,
    _candles:  MtfCandleStub[],
  ): Promise<FeatureStub> {
    // v5.1: _candles は受け取るが処理しない。
    // v6:   _candles を使った特徴量ベクトルを返す。
    return { symbol, timeframe, generated: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 4: モデル推論（private）
  // PredictionsService.generatePrediction() に委譲する。
  // ──────────────────────────────────────────────────────────────────────────
  private async runInference(
    symbol:    string,
    timeframe: Timeframe,
  ): Promise<InferenceResult> {
    // forecastHorizonH のデフォルト: 24h（SPEC_v51_part11 §3.6 準拠）
    return this.predictions.generatePrediction(symbol, timeframe, 24);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 5: 結果保存（private）
  // InferenceResult を PredictionResult テーブルに upsert する。
  // resultData の shape は STUB_PREDICTION_RESULT（@fxde/types）に準拠する。
  // 参照: SPEC_v51_part8 §9.3「STUB_PREDICTION_RESULT shape」
  // ──────────────────────────────────────────────────────────────────────────
  private async saveResult(
    jobId:     string,
    inference: InferenceResult,
  ): Promise<void> {
    const pips = inference.expectedMovePips;

    const resultData = {
      ...STUB_PREDICTION_RESULT,
      scenarios: {
        bull: {
          probability: inference.probabilities.bullish,
          target:      `+${Math.round(pips * 0.8)}pips`,
          horizonBars: 12,
        },
        neutral: {
          probability: inference.probabilities.neutral,
          target:      `+${Math.round(pips * 0.1)}pips`,
          horizonBars: 12,
        },
        bear: {
          probability: inference.probabilities.bearish,
          target:      `-${Math.round(pips * 0.5)}pips`,
          horizonBars: 12,
        },
      },
      stats: {
        matchedCases: 0,
        confidence:   inference.probabilities.bullish > 0.5 ? 0.7 : 0.55,
        note:         'v5.1 worker result',
      },
    };

    await this.db.predictionResult.upsert({
      where:  { jobId },
      update: { resultData: resultData as object },
      create: { jobId,    resultData: resultData as object },
    });

    this.logger.debug(`saveResult upserted jobId=${jobId}`);
  }
}