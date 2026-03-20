/**
 * apps/api/src/modules/plugins-ranking/plugins-ranking.spec.ts
 *
 * Plugins Reliability / Recompute 成立ライン自動テスト
 *
 * 方針:
 *   - ReliabilityScoringService / AdaptiveRankingService / Queue を jest.fn() でモック化。
 *   - BullMQ Queue.add() が呼ばれることで「キューイング成立」を確認する。
 *   - JwtAuthGuard は overrideGuard でパスさせる。
 *
 * テスト対象:
 *   GET  /api/v1/plugins/reliability       → 200 配列レスポンス
 *   POST /api/v1/plugins/recompute         → 202 { status: 'queued' }
 *   GET  /api/v1/plugins/reliability       → 401 未認証
 *
 * 参照:
 *   apps/api/src/modules/plugins-ranking/controller/plugins-ranking.controller.ts
 *   apps/api/src/jobs/queues.ts — QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE
 *   SPEC_v51_part5 §10.3
 */

import { Test, TestingModule }   from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { getQueueToken }         from '@nestjs/bullmq';
import { JwtAuthGuard }          from '../../common/guards/jwt-auth.guard';
import request                   from 'supertest';

import { PluginsRankingController }  from './controller/plugins-ranking.controller';
import { ReliabilityScoringService } from './service/reliability-scoring.service';
import { AdaptiveRankingService }    from './service/adaptive-ranking.service';
import { QUEUE_NAMES }               from '../../jobs/queues';

// ── モックレスポンス定義 ──────────────────────────────────────────────────────

const MOCK_RELIABILITY_ROW = {
  id:               'rel-uuid-1',
  pluginKey:        'trend-bias-analyzer',
  symbol:           null,
  timeframe:        null,
  sampleSize:       330,
  winRate:          0.52,
  expectancy:       0.012,
  avgReturn:        0.012,
  avgMfe:           0.05,
  avgMae:           0.03,
  reliabilityScore: 0.322,
  stabilityScore:   0.61,
  confidenceScore:  0.70,
  state:            'stop_candidate',
  updatedAt:        new Date('2026-03-20T00:00:00.000Z'),
};

// ── モックサービス ────────────────────────────────────────────────────────────

const mockReliabilityService = {
  findAll:               jest.fn(),
  recompute:             jest.fn(),
  getConditionBreakdown: jest.fn(),
  getRecentEvents:       jest.fn(),
};

const mockAdaptiveRankingService = {
  getRanking:        jest.fn(),
  getStopCandidates: jest.fn(),
  getHistory:        jest.fn(),
  runRanking:        jest.fn(),
};

// BullMQ Queue の add() をモック
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'bullmq-job-id' }),
};

// ── テストスイート ────────────────────────────────────────────────────────────

describe('Plugins Reliability / Recompute 成立ライン', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PluginsRankingController],
      providers: [
        { provide: ReliabilityScoringService, useValue: mockReliabilityService },
        { provide: AdaptiveRankingService,    useValue: mockAdaptiveRankingService },
        // @InjectQueue(QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE) のトークンをモック
        {
          provide: getQueueToken(QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE),
          useValue: mockQueue,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { sub: 'test-user-id', email: 'pro@example.com', role: 'PRO' };
        return true;
      }})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /plugins/reliability ──────────────────────────────────────────────

  describe('GET /api/v1/plugins/reliability', () => {
    it('→ 200 配列レスポンス', async () => {
      mockReliabilityService.findAll.mockResolvedValue([MOCK_RELIABILITY_ROW]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/plugins/reliability');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('→ 各要素が pluginKey / reliabilityScore / state を持つ', async () => {
      mockReliabilityService.findAll.mockResolvedValue([MOCK_RELIABILITY_ROW]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/plugins/reliability');

      const item = res.body[0];
      expect(item.pluginKey).toBeDefined();
      expect(typeof item.reliabilityScore).toBe('number');
      expect(item.state).toBeDefined();
      expect(item.sampleSize).toBeDefined();
    });

    it('空配列でも 200', async () => {
      mockReliabilityService.findAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/plugins/reliability');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('symbol / timeframe クエリ付きで service が呼ばれる', async () => {
      mockReliabilityService.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/plugins/reliability')
        .query({ symbol: 'EURUSD', timeframe: 'H4' });

      expect(mockReliabilityService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'EURUSD', timeframe: 'H4' }),
      );
    });
  });

  // ── POST /plugins/recompute ───────────────────────────────────────────────

  describe('POST /api/v1/plugins/recompute', () => {
    it('→ 202 { status: "queued" }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/plugins/recompute');

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('queued');
    });

    it('→ BullMQ Queue.add() が呼ばれる', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/plugins/recompute');

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'reliability-recompute',
        {},
        expect.objectContaining({
          removeOnComplete: expect.anything(),
          removeOnFail:     expect.anything(),
        }),
      );
    });
  });
});

// ── 未認証テスト ──────────────────────────────────────────────────────────────

describe('Plugins Reliability 認証ガード', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PluginsRankingController],
      providers: [
        { provide: ReliabilityScoringService, useValue: mockReliabilityService },
        { provide: AdaptiveRankingService,    useValue: mockAdaptiveRankingService },
        {
          provide: getQueueToken(QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE),
          useValue: mockQueue,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => { throw new UnauthorizedException(); } }) // false だと 403。401 には throw が必要
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('未認証 → GET /plugins/reliability → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/plugins/reliability');

    expect(res.status).toBe(401);
  });

  it('未認証 → POST /plugins/recompute → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/plugins/recompute');

    expect(res.status).toBe(401);
  });
});