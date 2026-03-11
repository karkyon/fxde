import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SignalsService } from './signals.service';
import { GetSignalsQueryDto, GetLatestSignalQueryDto } from './dto/signals.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('signals')
@UseGuards(JwtAuthGuard)
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  /**
   * GET /api/v1/signals
   * Signals 一覧取得（pagination）
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Query() query: GetSignalsQueryDto) {
    return this.signalsService.findAll(query);
  }

  /**
   * GET /api/v1/signals/latest
   * 最新 Signal 取得
   * データ無し → 404
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  findLatest(@Query() query: GetLatestSignalQueryDto) {
    return this.signalsService.findLatest(query);
  }
}
