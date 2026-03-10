import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Domain modules are registered here as they are implemented (Phase3)
// Stub imports ensure app compiles from Phase1 onwards.

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
