/**
 * apps/api/src/common/middleware/http-logger.middleware.ts
 *
 * HTTP リクエストログ Middleware
 * SPEC_v51_part4 §7.3 ロギング方針準拠
 *
 * 必ずログに含める項目:
 *   - requestId（UUID / X-Request-ID ヘッダー）
 *   - userId（JWT 認証済みリクエスト）
 *   - action（method + path）
 *   - duration（処理時間 ms）
 *
 * ⚠ ログに含めてはいけない項目（PII）:
 *   password / refresh_token / access_token
 */

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction }     from 'express';
import { randomUUID }                          from 'crypto';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    const startAt   = Date.now();

    // X-Request-ID をレスポンスヘッダーに付与（フロントデバッグ用）
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - startAt;
      const userId   = (req as Request & { user?: { sub?: string } }).user?.sub ?? 'anonymous';
      const { method, originalUrl, ip } = req;
      const { statusCode } = res;

      // PII を含まないフォーマットで出力
      const message = `[${requestId}] ${method} ${originalUrl} ${statusCode} ${duration}ms uid=${userId} ip=${ip}`;

      if (statusCode >= 500) {
        this.logger.error(message);
      } else if (statusCode >= 400) {
        this.logger.warn(message);
      } else {
        this.logger.log(message);
      }
    });

    next();
  }
}