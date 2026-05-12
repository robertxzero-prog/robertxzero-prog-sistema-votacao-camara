import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreatePautaDto } from './dto/create-pauta.dto';
import { UpdatePautaDto } from './dto/update-pauta.dto';

@Injectable()
export class PautasService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.pautas.findMany({
      include: {
        sessoes: {
          select: {
            id: true,
            titulo: true,
          },
        },

        usuarios: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },

        votacoes: {
          select: {
            id: true,
            status: true,
            aberta_em: true,
            encerrada_em: true,
          },
          orderBy: {
            aberta_em: 'desc',
          },
        },

        _count: {
          select: {
            votacoes: true,
          },
        },
      },

      orderBy: [
        {
          numero_ordem: 'asc',
        },
      ],
    });
  }

  async criarPauta(usuarioId: string, data: CreatePautaDto) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: {
        id: data.sessao_id,
      },
    });

    if (!sessao) {
      return {
        ok: false,
        mensagem: 'Sessão não encontrada',
      };
    }

    const pautaExistente = await this.prisma.pautas.findFirst({
      where: {
        sessao_id: data.sessao_id,
        numero_ordem: data.numero_ordem,
      },
    });

    if (pautaExistente) {
      return {
        ok: false,
        mensagem: 'Já existe uma pauta com essa ordem nesta sessão',
      };
    }

    const pauta = await this.prisma.pautas.create({
      data: {
        sessao_id: data.sessao_id,
        numero_ordem: data.numero_ordem,
        titulo: data.titulo,
        descricao: data.descricao,
        tipo_maioria: data.tipo_maioria,
        autor_id: usuarioId,
      },
    });

    return {
      ok: true,
      pauta,
    };
  }

  async atualizarPauta(pautaId: string, data: UpdatePautaDto) {
    const pauta = await this.prisma.pautas.findUnique({
      where: {
        id: pautaId,
      },
    });

    if (!pauta) {
      return {
        ok: false,
        mensagem: 'Pauta não encontrada',
      };
    }

    await this.prisma.pautas.update({
      where: {
        id: pautaId,
      },

      data: {
        sessao_id: data.sessao_id,
        numero_ordem: data.numero_ordem,
        titulo: data.titulo,
        descricao: data.descricao,
        tipo_maioria: data.tipo_maioria,
      },
    });

    return {
      ok: true,
      mensagem: 'Pauta atualizada com sucesso',
    };
  }

  async excluirPauta(pautaId: string) {
    const pauta = await this.prisma.pautas.findUnique({
      where: {
        id: pautaId,
      },
    });

    if (!pauta) {
      return {
        ok: false,
        mensagem: 'Pauta não encontrada',
      };
    }

    await this.prisma.votos.deleteMany({
      where: {
        votacoes: {
          pauta_id: pautaId,
        },
      },
    });

    await this.prisma.votacoes.deleteMany({
      where: {
        pauta_id: pautaId,
      },
    });

    await this.prisma.pautas.delete({
      where: {
        id: pautaId,
      },
    });

    return {
      ok: true,
      mensagem: 'Pauta removida com sucesso',
    };
  }
}
