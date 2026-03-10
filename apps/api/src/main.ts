// apps/api/src/main.ts
import { NestFactory }   from '@nestjs/core';
import { AppModule }     from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => unknown;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Cookie パーサー（RefreshToken HttpOnly Cookie 用）
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin:         process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger（開発環境のみ）
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('FXDE API')
      .setVersion('5.1')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, doc);
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`FXDE API listening on port ${port}`);
}

bootstrap();