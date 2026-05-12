import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

import { AppModule } from './app.module';

function obterOrigensPermitidas() {
  const raw = process.env.CORS_ORIGINS?.trim();

  if (!raw) {
    return [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
  }

  if (raw === '*') {
    return ['*'];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const corsOrigens = obterOrigensPermitidas();

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (corsOrigens.includes('*')) {
        callback(null, true);
        return;
      }

      const permitido = corsOrigens.some((regra) => {
        if (typeof regra === 'string') {
          return regra === origin;
        }
        return regra.test(origin);
      });

      if (permitido) {
        callback(null, true);
        return;
      }

      callback(new Error('Origem nao permitida pelo CORS.'));
    },
    credentials: true,
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
}

bootstrap();
