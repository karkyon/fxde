/**
 * apps/api/src/modules/snapshots/snapshots.spec.ts
 *
 * Snapshots API 成立ライン + capture → Signal 自動生成経路 自動テスト
 *
 * ── 方針 ──────────────────────────────────────────────────────────────────
 * [Part 1] Controller HTTP テスト
 *   - SnapshotsService を jest.fn() でフルモック化し、HTTP 層の動作だけを固定。
 *   - JwtAuthGuard は overrideGuard でパスさせる（認証 guard は auth.spec.ts が担当）。
 *   - DB / Prisma / Redis への実接続なし（ユニットテスト）。
 *
 * [Part 2] SnapshotsService — capture → Signal 自動生成経路 ユニットテスト
 *   - 本番 SnapshotsService を使い、PrismaService / SettingsService をモック化。
 *   - createSignalFromSnapshot() は private だが capture() 経由で間接検証する。
 *   - テスト対象の経路:
 *       ENTRY_OK  → prisma.signal.create() が type='ENTRY_OK' で呼ばれる
 *       COOLDOWN  → prisma.signal.create() が type='COOLDOWN'  で呼ばれる
 *       LOCKED + forceLock      → type='LOCKED_FORCE'
 *       LOCKED + isEventWindow  → type='LOCKED_EVENT'
 *       SCORE_LOW → prisma.signal.create() が呼ばれない
 *       RISK_NG   → prisma.signal.create() が呼ばれない
 *       Signal生成失敗 → capture() はエラーを投げず snapshot を返す
 *
 * ── テスト対象ファイル ────────────────────────────────────────────────────
 *   apps/api/src/modules/snapshots/snapshots.controller.ts
 *   apps/api/src/modules/snapshots/snapshots.service.ts
 *     └─ capture() → createSignalFromSnapshot()
 *
 * ── 参照 ──────────────────────────────────────────────────────────────────
 *   SPEC_v51_part3 §7「Snapshots API」
 *   SPEC_v51_part3 §9「Signals API」
 *   apps/api/src/modules/signals/signals.service.ts（Signal 型定義）
 */

import { Test, TestingModule }   from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ZodValidationPipe }     from 'nestjs-zod';
import { JwtAuthGuard }          from '../../common/guards/jwt-auth.guard';
import request                   from 'supertest';

import { SnapshotsController }  from './snapshots.controller';
import { SnapshotsService }     from './snapshots.service';
import { PrismaService }        from '../../prisma/prisma.service';
import { SettingsService }      from '../settings/settings.service';

// ══════════════════════════════════════════════════════════════════════════════
// 共通フィクスチャ
// ══════════════════════════════════════════════════════════════════════════════

/** formatSnapshot() が返すレスポンス shape の最小実装 */
const MOCK_SNAPSHOT_RESPONSE = {
  id:             'snap-uuid-1',
  userId:         'user-id-1',
  symbol:         'EURUSD',
  timeframe:      'H4',
  capturedAt:     '2026-03-20T00:00:00.000Z',
  indicators:     {},
  patterns:       [],
  mtfAlignment:   {},
  scoreTotal:     55,
  scoreBreakdown: { technical: 20, fundamental: 15, market: 5, rr: 10, patternBonus: 5 },
  entryState:     'ENTRY_OK',
  entryDecision:  { status: 'ENTRY_OK', reasons: [], recommendation: 'エントリー可能です' },
  entryContext:   {
    rr: 2.0, lotSize: 0.1, maxLot: 0,
    isEventWindow: false, isCooldown: false, isDailyLimit: false, forceLock: false,
  },
  createdAt:      '2026-03-20T00:00:00.000Z',
};

const MOCK_SNAPSHOT_LIST_RESPONSE = {
  data:  [MOCK_SNAPSHOT_RESPONSE],
  total: 1,
  page:  1,
  limit: 20,
};

