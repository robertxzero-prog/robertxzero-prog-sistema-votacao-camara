import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tipo_voto, user_role, votacao_status } from '@prisma/client';
import { VotacoesGateway } from './votacoes.gateway';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuditoriaContexto } from '../auditoria/auditoria.types';
import { AtasService } from '../atas/atas.service';

@Injectable()
export class VotacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly votacoesGateway: VotacoesGateway,
    private readonly auditoriaService: AuditoriaService,
    private readonly atasService: AtasService,
  ) {}

  async listar() {
    return this.prisma.votacoes.findMany({
      orderBy: {
        aberta_em: 'desc',
      },
      include: {
        pautas: {
          include: {
            sessoes: true,
          },
        },
        usuarios: true,
        votos: {
          include: {
            vereadores: {
              include: {
                usuarios: true,
              },
            },
          },
        },
      },
    });
  }

  async buscarAtiva() {
    return this.prisma.votacoes.findFirst({
      where: {
        status: votacao_status.ABERTA,
      },
      include: {
        pautas: {
          include: {
            sessoes: true,
          },
        },
        usuarios: true,
        votos: {
          include: {
            vereadores: {
              include: {
                usuarios: true,
              },
            },
          },
        },
      },
      orderBy: {
        aberta_em: 'desc',
      },
    });
  }

  async abrir(
    pautaId: string,
    usuarioId?: string,
    contexto?: AuditoriaContexto,
  ) {
    const pauta = await this.prisma.pautas.findUnique({
      where: {
        id: pautaId,
      },
      include: {
        sessoes: true,
      },
    });

    if (!pauta) {
      throw new NotFoundException('Pauta não encontrada.');
    }

    if (pauta.sessoes?.etapa_atual !== 'ORDEM_DO_DIA') {
      throw new BadRequestException(
        'A votacao so pode ser aberta durante a etapa Ordem do Dia.',
      );
    }

    const regraQuorum = await this.calcularRegraQuorum(pauta.sessao_id);

    if (!regraQuorum.quorum_atingido) {
      throw new BadRequestException(
        `Quorum insuficiente para abrir votacao. Presentes: ${regraQuorum.presentes}/${regraQuorum.quorum_minimo}.`,
      );
    }

    let abertaPor = usuarioId;

    if (!abertaPor) {
      const admin = await this.prisma.usuarios.findFirst({
        where: {
          role: user_role.ADMIN,
        },
      });

      if (!admin) {
        throw new BadRequestException(
          'Nenhum usuário administrador encontrado para abrir a votação.',
        );
      }

      abertaPor = admin.id;
    }

    const votacaoAberta = await this.prisma.votacoes.findFirst({
      where: {
        status: votacao_status.ABERTA,
      },
    });

    if (votacaoAberta && votacaoAberta.pauta_id !== pautaId) {
      throw new BadRequestException(
        'Já existe uma votação aberta. Encerre a votação atual antes de abrir outra.',
      );
    }

    const votacaoExistente = await this.prisma.votacoes.findFirst({
      where: {
        pauta_id: pautaId,
      },
    });

    if (votacaoExistente) {
      if (votacaoExistente.status === votacao_status.ENCERRADA) {
        throw new BadRequestException('Esta pauta já possui votação encerrada.');
      }

      const votacaoAtualizada = await this.prisma.votacoes.update({
        where: {
          id: votacaoExistente.id,
        },
        data: {
          status: votacao_status.ABERTA,
          aberta_em: new Date(),
          encerrada_em: null,
          aberta_por: abertaPor,
        },
        include: {
          pautas: {
            include: {
              sessoes: true,
            },
          },
          usuarios: true,
          votos: {
            include: {
              vereadores: {
                include: {
                  usuarios: true,
                },
              },
            },
          },
        },
      });

      this.votacoesGateway.emitirVotacaoAtualizada(votacaoAtualizada);
      await this.auditoriaService.registrarEvento({
        acao: 'VOTACAO_ABERTA',
        entidade: 'votacao',
        entidadeId: votacaoAtualizada.id,
        detalhes: { pauta_id: pautaId, modo: 'reabertura' },
        contexto,
      });

      return votacaoAtualizada;
    }

    const votacaoCriada = await this.prisma.votacoes.create({
      data: {
        pauta_id: pautaId,
        status: votacao_status.ABERTA,
        aberta_em: new Date(),
        aberta_por: abertaPor,
      },
      include: {
        pautas: {
          include: {
            sessoes: true,
          },
        },
        usuarios: true,
        votos: {
          include: {
            vereadores: {
              include: {
                usuarios: true,
              },
            },
          },
        },
      },
    });

    this.votacoesGateway.emitirVotacaoAtualizada(votacaoCriada);
    await this.auditoriaService.registrarEvento({
      acao: 'VOTACAO_ABERTA',
      entidade: 'votacao',
      entidadeId: votacaoCriada.id,
      detalhes: { pauta_id: pautaId, modo: 'nova' },
      contexto,
    });

    return votacaoCriada;
  }

  async votar(
    votacaoId: string,
    voto: 'SIM' | 'NAO' | 'ABSTENCAO',
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

    if (!usuarioId) {
      throw new UnauthorizedException('Token sem usuário.');
    }

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

    if (!usuario.ativo) {
      throw new UnauthorizedException('Usuário inativo.');
    }

    if (!usuario.vereadores) {
      throw new BadRequestException('Usuário logado não é vereador.');
    }

    const vereadorId = usuario.vereadores.id;

    const votacao = await this.prisma.votacoes.findUnique({
      where: {
        id: votacaoId,
      },
    });

    if (!votacao) {
      throw new NotFoundException('Votação não encontrada.');
    }

    if (votacao.status !== votacao_status.ABERTA) {
      throw new BadRequestException('Esta votação não está aberta.');
    }

    const votoExistente = await this.prisma.votos.findFirst({
      where: {
        votacao_id: votacaoId,
        vereador_id: vereadorId,
      },
    });

    if (votoExistente) {
      throw new BadRequestException('Você já votou nesta votação.');
    }

    const votoCriado = await this.prisma.votos.create({
      data: {
        votacao_id: votacaoId,
        vereador_id: vereadorId,
        voto: voto as tipo_voto,
      },
      include: {
        vereadores: {
          include: {
            usuarios: true,
          },
        },
        votacoes: {
          include: {
            pautas: {
              include: {
                sessoes: true,
              },
            },
          },
        },
      },
    });

    const votacaoAtualizada = await this.buscarAtiva();

    this.votacoesGateway.emitirVotoRegistrado(votoCriado);
    this.votacoesGateway.emitirVotacaoAtualizada(votacaoAtualizada);
    await this.auditoriaService.registrarEvento({
      acao: 'VOTO_REGISTRADO',
      entidade: 'votacao',
      entidadeId: votacaoId,
      detalhes: {
        voto,
        vereador_id: vereadorId,
        voto_id: votoCriado.id,
      },
      contexto: {
        ...contexto,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        usuarioRole: usuario.role,
      },
    });

    return {
      message: 'Voto registrado com sucesso.',
      voto: votoCriado,
      votacao: votacaoAtualizada,
    };
  }

  async encerrar(id: string, contexto?: AuditoriaContexto) {
  const votacao = await this.prisma.votacoes.findUnique({
    where: {
      id,
    },
    include: {
      votos: true,
      pautas: true,
    },
  });

  if (!votacao) {
    throw new NotFoundException('Votação não encontrada.');
  }

  if (votacao.status === votacao_status.ENCERRADA) {
    throw new BadRequestException('Esta votação já está encerrada.');
  }

  const votosSim = votacao.votos.filter(
    (voto) => voto.voto === tipo_voto.SIM,
  ).length;

  const votosNao = votacao.votos.filter(
    (voto) => voto.voto === tipo_voto.NAO,
  ).length;

  const abstencoes = votacao.votos.filter(
    (voto) => voto.voto === tipo_voto.ABSTENCAO,
  ).length;

  const totalVotos = votacao.votos.length;

  const regraQuorum = await this.calcularRegraQuorum(votacao.pautas.sessao_id);
  const totalVereadores = regraQuorum.total_vereadores;
  const quorumMinimo = regraQuorum.quorum_minimo;
  const presentes = regraQuorum.presentes;
  const ausentes = regraQuorum.ausentes;

  const tipoMaioria = votacao.pautas.tipo_maioria || 'SIMPLES';

  let votosNecessarios = 0;
  let resultado: 'APROVADA' | 'REJEITADA' | 'EMPATE' | 'SEM_QUORUM';

  if (presentes < quorumMinimo) {
    votosNecessarios = quorumMinimo;
    resultado = 'SEM_QUORUM';
  } else if (tipoMaioria === 'ABSOLUTA') {
    votosNecessarios = quorumMinimo;
    resultado = votosSim >= votosNecessarios ? 'APROVADA' : 'REJEITADA';
  } else if (tipoMaioria === 'DOIS_TERCOS') {
    votosNecessarios = Math.ceil((totalVereadores * 2) / 3);
    resultado = votosSim >= votosNecessarios ? 'APROVADA' : 'REJEITADA';
  } else {
    votosNecessarios = Math.floor(presentes / 2) + 1;

    if (votosSim >= votosNecessarios) {
      resultado = 'APROVADA';
    } else if (votosSim === votosNao) {
      resultado = 'EMPATE';
    } else {
      resultado = 'REJEITADA';
    }
  }

  const votacaoEncerrada = await this.prisma.votacoes.update({
    where: {
      id,
    },
    data: {
      status: votacao_status.ENCERRADA,
      encerrada_em: new Date(),
    },
    include: {
      pautas: {
        include: {
          sessoes: true,
        },
      },
      usuarios: true,
      votos: {
        include: {
          vereadores: {
            include: {
              usuarios: true,
            },
          },
        },
      },
    },
  });

  const retorno = {
    votacao: votacaoEncerrada,
    resultado,
    regra: {
      tipo_maioria: tipoMaioria,
      total_vereadores: totalVereadores,
      presentes,
      ausentes,
      quorum_minimo: quorumMinimo,
      quorum_atingido: presentes >= quorumMinimo,
      votos_necessarios: votosNecessarios,
    },
    totais: {
      sim: votosSim,
      nao: votosNao,
      abstencao: abstencoes,
      total: totalVotos,
    },
  };

  this.votacoesGateway.emitirVotacaoEncerrada(retorno);
  this.votacoesGateway.emitirVotacaoAtualizada(null);
  await this.atasService.registrarAssinaturaOficial(
    votacaoEncerrada.id,
    contexto?.usuarioId || null,
  );
  await this.auditoriaService.registrarEvento({
    acao: 'VOTACAO_ENCERRADA',
    entidade: 'votacao',
    entidadeId: id,
    detalhes: {
      resultado,
      totais: retorno.totais,
      regra: retorno.regra,
    },
    contexto,
  });

  return retorno;
}

  private async calcularRegraQuorum(sessaoId: string) {
    const [presentes, totalVereadores] = await Promise.all([
      this.prisma.presencas.count({
        where: {
          sessao_id: sessaoId,
        },
      }),
      this.prisma.vereadores.count({
        where: {
          usuarios: {
            ativo: true,
          },
          cadeiras: {
            ativa: true,
          },
        },
      }),
    ]);

    const quorumMinimo = Math.floor(totalVereadores / 2) + 1;

    return {
      presentes,
      ausentes: Math.max(0, totalVereadores - presentes),
      total_vereadores: totalVereadores,
      quorum_minimo: quorumMinimo,
      quorum_atingido: presentes >= quorumMinimo,
    };
  }
}
