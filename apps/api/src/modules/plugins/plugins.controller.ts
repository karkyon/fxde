/**
 * apps/api/src/modules/plugins/plugins.controller.ts
 *
 * Plugin System コントローラー
 *
 * 参照仕様:
 *   fxde_plugin_system_完全設計書 §7 API 設計 / §8 権限制御 / §20.3 Controller 仕様
 *   SPEC_v51_part4 §4.3（guard / decorator 規約）
 *   apps/api/src/main.ts → setGlobalPrefix('api/v1') 済みのため
 *   @Controller('plugins') とすること（'api/v1/plugins' は二重になるため禁止）
 *
 * RBAC:
 *   一覧 / 詳細 / source-preview / audit-logs: ログイン済み全ロール
 *   enable / disable:                           ADMIN のみ
 */

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PluginsService }    from './plugins.service';
import { GetPluginsQueryDto } from './dto/get-plugins.query.dto';
import { PluginIdParamDto }  from './dto/plugin-id.param.dto';
import { JwtAuthGuard }      from '../../common/guards/jwt-auth.guard';
import { RolesGuard }        from '../../common/guards/roles.guard';
import { Roles }             from '../../common/decorators/roles.decorator';
import { CurrentUser }       from '../../common/decorators/current-user.decorator';
import type { JwtPayload }   from '../../common/decorators/current-user.decorator';

@Controller('plugins')
@UseGuards(JwtAuthGuard)  // 全エンドポイントで JWT 必須
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  /**
   * GET /api/v1/plugins
   * プラグイン一覧取得（ログイン済み全ロール）
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  getPlugins(@Query() query: GetPluginsQueryDto) {
    return this.pluginsService.getPlugins(query);
  }

  /**
   * GET /api/v1/plugins/:pluginId
   * プラグイン詳細取得（ログイン済み全ロール）
   */
  @Get(':pluginId')
  @HttpCode(HttpStatus.OK)
  getPluginDetail(@Param() params: PluginIdParamDto) {
    return this.pluginsService.getPluginDetail(params.pluginId);
  }

  /**
   * GET /api/v1/plugins/:pluginId/source-preview
   * ソースプレビュー取得（ログイン済み全ロール）
   * ⚠️ readOnly: true 固定。このエンドポイントから編集 API は派生しない。
   */
  @Get(':pluginId/source-preview')
  @HttpCode(HttpStatus.OK)
  getSourcePreview(@Param() params: PluginIdParamDto) {
    return this.pluginsService.getSourcePreview(params.pluginId);
  }

  /**
   * POST /api/v1/plugins/:pluginId/enable
   * プラグイン有効化（ADMIN のみ）
   */
  @Post(':pluginId/enable')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  enablePlugin(
    @Param() params: PluginIdParamDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pluginsService.enablePlugin(params.pluginId, user.sub);
  }

  /**
   * POST /api/v1/plugins/:pluginId/disable
   * プラグイン無効化（ADMIN のみ）
   */
  @Post(':pluginId/disable')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  disablePlugin(
    @Param() params: PluginIdParamDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pluginsService.disablePlugin(params.pluginId, user.sub);
  }

  /**
   * GET /api/v1/plugins/:pluginId/audit-logs
   * 監査ログ取得（ログイン済み全ロール）
   */
  @Get(':pluginId/audit-logs')
  @HttpCode(HttpStatus.OK)
  getAuditLogs(@Param() params: PluginIdParamDto) {
    return this.pluginsService.getAuditLogs(params.pluginId);
  }
}