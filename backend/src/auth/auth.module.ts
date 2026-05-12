import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ConfiguracaoModule } from '../configuracao/configuracao.module';

const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '8h') as StringValue;

@Module({
  imports: [
    PrismaModule,
    AuditoriaModule,
    ConfiguracaoModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'camara-secret-key',
      signOptions: {
        expiresIn: jwtExpiresIn,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
