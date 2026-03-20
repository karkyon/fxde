/**
 * apps/api/src/modules/auth/auth.spec.ts
 *
 * Auth API 成立ライン自動テスト
 *
 * 方針:
 *   - AuthService を jest.fn() でフルモック化し、HTTP 層の動作だけを固定化する。
 *   - argon2 / Prisma / Redis への実接続は一切行わない（ユニットテスト）。
 *   - ThrottlerGuard は overrideGuard でパスさせる（レート制限は別テスト対象外）。
 *   - JwtAuthGuard は logout エンドポイントのみ使用。
 *     - 401 ケースは overrideGuard で拒否をシミュレート。
 *     - 200 ケースは overrideGuard で通過をシミュレート。
 *
 * テスト対象:
 *   POST /api/v1/auth/register  → 201 + accessToken + Set-Cookie
 *   POST /api/v1/auth/login     → 200 + accessToken
 *   POST /api/v1/auth/refresh   → 200 + accessToken
 *   POST /api/v1/auth/logout    → 200 (JWT 有り)
 *   POST /api/v1/auth/logout    → 401 (JWT 無し)
 *   POST /api/v1/auth/register  → 409 (重複メール)
 *   POST /api/v1/auth/register  → 400 (バリデーション失敗)
 *
 * 参照:
 *   apps/api/src/modules/auth/auth.controller.ts
 *   apps/api/src/modules/auth/auth.service.ts
 *   packages/types/src/schemas/auth.schema.ts
 *   SPEC_v51_part5 §10.3
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ZodValidationPipe }   from 'nestjs-zod';
import { ThrottlerGuard }      from '@nestjs/throttler';
import { JwtAuthGuard }        from '../../common/guards/jwt-auth.guard';
import { ConflictException }   from '@nestjs/common';
import request                 from 'supertest';

import { AuthController } from './auth.controller';
import { AuthService }    from './auth.service';

// ── モックレスポンス定義 ──────────────────────────────────────────────────────

const MOCK_AUTH_RESPONSE = {
  accessToken: 'mock.access.token',
  user: { id: 'user-id-1', email: 'test@example.com', role: 'FREE' },
};

// ── モックサービス ────────────────────────────────────────────────────────────

const mockAuthService = {
  register: jest.fn(),
  login:    jest.fn(),
  refresh:  jest.fn(),
  logout:   jest.fn(),
};

// ── テストスイート ────────────────────────────────────────────────────────────

describe('Auth API 成立ライン', () => {
  let app: INestApplication;

  // ── setup ────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    })
      // ThrottlerGuard: レート制限をパス（テスト対象外）
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      // JwtAuthGuard: req.user を注入してコントローラが @CurrentUser() を読めるようにする
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { sub: 'test-user-id', email: 'test@example.com', role: 'FREE' };
        return true;
      }})
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

  // ── POST /auth/register ───────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('正常登録 → 201 + accessToken', async () => {
      mockAuthService.register.mockResolvedValue(MOCK_AUTH_RESPONSE);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com', password: 'Password123!' });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.accessToken).toBe('mock.access.token');
      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
    });

    it('重複メール → 409 ConflictException', async () => {
      mockAuthService.register.mockRejectedValue(
        new ConflictException('ALREADY_EXISTS'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'dup@example.com', password: 'Password123!' });

      expect(res.status).toBe(409);
    });

    it('パスワード 12 文字未満 → 400 バリデーションエラー', async () => {
      // ZodValidationPipe がリジェクトするので service は呼ばれない
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'short@example.com', password: 'Pass1' });

      expect(res.status).toBe(400);
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('メール形式不正 → 400 バリデーションエラー', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'Password123!' });

      expect(res.status).toBe(400);
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });
  });

  // ── POST /auth/login ──────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('正常ログイン → 200 + accessToken', async () => {
      mockAuthService.login.mockResolvedValue(MOCK_AUTH_RESPONSE);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('mock.access.token');
      expect(mockAuthService.login).toHaveBeenCalledTimes(1);
    });
  });

  // ── POST /auth/refresh ────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('正常リフレッシュ → 200 + accessToken', async () => {
      mockAuthService.refresh.mockResolvedValue({ accessToken: 'new.access.token' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh');

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('new.access.token');
    });
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('認証済み → 200', async () => {
      mockAuthService.logout.mockResolvedValue({ message: 'logged out' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer mock.access.token');

      expect(res.status).toBe(200);
    });
  });
});

// ── 401 ガードテスト（JwtAuthGuard 有効化で別モジュール） ───────────────────

describe('Auth API 認証ガード', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      // canActivate: () => false だと NestJS は 403 を返す。
      // 401 を返すには UnauthorizedException を throw する必要がある。
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => { throw new UnauthorizedException(); } })
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

  it('POST /auth/logout — JWT なし → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout');

    expect(res.status).toBe(401);
    expect(mockAuthService.logout).not.toHaveBeenCalled();
  });
});