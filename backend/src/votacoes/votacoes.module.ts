import { Module } from '@nestjs/common';
import { VotacoesController } from './votacoes.controller';
import { VotacoesService } from './votacoes.service';
import { VotacoesGateway } from './votacoes.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AtasModule } from '../atas/atas.module';

@Module({
  imports: [PrismaModule, AuditoriaModule, AtasModule],
  controllers: [VotacoesController],
  providers: [VotacoesService, VotacoesGateway, PrismaService],
})
export class VotacoesModule {}
