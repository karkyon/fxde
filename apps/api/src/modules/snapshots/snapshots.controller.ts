import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SnapshotsService } from './snapshots.service';
import {
  GetSnapshotsQueryDto,
  GetSnapshotsLatestQueryDto,
} from './dto/snapshots.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('snapshots')
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  /**
   * GET /api/v1/snapshots/latest
   * 最新スナップショット（ポーリング用）。
   * 注意: NestJS はルート順解決のため、:id より先に定義する必要がある。
   */
  @Get('latest')
  async getLatest(
    @Request() req: { user: { id: string } },
    @Query() query: GetSnapshotsLatestQueryDto,
  ) {
    return this.snapshotsService.getLatest(req.user.id, query);
  }

  /**
   * GET /api/v1/snapshots
   * スナップショット履歴一覧（ページネーション + フィルター）。
   */
  @Get()
  async getList(
    @Request() req: { user: { id: string } },
    @Query() query: GetSnapshotsQueryDto,
  ) {
    return this.snapshotsService.getList(req.user.id, query);
  }
}