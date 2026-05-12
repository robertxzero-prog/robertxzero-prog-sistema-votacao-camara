import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { WebsocketGateway } from './websocket.gateway';

@Module({
  imports: [
    PrismaModule,

    JwtModule.register({
      secret: 'camara-secret-key',
      signOptions: {
        expiresIn: '8h',
      },
    }),
  ],

  providers: [WebsocketGateway],
})
export class WebsocketModule {}