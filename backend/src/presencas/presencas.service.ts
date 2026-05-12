import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PresencasGateway } from './presencas.gateway';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuditoriaContexto } from '../auditoria/auditoria.types';

@Injectable()
export class PresencasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presencasGateway: PresencasGateway,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async confirmarPresenca(
    sessaoId: string,
    authorization: string,
    contexto?: AuditoriaContexto,
  ) {
    if (!authorization) {
      throw new UnauthorizedException('Token não informado.');
    }

    const partes = authorization.split(' ');

    if (partes.length !== 2 || partes[0] !== 'Bearer') {
      throw new UnauthorizedException('Token inválido.');
    }

    const token = partes[1];

    let payload: any;

    try {
      payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf-8'),
      );
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }

    const usuarioId = payload.userId || payload.sub;

    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: usuarioId,
      },

      include: {
        vereadores: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (!usuario.vereadores) {
      throw new BadRequestException('Usuário não é vereador.');
    }

    const sessao = await this.prisma.sessoes.findUnique({
      where: {
        id: sessaoId,
      },
    });

    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada.');
    }

    const presencaExistente = await this.prisma.presencas.findFirst({
      where: {
        sessao_id: sessaoId,
        vereador_id: usuario.vereadores.id,
      },
    });

    if (presencaExistente) {
      const quorum = await this.calcularQuorum(sessaoId);

      this.presencasGateway.emitirPresencaAtualizada({
        sessao_id: sessaoId,
        quorum,
        presenca: presencaExistente,
      });

      return {
        ok: true,
        mensagem: 'Presença já confirmada.',
        presenca: presencaExistente,
      };
    }

    const presenca = await this.prisma.presencas.create({
      data: {
        sessao_id: sessaoId,
        vereador_id: usuario.vereadores.id,
      },

      include: {
        vereadores: {
          include: {
            usuarios: true,
          },
        },

        sessoes: true,
      },
    });

    const quorum = await this.calcularQuorum(sessaoId);

    this.presencasGateway.emitirPresencaAtualizada({
      sessao_id: sessaoId,
      quorum,
      presenca,
    });
    await this.auditoriaService.registrarEvento({
      acao: 'PRESENCA_CONFIRMADA',
      entidade: 'sessao',
      entidadeId: sessaoId,
      detalhes: {
        presenca_id: presenca.id,
        vereador_id: usuario.vereadores.id,
      },
      contexto: {
        ...contexto,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        usuarioRole: usuario.role,
      },
    });

    return {
      ok: true,
      mensagem: 'Presença confirmada com sucesso.',
      presenca,
    };
  }

  async listarPresencas(sessaoId: string) {
    const presencas = await this.prisma.presencas.findMany({
      where: {
        sessao_id: sessaoId,
      },

      include: {
        vereadores: {
          include: {
            usuarios: true,
            cadeiras: true,
          },
        },
      },

      orderBy: {
        presente_em: 'asc',
      },
    });

    return presencas;
  }

  async calcularQuorum(sessaoId: string) {
    const totalPresentes = await this.prisma.presencas.count({
      where: {
        sessao_id: sessaoId,
      },
    });

    const totalVereadores = 9;

    const minimoMaioriaSimples = 5;

    return {
      presentes: totalPresentes,

      ausentes: totalVereadores - totalPresentes,

      total_vereadores: totalVereadores,

      quorum_minimo: minimoMaioriaSimples,

      quorum_atingido: totalPresentes >= minimoMaioriaSimples,
    };
  }
}
