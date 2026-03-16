import { Module }           from '@nestjs/common';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService }    from './snapshots.service';
import { PrismaModule }        from '../../prisma/prisma.module';
import { SettingsModule }      from '../settings/settings.module';

@Module({
  imports:     [PrismaModule, SettingsModule],
  controllers: [SnapshotsController],
  providers:   [SnapshotsService],
  exports:     [SnapshotsService],
})
export class SnapshotsModule {}