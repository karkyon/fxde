// apps/api/src/app.module.ts
import { Module }          from '@nestjs/common';
import { ConfigModule }    from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule }    from './prisma/prisma.module';
import { AuthModule }      from './modules/auth/auth.module';
import { UsersModule }     from './modules/users/users.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'global',  ttl: 60_000, limit: 120 },
      { name: 'auth',    ttl: 60_000, limit: 10  },
      { name: 'capture', ttl: 60_000, limit: 20  },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    SettingsModule,
  ],
})
export class AppModule {}