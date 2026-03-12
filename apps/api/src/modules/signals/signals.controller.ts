// apps/api/src/modules/signals/signals.controller.ts
//
// 変更内容:
//   [Task1] Patch import 削除（@Patch デコレータは未使用だったため）
//   [Task2] GET /signals/latest エンドポイント削除
//           → SPEC_v51_part10 §6.5 正本に存在しない
//           → findLatest() メソッド / @Get('latest') / GetLatestSignalQueryDto import をすべて削除
//
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SignalsService }     from './signals.service';
import { GetSignalsQueryDto } from './dto/signals.dto';
import { JwtAuthGuard }       from '../../common/guards/jwt-auth.guard';
import { CurrentUser }        from '../../common/decorators/current-user.decorator';
import type { JwtPayload }    from '../../common/decorators/current-user.decorator';

@Controller('signals')
@UseGuards(JwtAuthGuard)
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  /**
   * GET /api/v1/signals
   * シグナル一覧取得（ページネーション・フィルター）
   * 参照: SPEC_v51_part10 §6.5（正本）
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetSignalsQueryDto,
  ) {
    return this.signalsService.findAll(user.sub, query);
  }

  /**
   * POST /api/v1/signals/:id/ack
   * シグナル確認済み登録（acknowledgedAt を現在時刻にセット）
   * 参照: SPEC_v51_part10 §6.5（正本）
   */
  @Post(':id/ack')
  @HttpCode(HttpStatus.OK)
  acknowledge(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.signalsService.acknowledge(user.sub, id);
  }
}