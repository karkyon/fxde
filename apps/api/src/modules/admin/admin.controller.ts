/**
 * apps/api/src/modules/admin/admin.controller.ts
 *
 * 参照仕様: SPEC_v51_part3 §13「管理者 API」
 *
 * エンドポイント（全 ADMIN のみ）:
 *   GET   /api/v1/admin/users            全ユーザー一覧
 *   GET   /api/v1/admin/users/:id        ユーザー詳細
 *   PATCH /api/v1/admin/users/:id/role   ロール変更（ADMIN への昇格は DB 直接操作のみ）
 *   GET   /api/v1/admin/audit-logs       監査ログ一覧
 */
import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /api/v1/admin/users
   * 全ユーザー一覧（ADMIN のみ）
   * 参照: SPEC_v51_part3 §13
   */
  @Get('users')
  @HttpCode(HttpStatus.OK)
  getUsers(
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getUsers({
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * GET /api/v1/admin/users/:id
   * ユーザー詳細（ADMIN のみ）
   * 参照: SPEC_v51_part3 §13
   */
  @Get('users/:id')
  @HttpCode(HttpStatus.OK)
  getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  /**
   * PATCH /api/v1/admin/users/:id/role
   * ロール変更（ADMIN のみ）
   * role: FREE | BASIC | PRO | PRO_PLUS のみ設定可。
   * ADMIN への昇格は DB 直接操作のみ（このAPIでは不可）。
   * 参照: SPEC_v51_part3 §13
   */
  @Patch('users/:id/role')
  @HttpCode(HttpStatus.OK)
  updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('role') role: string,
  ) {
    return this.adminService.updateUserRole(id, role);
  }

  /**
   * GET /api/v1/admin/audit-logs
   * 監査ログ一覧（ADMIN のみ）
   * 参照: SPEC_v51_part3 §13
   */
  @Get('audit-logs')
  @HttpCode(HttpStatus.OK)
  getAuditLogs(
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAuditLogs({
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}