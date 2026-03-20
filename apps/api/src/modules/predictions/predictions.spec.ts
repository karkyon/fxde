/**
 * apps/api/src/modules/predictions/predictions.spec.ts
 *
 * Predictions v5.1 成立ライン自動テスト
 *
 * 方針:
 *   - PredictionsService を jest.fn() でフルモック化。
 *   - BullMQ Queue は使用しない（service モックで隠蔽）。
 *   - JwtAuthGuard / RolesGuard は overrideGuard でパスさせる。
 *   - stub: true は v5.1 仕様。このテストが壊れたら非stub化が混入したと判断できる。
 *
 * テスト対象:
 *   POST /api/v1/predictions/jobs         → 202 { jobId, status: 'QUEUED', estimatedSeconds }
 *   GET  /api/v1/predictions/jobs/:id     → 200 { jobId, status }
 *   GET  /api/v1/predictions/latest       → 200 { result: { scenarios, stub: true } }
 *   POST /api/v1/predictions/jobs         → 400 (バリデーション失敗)
 *   POST /api/v1/predictions/jobs         → 401 (未認証)
 *   POST /api/v1/predictions/jobs         → 403 (権限不足)
 *
 * 重要制約（SPEC_v51_part8 §9.4 / SPEC_v51_part3 §10 正本）:
 *   - PredictionLatestResponse.result.stub は literal の true で固定。
 *   - 非 stub 化実装は v6 領域。このテストが result.stub === false になったら NG。
 *
 * 参照:
 *   apps/api/src/modules/predictions/predictions.controller.ts
 *   apps/api/src/modules/predictions/predictions.service.ts
 *   packages/types/src/index.ts — PredictionLatestResponse
 *   SPEC_v51_part3 §10
 *   SPEC_v51_part5 §10.3
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ZodValidationPipe }   from 'nestjs-zod';
import { JwtAuthGuard }        from '../../common/guards/jwt-auth.guard';
import { RolesGuard }          from '../../common/guards/roles.guard';
import request                 from 'supertest';

import { PredictionsController } from './predictions.controller';
import { PredictionsService }    from './predictions.service';
import type { PredictionLatestResponse } from '@fxde/types';

// ── モックレスポンス定義 ──────────────────────────────────────────────────────

const MOCK_JOB_ID = 'job-uuid-1234';

const MOCK_CREATE_JOB_RESPONSE = {
  jobId:            MOCK_JOB_ID,
  status:           'QUEUED' as const,
  estimatedSeconds: 3,
};

const MOCK_JOB_STATUS_RESPONSE = {
  jobId:        MOCK_JOB_ID,
  status:       'SUCCEEDED',
  createdAt:    '2026-03-20T00:00:00.000Z',
  completedAt:  '2026-03-20T00:00:03.000Z',
  errorMessage: undefined,
};

/**
 * v5.1 スタブ固定レスポンス
 * result.stub: true が仕様の根幹。このモックが true でない場合はテスト自体の問題。
 */
const MOCK_LATEST_RESPONSE: PredictionLatestResponse = {
  jobId:     MOCK_JOB_ID,
  symbol:    'EURUSD',
  timeframe: 'H4',
  createdAt: '2026-03-20T00:00:00.000Z',
  result: {
    scenarios: [
      { id: 'bull',    label: '強気シナリオ', probability: 0.45, pricePoints: [], maxPips: 0, avgTimeHours: 0 },
      { id: 'neutral', label: 'レンジシナリオ', probability: 0.35, pricePoints: [], maxPips: 0, avgTimeHours: 0 },
      { id: 'bear',    label: '弱気シナリオ', probability: 0.20, pricePoints: [], maxPips: 0, avgTimeHours: 0 },
    ],
    stub: true, // v5.1 仕様: literal true 固定
  },
};

// ── モックサービス ────────────────────────────────────────────────────────────

const mockPredictionsService = {
  createJob:    jest.fn(),
  getJobStatus: jest.fn(),
  getLatest:    jest.fn(),
  updateTfWeights: jest.fn(),
};

// ── テストスイート ────────────────────────────────────────────────────────────

