import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { PresencasController } from './presencas.controller';
import { PresencasGateway } from './presencas.gateway';
import { PresencasService } from './presencas.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [PrismaModule, AuditoriaModule],

  controllers: [PresencasController],

  providers: [PresencasService, PresencasGateway],

  exports: [PresencasService, PresencasGateway],
})
export class PresencasModule {}
