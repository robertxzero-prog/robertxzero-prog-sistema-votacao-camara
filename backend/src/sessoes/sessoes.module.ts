import { Module } from '@nestjs/common';

import { SessoesController } from './sessoes.controller';
import { SessoesService } from './sessoes.service';

import { PrismaModule } from '../prisma/prisma.module';
import { PresencasModule } from '../presencas/presencas.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [PrismaModule, PresencasModule, AuditoriaModule],

  controllers: [SessoesController],

  providers: [SessoesService],
})
export class SessoesModule {}
