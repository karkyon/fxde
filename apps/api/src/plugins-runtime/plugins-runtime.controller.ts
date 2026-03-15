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
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,            // [DEBUG] 追加
} from '@nestjs/common';
import { PluginsRuntimeService } from './plugins-runtime.service';
import { GetChartPluginRuntimeQueryDto } from './dto/get-chart-plugin-runtime.query.dto';
import { JwtAuthGuard }   from '../common/guards/jwt-auth.guard';
import { CurrentUser }    from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type { UserRole } from '@fxde/types';

@Controller('plugins-runtime')
@UseGuards(JwtAuthGuard)
export class PluginsRuntimeController {
  // [DEBUG] logger 追加
  private readonly logger = new Logger(PluginsRuntimeController.name);

  constructor(private readonly runtimeService: PluginsRuntimeService) {}

  /**
   * GET /api/v1/plugins-runtime/chart
   */
  @Get('chart')
  @HttpCode(HttpStatus.OK)
  async getChartRuntime(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetChartPluginRuntimeQueryDto,
  ) {
    // [DEBUG] controller 到達確認
    this.logger.debug('[PluginsRuntimeController] request received');
    // [DEBUG] query パラメータ
    this.logger.debug('[PluginsRuntimeController] query', {
      symbol:    query.symbol,
      timeframe: query.timeframe,
    });
    // [DEBUG] 認証済みユーザー情報
    this.logger.debug('[PluginsRuntimeController] user', {
      userId: user.sub,
      email:  user.email,
      role:   user.role,
    });

    const result = await this.runtimeService.getChartRuntime({
      userId:    user.sub,
      role:      user.role as UserRole,
      symbol:    query.symbol,
      timeframe: query.timeframe,
    });

    // [DEBUG] service 戻り値サマリー
    this.logger.debug('[PluginsRuntimeController] result summary', {
      overlays:      result.overlays.length,
      signals:       result.signals.length,
      indicators:    result.indicators.length,
      pluginStatuses: result.pluginStatuses.length,
    });

    return result;
  }
}