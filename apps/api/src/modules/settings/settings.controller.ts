// apps/api/src/modules/settings/settings.controller.ts
import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SettingsService }   from './settings.service';
import { UpdateSettingsDto, ApplyPresetDto } from './dto/settings.dto';
import { JwtAuthGuard }      from '../../common/guards/jwt-auth.guard';
import { CurrentUser }       from '../../common/decorators/current-user.decorator';
import type { JwtPayload }   from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** GET /api/v1/settings */
  @Get()
  @HttpCode(HttpStatus.OK)
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getSettings(user.sub);
  }

  /** PATCH /api/v1/settings */
  @Patch()
  @HttpCode(HttpStatus.OK)
  updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(user.sub, dto);
  }

  /** PATCH /api/v1/settings/preset */
  @Patch('preset')
  @HttpCode(HttpStatus.OK)
  applyPreset(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ApplyPresetDto,
  ) {
    return this.settingsService.applyPreset(user.sub, dto);
  }
}