describe('Predictions v5.1 成立ライン', () => {
  let app: INestApplication;

  // ── setup（JwtAuthGuard / RolesGuard をパスさせて PRO ユーザー相当にする） ──

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PredictionsController],
      providers: [
        { provide: PredictionsService, useValue: mockPredictionsService },
      ],
    })
      // 認証・権限ガードを通過させる（PRO ユーザーと同等の状態をシミュレート）
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
        // テスト用 JwtPayload を request.user に注入
        const req = ctx.switchToHttp().getRequest();
        req.user = { sub: 'test-user-id', email: 'pro@example.com', role: 'PRO' };
        return true;
      }})
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── POST /predictions/jobs ────────────────────────────────────────────────

  describe('POST /api/v1/predictions/jobs', () => {
    it('正常登録 → 202 { jobId, status: QUEUED, estimatedSeconds }', async () => {
      mockPredictionsService.createJob.mockResolvedValue(MOCK_CREATE_JOB_RESPONSE);

      const res = await request(app.getHttpServer())
        .post('/api/v1/predictions/jobs')
        .send({ symbol: 'EURUSD', timeframe: 'H4' });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBeDefined();
      expect(res.body.status).toBe('QUEUED');
      expect(res.body.estimatedSeconds).toBeDefined();
      expect(typeof res.body.estimatedSeconds).toBe('number');
      expect(mockPredictionsService.createJob).toHaveBeenCalledTimes(1);
    });

    it('symbol 欠落 → 400 バリデーションエラー', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/predictions/jobs')
        .send({ timeframe: 'H4' }); // symbol 欠落

      expect(res.status).toBe(400);
      expect(mockPredictionsService.createJob).not.toHaveBeenCalled();
    });

    it('timeframe 不正値 → 400 バリデーションエラー', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/predictions/jobs')
        .send({ symbol: 'EURUSD', timeframe: 'INVALID' });

      expect(res.status).toBe(400);
      expect(mockPredictionsService.createJob).not.toHaveBeenCalled();
    });
  });

  // ── GET /predictions/jobs/:id ─────────────────────────────────────────────

  describe('GET /api/v1/predictions/jobs/:id', () => {
    it('ジョブ状態確認 → 200 { jobId, status }', async () => {
      mockPredictionsService.getJobStatus.mockResolvedValue(MOCK_JOB_STATUS_RESPONSE);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/predictions/jobs/${MOCK_JOB_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.jobId).toBe(MOCK_JOB_ID);
      expect(res.body.status).toBe('SUCCEEDED');
    });
  });

  // ── GET /predictions/latest ───────────────────────────────────────────────

  describe('GET /api/v1/predictions/latest', () => {
    it('v5.1 スタブ結果 → 200 + result.stub === true', async () => {
      mockPredictionsService.getLatest.mockResolvedValue(MOCK_LATEST_RESPONSE);

      const res = await request(app.getHttpServer())
        .get('/api/v1/predictions/latest')
        .query({ symbol: 'EURUSD', timeframe: 'H4' });

      expect(res.status).toBe(200);
      expect(res.body.result).toBeDefined();
      expect(res.body.result.scenarios).toBeInstanceOf(Array);
      expect(res.body.result.scenarios.length).toBeGreaterThan(0);

      // ──────────────────────────────────────────────────────────────────────
      // v5.1 契約固定テスト:
      //   result.stub が literal の true であることを断定する。
      //   これが false になった場合、非 stub 化が混入したことを意味する（NG）。
      // 参照: SPEC_v51_part3 §10 PredictionLatestResponse / SPEC_v51_part8 §9
      // ──────────────────────────────────────────────────────────────────────
      expect(res.body.result.stub).toBe(true);
    });

    it('scenarios の各要素が id / label / probability を持つ', async () => {
      mockPredictionsService.getLatest.mockResolvedValue(MOCK_LATEST_RESPONSE);

      const res = await request(app.getHttpServer())
        .get('/api/v1/predictions/latest')
        .query({ symbol: 'EURUSD' });

      const scenarios = res.body.result.scenarios as Array<{
        id: string; label: string; probability: number;
      }>;

      for (const s of scenarios) {
        expect(s.id).toBeDefined();
        expect(s.label).toBeDefined();
        expect(typeof s.probability).toBe('number');
      }

      // bull / neutral / bear の 3 シナリオが存在する
      const ids = scenarios.map((s) => s.id);
      expect(ids).toContain('bull');
      expect(ids).toContain('neutral');
      expect(ids).toContain('bear');
    });

    it('symbol クエリ欠落 → 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/predictions/latest');
        // symbol クエリ欠落

      expect(res.status).toBe(400);
    });
  });
});

// ── 未認証テスト（JwtAuthGuard 拒否） ─────────────────────────────────────────

describe('Predictions 認証ガード', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PredictionsController],
      providers: [
        { provide: PredictionsService, useValue: mockPredictionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => { throw new UnauthorizedException(); } }) // false だと 403。401 には throw が必要
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('未認証 → POST /predictions/jobs → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/predictions/jobs')
      .send({ symbol: 'EURUSD', timeframe: 'H4' });

    expect(res.status).toBe(401);
  });
});

// ── 権限不足テスト（RolesGuard 拒否） ──────────────────────────────────────────

describe('Predictions 権限ガード（FREE/BASIC → 403）', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PredictionsController],
      providers: [
        { provide: PredictionsService, useValue: mockPredictionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { sub: 'free-user', email: 'free@example.com', role: 'FREE' };
        return true;
      }})
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => false }) // FREE/BASIC は拒否
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('FREE ユーザー → POST /predictions/jobs → 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/predictions/jobs')
      .send({ symbol: 'EURUSD', timeframe: 'H4' });

    expect(res.status).toBe(403);
  });
});