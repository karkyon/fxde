// apps/api/src/modules/settings/settings.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateSettingsDto, ApplyPresetDto } from '@fxde/types';
import { PRESET_DEFAULTS, PRESET_THRESHOLDS }     from './preset.constants';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────
  // GET /settings
  // ────────────────────────────────────────────
  async getSettings(userId: string) {
    const settings = await this.prisma.userSetting.findUnique({
      where: { userId },
    });
    if (!settings) throw new NotFoundException('SETTINGS_NOT_FOUND');
    return settings;
  }

  // ────────────────────────────────────────────
  // PATCH /settings
  // ────────────────────────────────────────────
  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    await this._ensureExists(userId);

    return this.prisma.userSetting.update({
      where: { userId },
      data: {
        ...(dto.preset          !== undefined && { preset: dto.preset }),
        ...(dto.scoreThreshold  !== undefined && { scoreThreshold: dto.scoreThreshold }),
        ...(dto.riskProfile     !== undefined && { riskProfile: dto.riskProfile }),
        ...(dto.uiPrefs         !== undefined && { uiPrefs: dto.uiPrefs }),
        ...(dto.featureSwitches !== undefined && { featureSwitches: dto.featureSwitches }),
        ...(dto.forceLock       !== undefined && { forceLock: dto.forceLock }),
      },
    });
  }

  // ────────────────────────────────────────────
  // PATCH /settings/preset
  // ────────────────────────────────────────────
  async applyPreset(userId: string, dto: ApplyPresetDto) {
    await this._ensureExists(userId);

    const riskProfile     = PRESET_DEFAULTS[dto.preset];
    const scoreThreshold  = PRESET_THRESHOLDS[dto.preset];

    return this.prisma.userSetting.update({
      where: { userId },
      data: {
        preset: dto.preset,
        scoreThreshold,
        riskProfile,
      },
    });
  }

  // ────────────────────────────────────────────
  // private
  // ────────────────────────────────────────────
  private async _ensureExists(userId: string): Promise<void> {
    const exists = await this.prisma.userSetting.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('SETTINGS_NOT_FOUND');
  }
}