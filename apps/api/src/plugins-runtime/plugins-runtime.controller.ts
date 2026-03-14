/**
 * apps/api/src/plugins-runtime/plugins-runtime.controller.ts
 *
 * Plugin Runtime API コントローラー
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §7「API 契約」
 *   fxde_plugin_runtime_完全設計書 §7.3「認証/権限」
 *
 * エンドポイント:
 *   GET /api/v1/plugins-runtime/chart   全ロール（認証必須）
 *
 * 権限:
 *   - 認証必須（JwtAuthGuard）
 *   - Chart ページ自体は全ロールアクセス可
 *   - plugin ごとの公開可否は Resolver / plugin 定義で制御
 *   - v1 MVP の Supply Demand Zones PRO は全ロール可（isEnabled=true であれば返す）
 *
 * 注意:
 *   - @Controller('plugins-runtime') → /api/v1/plugins-runtime/* となる
 *     （AppModule の setGlobalPrefix('api/v1') 適用済みのため）
 *   - 既存 /api/v1/chart/* エンドポイントは一切変更しない
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PluginsRuntimeService } from './plugins-runtime.service';
import { GetChartPluginRuntimeQueryDto } from './dto/get-chart-plugin-runtime.query.dto';
import { JwtAuthGuard }   from '../common/guards/jwt-auth.guard';
import { CurrentUser }    from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type { UserRole } from '@fxde/types';

@Controller('plugins-runtime')
@UseGuards(JwtAuthGuard)  // 全エンドポイントで JWT 必須
export class PluginsRuntimeController {
  constructor(private readonly runtimeService: PluginsRuntimeService) {}

  /**
   * GET /api/v1/plugins-runtime/chart
   *
   * 有効化された plugin の chart runtime 結果を返す。
   * overlay / signal / indicator / pluginStatuses を含む。
   *
   * 個別 plugin 失敗時は pluginStatuses[].status = 'FAILED' / 'TIMEOUT' で表現し、
   * API 全体は 200 を返す。
   * coordinator 自体が組み立て不能な場合のみ 5xx。
   */
  @Get('chart')
  @HttpCode(HttpStatus.OK)
  async getChartRuntime(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetChartPluginRuntimeQueryDto,
  ) {
    return this.runtimeService.getChartRuntime({
      userId:    user.sub,
      role:      user.role as UserRole,
      symbol:    query.symbol,
      timeframe: query.timeframe,
    });
  }
}