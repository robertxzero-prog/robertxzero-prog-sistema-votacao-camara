import { Module } from '@nestjs/common';

import { UsuariosModule } from './usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WebsocketModule } from './websocket/websocket.module';

import { SessoesModule } from './sessoes/sessoes.module';
import { PautasModule } from './pautas/pautas.module';
import { VotacoesModule } from './votacoes/votacoes.module';
import { PresencasModule } from './presencas/presencas.module';
import { AtasModule } from './atas/atas.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { ConfiguracaoModule } from './configuracao/configuracao.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsuariosModule,
    SessoesModule,
    PautasModule,
    VotacoesModule,
    PresencasModule,
    AuditoriaModule,
    ConfiguracaoModule,
    AtasModule,
    RelatoriosModule,
  ],
})
export class AppModule {}