// ── Prisma の snapshot.create が返す内部 snapshot オブジェクト ──────────────
// formatSnapshot() に渡されるため Date 型が必要
const makePrismaSnapshot = (entryState: string) => ({
  id:             'snap-uuid-1',
  userId:         'user-id-1',
  symbol:         'EURUSD',
  timeframe:      'H4',
  capturedAt:     new Date('2026-03-20T00:00:00.000Z'),
  indicators:     {},
  patterns:       [],
  mtfAlignment:   {},
  scoreTotal:     55,
  scoreBreakdown: { technical: 20, fundamental: 15, market: 5, rr: 10, patternBonus: 5 },
  entryState,
  entryContext:   {
    rr: 2.0, lotSize: 0.1, maxLot: 0,
    isEventWindow: false, isCooldown: false, isDailyLimit: false, forceLock: false,
  },
  createdAt:      new Date('2026-03-20T00:00:00.000Z'),
});

// ── indicator_cache モックデータ ─────────────────────────────────────────────
// toScoreIndicators() が ma / rsi / macd / atr を必要とする最小 shape
const MOCK_INDICATOR_CACHE = {
  id:           'ic-1',
  symbol:       'EURUSD',
  timeframe:    'H4',
  calculatedAt: new Date('2026-03-20T00:00:00.000Z'),
  indicators: {
    ma:   { ma50: 1.10, ma200: 1.08, slope: 0.002, crossStatus: 'NONE' },
    rsi:  { value: 50,  divergence: false },
    macd: { macdLine: 0.001, signal: 0.0, histogram: 0.001, crossStatus: 'NONE' },
    bb:   { upper: 1.15, mid: 1.10, lower: 1.05, bandwidth: 0.1 },
    atr:  { value: 0.005, ratio: 0.8 },
  },
};

// ── SettingsService モック返却値 ─────────────────────────────────────────────
const makeSettings = (overrides: {
  scoreThreshold?: number;
  forceLock?: boolean;
} = {}) => ({
  scoreThreshold:  overrides.scoreThreshold ?? 0, // 0 にすることで ENTRY_OK を確実に得る
  forceLock:       overrides.forceLock ?? false,
  featureSwitches: { patternBonus: false },
  riskProfile:     null,
});

// ── OPEN trade モック（rr=2.0 が計算されるよう設定）─────────────────────────
// entry=1.10, sl=1.09, tp=1.12 → rr = |1.12-1.10| / |1.10-1.09| = 0.02/0.01 = 2.0
const MOCK_OPEN_TRADE = {
  entryPrice: '1.1000',
  sl:         '1.0900',
  tp:         '1.1200',
  size:       '0.1',
};

// ══════════════════════════════════════════════════════════════════════════════
// Part 1: Snapshots HTTP API 成立ライン（Controller モック）
// ══════════════════════════════════════════════════════════════════════════════

/** Controller テスト用 SnapshotsService フルモック */
const mockSnapshotsService = {
  capture:   jest.fn(),
  evaluate:  jest.fn(),
  getLatest: jest.fn(),
  getById:   jest.fn(),
  getList:   jest.fn(),
};

