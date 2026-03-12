/**
 * apps/api/src/ai-summary/ai-summary.service.ts
 *
 * 参照仕様: SPEC_v51_part4 §6「AI 市場要約機能」
 *           SPEC_v51_part3 §14「AI Summary API」
 *           SPEC_v51_part8 §8.1「プロンプト設計」
 *
 * 責務:
 *   - Claude API 呼び出し（generateAiSummary）
 *   - レート制限チェック（checkAiSummaryLimit）
 *   - DB 保存 + Redis キャッシュ
 *   - 最新サマリー取得（getLatest）
 *
 * Redis キー形式:
 *   rate limit : ai-summary-limit:{userId}:{YYYY-MM-DD}
 *   cache      : ai-summary:{userId}:{symbol}  TTL=3600
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY  : Claude API キー（必須）
 *   ANTHROPIC_MODEL    : モデル名（例: claude-sonnet-4-6）
 *   REDIS_URL          : Redis 接続 URL
 */

import {
  Injectable,
  Logger,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import type { UserRole } from '@fxde/types';

// ── 型定義 ──────────────────────────────────────────────────────────────────
interface SnapshotForSummary {
  id:           string;
  symbol:       string;
  timeframe:    string;
  scoreTotal:   number;
  entryState:   string;
  indicators:   unknown;
  patterns:     unknown;
  mtfAlignment: unknown;
}

type IndicatorsData = {
  ma:   { slope: number; crossStatus: string };
  rsi:  { value: number; divergence: boolean };
  macd: { histogram: number; crossStatus: string };
  atr:  { ratio: number };
};
type PatternData = { name: string; confidence: number };
type MtfAlignmentData = Record<string, { direction: string }>;

// ── プロンプト（SPEC_v51_part4 §6.3 / part8 §8.1 正本）────────────────────
const SYSTEM_PROMPT = `
あなたは FX 市場の分析アシスタントです。
与えられた指標データを元に、初心者にも分かりやすく現在の市場状況を
日本語で要約してください。
技術用語は使う場合は必ず説明を添えてください。
200 字以内で。最後に必ず「最終判断はご自身でお願いします。」で締めてください。
`.trim();

// ── 無制限ロール（SPEC_v51_part4 §6.1）─────────────────────────────────────
const UNLIMITED_ROLES = ['PRO', 'PRO_PLUS', 'ADMIN'] as const;

@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);
  private readonly redis: Redis;

  constructor(private readonly prisma: PrismaService) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  /**
   * AI サマリー生成・保存（POST /api/v1/ai-summary から呼び出し）
   * 1. 環境変数チェック
   * 2. ロール別アクセス制御
   * 3. レート制限チェック（BASIC: 3回/日）
   * 4. スナップショット取得
   * 5. Claude API 呼び出し
   * 6. DB upsert + Redis キャッシュ
   * 7. レスポンス返却
   */
  async generateAndSave(
    userId:     string,
    role:       UserRole,
    symbol:     string,
    timeframe:  string,
    snapshotId?: string,
  ) {
    // 1. 環境変数チェック
    if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL) {
      throw new ServiceUnavailableException(
        'AI Summary は現在利用できません（API キー未設定）',
      );
    }

    // 2. FREE ロール禁止（SPEC §6.1）
    if (role === 'FREE') {
      throw new ForbiddenException(
        'AI Summary は BASIC | PRO | PRO_PLUS | ADMIN のみ利用できます',
      );
    }

    // 3. レート制限チェック
    const allowed = await this.checkAiSummaryLimit(userId, role);
    if (!allowed) {
      throw new HttpException(
        { statusCode: 429, error: 'RATE_LIMIT_EXCEEDED', message: 'AI Summary の本日の生成上限（3回）に達しました' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. スナップショット取得
    let snapshot: SnapshotForSummary | null = null;
    if (snapshotId) {
      snapshot = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
      if (!snapshot) {
        throw new NotFoundException(`Snapshot ${snapshotId} が見つかりません`);
      }
    } else {
      snapshot = await this.prisma.snapshot.findFirst({
        where: { userId, symbol, timeframe: timeframe as never },
        orderBy: { capturedAt: 'desc' },
      });
    }

    if (!snapshot) {
      throw new NotFoundException(
        `${symbol} / ${timeframe} のスナップショットが存在しません。先にキャプチャしてください。`,
      );
    }

    // 5. Claude API 呼び出し
    const summaryText = await this.callClaudeApi(snapshot);

    // 6. DB upsert（userId + symbol で unique）
    const record = await this.prisma.aiSummary.upsert({
      where:  { userId_symbol: { userId, symbol } },
      update: { text: summaryText, updatedAt: new Date() },
      create: { userId, symbol, text: summaryText },
    });

    // 6b. Redis キャッシュ（TTL 1時間）
    const cacheKey = `ai-summary:${userId}:${symbol}`;
    await this.redis.set(cacheKey, summaryText, 'EX', 3600).catch((e) => {
      this.logger.warn(`Redis cache set failed: ${String(e)}`);
    });

    // 7. remainingToday 計算
    const remainingToday = await this.getRemainingToday(userId, role);

    return {
      id:             record.id,
      symbol:         record.symbol,
      timeframe,
      summary:        record.text,
      generatedAt:    record.updatedAt.toISOString(),
      snapshotId:     snapshot.id,
      remainingToday,
    };
  }

  /**
   * 最新サマリー取得（GET /api/v1/ai-summary/latest）
   * Redis キャッシュ優先 → DB フォールバック
   */
  async getLatest(userId: string, symbol: string, timeframe: string) {
    // Redis キャッシュ確認
    const cacheKey = `ai-summary:${userId}:${symbol}`;
    const cached   = await this.redis.get(cacheKey).catch(() => null);

    if (cached) {
      return {
        id:          null,
        symbol,
        timeframe,
        summary:     cached,
        generatedAt: null,
        snapshotId:  null,
        remainingToday: null,
      };
    }

    // DB から取得
    const record = await this.prisma.aiSummary.findUnique({
      where: { userId_symbol: { userId, symbol } },
    });

    if (!record) {
      throw new NotFoundException(`${symbol} の AI サマリーが見つかりません`);
    }

    return {
      id:             record.id,
      symbol:         record.symbol,
      timeframe,
      summary:        record.text,
      generatedAt:    record.updatedAt.toISOString(),
      snapshotId:     null,
      remainingToday: null,
    };
  }

  // ── BullMQ Processor から呼び出し用（SPEC_v51_part4 §5.6）─────────────────
  async generateAiSummaryForJob(snapshot: SnapshotForSummary): Promise<string> {
    return this.callClaudeApi(snapshot);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async callClaudeApi(snapshot: SnapshotForSummary): Promise<string> {
    const payload    = this.buildPromptPayload(snapshot);
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      process.env.ANTHROPIC_MODEL,
          max_tokens: 400,
          system:     SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: JSON.stringify(payload) }],
        }),
        signal: controller.signal,
      });

      // 429 / 5xx は BullMQ リトライに委ねる（SPEC §8.1）
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Anthropic API error: HTTP ${response.status}`);
      }

      const data = await response.json() as { content: Array<{ text: string }> };
      const text = data.content[0]?.text ?? '要約の生成に失敗しました。';
      this.logger.log(`AI Summary generated for ${snapshot.symbol}`);
      return text;
    } catch (err) {
      this.logger.error('Claude API call failed', err);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildPromptPayload(snap: SnapshotForSummary) {
    const ind  = snap.indicators   as IndicatorsData;
    const ptns = snap.patterns      as PatternData[];
    const mtf  = snap.mtfAlignment  as MtfAlignmentData;

    return {
      pair:       snap.symbol,
      score:      snap.scoreTotal,
      entryState: snap.entryState,
      indicators: {
        ma:   { status: ind.ma?.crossStatus, slope: (ind.ma?.slope ?? 0) > 0 ? 'upward' : 'downward' },
        rsi:  { value: ind.rsi?.value, divergence: ind.rsi?.divergence },
        macd: { histogram: ind.macd?.histogram, crossStatus: ind.macd?.crossStatus },
        atr:  { ratio: ind.atr?.ratio, status: (ind.atr?.ratio ?? 0) <= 1.2 ? 'normal' : 'high' },
      },
      patterns: Array.isArray(ptns)
        ? ptns.map((p) => ({ name: p.name, confidence: p.confidence }))
        : [],
      mtf: mtf
        ? Object.fromEntries(Object.entries(mtf).map(([tf, v]) => [tf, v.direction]))
        : {},
    };
  }

  private async checkAiSummaryLimit(userId: string, role: UserRole): Promise<boolean> {
    if ((UNLIMITED_ROLES as readonly string[]).includes(role)) return true;
    // BASIC: 3 回/日
    const key   = `ai-summary-limit:${userId}:${new Date().toDateString()}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 86400);
    return count <= 3;
  }

  private async getRemainingToday(userId: string, role: UserRole): Promise<number | null> {
    if ((UNLIMITED_ROLES as readonly string[]).includes(role)) return null;
    const key   = `ai-summary-limit:${userId}:${new Date().toDateString()}`;
    const count = await this.redis.get(key).catch(() => '0');
    return Math.max(0, 3 - Number(count));
  }
}