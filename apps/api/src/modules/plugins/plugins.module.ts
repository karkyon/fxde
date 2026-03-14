/**
 * apps/api/src/modules/plugins/plugins.module.ts
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §20.3 Module 構成
 *           既存 Module パターン（SnapshotsModule, SignalsModule 等）に準拠
 */

import { Module }            from '@nestjs/common';
import { PluginsController } from './plugins.controller';
import { PluginsService }    from './plugins.service';
import { PluginsRegistry }   from './plugins.registry';
import { PrismaModule }      from '../../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [PluginsController],
  providers:   [PluginsService, PluginsRegistry],
  exports:     [PluginsService, PluginsRegistry],
})
export class PluginsModule {}