describe('Snapshots HTTP API 成立ライン', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SnapshotsController],
      providers: [
        { provide: SnapshotsService, useValue: mockSnapshotsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: 'user-id-1', email: 'test@example.com', role: 'FREE' };
          return true;
        },
      })
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

  // ── POST /snapshots/capture ────────────────────────────────────────────

  describe('POST /api/v1/snapshots/capture', () => {
    it('→ 201 + SnapshotResponse shape', async () => {
      mockSnapshotsService.capture.mockResolvedValue(MOCK_SNAPSHOT_RESPONSE);

      const res = await request(app.getHttpServer())
        .post('/api/v1/snapshots/capture')
        .send({ symbol: 'EURUSD', timeframe: 'H4' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.symbol).toBe('EURUSD');
      expect(res.body.timeframe).toBe('H4');
      expect(typeof res.body.scoreTotal).toBe('number');
      expect(res.body.entryState).toBeDefined();
      expect(res.body.entryDecision).toBeDefined();
      expect(mockSnapshotsService.capture).toHaveBeenCalledTimes(1);
    });

    it('symbol 欠落 → 400 バリデーションエラー', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/snapshots/capture')
        .send({ timeframe: 'H4' }); // symbol 欠落

      expect(res.status).toBe(400);
      expect(mockSnapshotsService.capture).not.toHaveBeenCalled();
    });

    it('timeframe 不正値 → 400 バリデーションエラー', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/snapshots/capture')
        .send({ symbol: 'EURUSD', timeframe: 'INVALID_TF' });

      expect(res.status).toBe(400);
      expect(mockSnapshotsService.capture).not.toHaveBeenCalled();
    });
  });

  // ── POST /snapshots/evaluate ───────────────────────────────────────────

  describe('POST /api/v1/snapshots/evaluate', () => {
    it('→ 200 + SnapshotResponse shape（DB保存なし）', async () => {
      mockSnapshotsService.evaluate.mockResolvedValue({
        ...MOCK_SNAPSHOT_RESPONSE,
        id: 'ephemeral-uuid',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/snapshots/evaluate')
        .send({ symbol: 'USDJPY', timeframe: 'D1' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ephemeral-uuid');
      expect(res.body.scoreTotal).toBeDefined();
      expect(mockSnapshotsService.evaluate).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /snapshots/latest ──────────────────────────────────────────────

  describe('GET /api/v1/snapshots/latest', () => {
    it('→ 200 + snapshot が存在する場合は SnapshotResponse', async () => {
      mockSnapshotsService.getLatest.mockResolvedValue(MOCK_SNAPSHOT_RESPONSE);

      const res = await request(app.getHttpServer())
        .get('/api/v1/snapshots/latest')
        .query({ symbol: 'EURUSD', timeframe: 'H4' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });

    it('→ 200 + 空レスポンス（snapshot が存在しない場合）', async () => {
      mockSnapshotsService.getLatest.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/snapshots/latest');

      expect(res.status).toBe(200);
      // Express は null を JSON シリアライズすると {} になるため id 不在で確認
      expect(res.body.id).toBeUndefined();
    });
  });

  // ── GET /snapshots ─────────────────────────────────────────────────────

  describe('GET /api/v1/snapshots', () => {
    it('→ 200 + PaginatedResponse', async () => {
      mockSnapshotsService.getList.mockResolvedValue(MOCK_SNAPSHOT_LIST_RESPONSE);

      const res = await request(app.getHttpServer())
        .get('/api/v1/snapshots');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });
  });
});

// ── 未認証テスト ──────────────────────────────────────────────────────────────

describe('Snapshots 認証ガード', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SnapshotsController],
      providers: [
        { provide: SnapshotsService, useValue: mockSnapshotsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => { throw new UnauthorizedException(); } })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('未認証 → POST /capture → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/snapshots/capture')
      .send({ symbol: 'EURUSD', timeframe: 'H4' });

    expect(res.status).toBe(401);
  });

  it('未認証 → GET /latest → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/snapshots/latest');

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part 2: SnapshotsService — capture → Signal 自動生成経路
//
// 本番 SnapshotsService を使い、PrismaService / SettingsService をモック化する。
// テストの目的: capture() → createSignalFromSnapshot() の経路を固定化し、
//   entryState ごとに Signal が正しく生成（または生成されない）ことを保証する。
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Prisma フルモック
 *
 * buildEntryContext() 内の呼び出し順序:
 *   1. trade.findFirst({ status: 'OPEN' })      → rr / lotSize 計算
 *   2. economicEvent.findFirst(...)              → isEventWindow
 *   3. trade.findFirst({ status: 'CLOSED' })     → isCooldown
 *   4. trade.count(...)                          → isDailyLimit
 *
 * その他:
 *   indicatorCache.findFirst()   → loadIndicators()
 *   patternDetection.findMany()  → loadPatterns()
 *   snapshot.create()            → capture() 本体
 *   signal.create()              → createSignalFromSnapshot()
 */
const createPrismaMock = () => ({
  indicatorCache:   { findFirst: jest.fn() },
  trade:            { findFirst: jest.fn(), count: jest.fn() },
  economicEvent:    { findFirst: jest.fn() },
  patternDetection: { findMany: jest.fn() },
  snapshot:         { create: jest.fn() },
  signal:           { create: jest.fn() },
});

const createSettingsMock = () => ({
  getSettings: jest.fn(),
});

/**
 * 共通 Prisma モックのデフォルト設定
 * - indicator_cache あり
 * - OPEN trade あり（rr=2.0 → RISK_NG にならない）
 * - 経済指標なし（isEventWindow=false）
 * - CLOSED trade なし（isCooldown=false）
 * - trade count=0（isDailyLimit=false）
 * - pattern なし
 */
function setupDefaultPrismaMocks(
  mockPrisma: ReturnType<typeof createPrismaMock>,
  entryState: string,
  overrides: {
    openTrade?:       object | null;
    economicEvent?:   object | null;
    closedTradeTime?: Date | null;
    tradeCount?:      number;
  } = {},
) {
  mockPrisma.indicatorCache.findFirst.mockResolvedValue(MOCK_INDICATOR_CACHE);

  // buildEntryContext: trade.findFirst() は2回呼ばれる
  // 1回目: OPEN trade（rr/lotSize）
  // 2回目: CLOSED trade（isCooldown）
  const openTrade = overrides.openTrade !== undefined
    ? overrides.openTrade
    : MOCK_OPEN_TRADE;

  const closedTradeResult = overrides.closedTradeTime !== undefined
    ? (overrides.closedTradeTime
        ? { exitTime: overrides.closedTradeTime }
        : null)
    : null; // デフォルト: isCooldown=false

  mockPrisma.trade.findFirst
    .mockResolvedValueOnce(openTrade)      // 1回目: OPEN
    .mockResolvedValueOnce(closedTradeResult); // 2回目: CLOSED

  const economicEvent = overrides.economicEvent !== undefined
    ? overrides.economicEvent
    : null;
  mockPrisma.economicEvent.findFirst.mockResolvedValue(economicEvent);

  mockPrisma.trade.count.mockResolvedValue(overrides.tradeCount ?? 0);

  mockPrisma.patternDetection.findMany.mockResolvedValue([]);

  mockPrisma.snapshot.create.mockResolvedValue(makePrismaSnapshot(entryState));

  mockPrisma.signal.create.mockResolvedValue({ id: 'sig-uuid-1' });
}

// ──────────────────────────────────────────────────────────────────────────────

describe('SnapshotsService capture → Signal 自動生成', () => {
  let service: SnapshotsService;
  let mockPrisma:   ReturnType<typeof createPrismaMock>;
  let mockSettings: ReturnType<typeof createSettingsMock>;

  beforeEach(async () => {
    mockPrisma   = createPrismaMock();
    mockSettings = createSettingsMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotsService,
        { provide: PrismaService,   useValue: mockPrisma   },
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();

    service = moduleRef.get<SnapshotsService>(SnapshotsService);
  });

  // ── ENTRY_OK ──────────────────────────────────────────────────────────────

  it('ENTRY_OK → signal.create() が type="ENTRY_OK" で呼ばれる', async () => {
    // scoreThreshold=0: どんなスコアでも ENTRY_OK になる設定
    mockSettings.getSettings.mockResolvedValue(makeSettings({ scoreThreshold: 0 }));
    setupDefaultPrismaMocks(mockPrisma, 'ENTRY_OK');

    const result = await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(result.id).toBeDefined();
    expect(result.entryState).toBe('ENTRY_OK');

    // Signal が生成されたことを確認
    expect(mockPrisma.signal.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ENTRY_OK',
          userId:     'user-id-1',
          symbol:     'EURUSD',
          snapshotId: 'snap-uuid-1',
        }),
      }),
    );
  });

  // ── COOLDOWN ─────────────────────────────────────────────────────────────

  it('COOLDOWN → signal.create() が type="COOLDOWN" で呼ばれる', async () => {
    mockSettings.getSettings.mockResolvedValue(makeSettings({ scoreThreshold: 0 }));

    // 直近の CLOSED trade が cooldownMin(=120分) 以内 → isCooldown=true
    const recentExitTime = new Date(Date.now() - 30 * 60 * 1000); // 30分前
    setupDefaultPrismaMocks(mockPrisma, 'COOLDOWN', {
      closedTradeTime: recentExitTime,
    });

    const result = await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(result.entryState).toBe('COOLDOWN');
    expect(mockPrisma.signal.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'COOLDOWN' }),
      }),
    );
  });

  // ── LOCKED + forceLock ───────────────────────────────────────────────────

  it('LOCKED (forceLock=true) → signal.create() が type="LOCKED_FORCE" で呼ばれる', async () => {
    // forceLock=true: 最優先で LOCKED になる
    mockSettings.getSettings.mockResolvedValue(makeSettings({ forceLock: true }));
    setupDefaultPrismaMocks(mockPrisma, 'LOCKED');

    const result = await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(result.entryState).toBe('LOCKED');
    expect(mockPrisma.signal.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'LOCKED_FORCE' }),
      }),
    );
  });

  // ── LOCKED + isEventWindow ───────────────────────────────────────────────

  it('LOCKED (isEventWindow=true, forceLock=false) → signal.create() が type="LOCKED_EVENT" で呼ばれる', async () => {
    mockSettings.getSettings.mockResolvedValue(makeSettings({ forceLock: false, scoreThreshold: 0 }));

    // 経済指標あり → isEventWindow=true → LOCKED
    const upcomingEvent = { id: 'ev-1', currency: 'EUR', importance: 'HIGH', scheduledAt: new Date() };
    setupDefaultPrismaMocks(mockPrisma, 'LOCKED', {
      economicEvent: upcomingEvent,
    });

    const result = await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(result.entryState).toBe('LOCKED');
    expect(mockPrisma.signal.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'LOCKED_EVENT' }),
      }),
    );
  });

  // ── SCORE_LOW ────────────────────────────────────────────────────────────

  it('SCORE_LOW → signal.create() が呼ばれない', async () => {
    // scoreThreshold=100: どんなスコアも下回る → SCORE_LOW
    mockSettings.getSettings.mockResolvedValue(makeSettings({ scoreThreshold: 100 }));
    setupDefaultPrismaMocks(mockPrisma, 'SCORE_LOW');

    const result = await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(result.entryState).toBe('SCORE_LOW');
    // SCORE_LOW / RISK_NG は Signal 生成対象外（SPEC §9）
    expect(mockPrisma.signal.create).not.toHaveBeenCalled();
  });

  // ── RISK_NG ──────────────────────────────────────────────────────────────

  it('RISK_NG (rr=0) → signal.create() が呼ばれない', async () => {
    mockSettings.getSettings.mockResolvedValue(makeSettings({ scoreThreshold: 0 }));

    // OPEN trade なし → rr=0 < 1.0 → RISK_NG（entry-decision.ts 仕様）
    setupDefaultPrismaMocks(mockPrisma, 'RISK_NG', { openTrade: null });

    const result = await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(result.entryState).toBe('RISK_NG');
    expect(mockPrisma.signal.create).not.toHaveBeenCalled();
  });

  // ── Signal 生成失敗の耐障害性 ────────────────────────────────────────────

  it('signal.create() が例外を投げても capture() はエラーを投げず snapshot を返す', async () => {
    mockSettings.getSettings.mockResolvedValue(makeSettings({ scoreThreshold: 0 }));
    setupDefaultPrismaMocks(mockPrisma, 'ENTRY_OK');

    // Signal 生成を意図的に失敗させる
    mockPrisma.signal.create.mockRejectedValue(new Error('DB connection lost'));

    // capture() は Signal 生成失敗を warn に留め、snapshot を返す（SPEC §9「Signal 生成失敗は Snapshot 返却を妨げない」）
    const result = await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });

  // ── snapshot.create 呼び出し shape ───────────────────────────────────────

  it('snapshot.create() に正しい shape が渡される', async () => {
    mockSettings.getSettings.mockResolvedValue(makeSettings({ scoreThreshold: 0 }));
    setupDefaultPrismaMocks(mockPrisma, 'ENTRY_OK');

    await service.capture('user-id-1', { symbol: 'EURUSD', timeframe: 'H4' });

    expect(mockPrisma.snapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId:    'user-id-1',
          symbol:    'EURUSD',
          timeframe: 'H4',
          scoreTotal:     expect.any(Number),
          scoreBreakdown: expect.objectContaining({
            technical:    expect.any(Number),
            fundamental:  expect.any(Number),
            market:       expect.any(Number),
            rr:           expect.any(Number),
            patternBonus: expect.any(Number),
          }),
          entryContext: expect.objectContaining({
            rr:            expect.any(Number),
            lotSize:       expect.any(Number),
            maxLot:        expect.any(Number),
            isEventWindow: expect.any(Boolean),
            isCooldown:    expect.any(Boolean),
            isDailyLimit:  expect.any(Boolean),
            forceLock:     expect.any(Boolean),
          }),
        }),
      }),
    );
  });
});