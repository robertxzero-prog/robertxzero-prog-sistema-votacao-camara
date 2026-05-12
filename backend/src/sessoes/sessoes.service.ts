import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PresencasGateway } from '../presencas/presencas.gateway';
import { AuditoriaService } from '../auditoria/auditoria.service';

import { CreateSessaoDto } from './dto/create-sessao.dto';
import { UpdateSessaoDto } from './dto/update-sessao.dto';
import { EtapaSessaoDto } from './dto/update-etapa-sessao.dto';
import { TipoFalaSessaoDto } from './dto/update-orador-sessao.dto';
import { AuditoriaContexto } from '../auditoria/auditoria.types';

@Injectable()
export class SessoesService implements OnModuleInit, OnModuleDestroy {
  private monitorFalasTimer: NodeJS.Timeout | null = null;
  private monitorFalasRodando = false;

  constructor(
    private prisma: PrismaService,
    private presencasGateway: PresencasGateway,
    private auditoriaService: AuditoriaService,
  ) {}

  onModuleInit() {
    this.monitorFalasTimer = setInterval(() => {
      this.monitorarExpiracaoFalas().catch(() => undefined);
    }, 1500);
  }

  onModuleDestroy() {
    if (this.monitorFalasTimer) {
      clearInterval(this.monitorFalasTimer);
      this.monitorFalasTimer = null;
    }
  }

  async findAll() {
    return this.prisma.sessoes.findMany({
      include: {
        usuarios: {
          select: {
            nome: true,
          },
        },

        _count: {
          select: {
            pautas: true,
          },
        },
      },

      orderBy: {
        criado_em: 'desc',
      },
    });
  }

  async criarSessao(
    usuarioId: string,
    data: CreateSessaoDto,
  ) {
    const sessao = await this.prisma.sessoes.create({
      data: {
        titulo: data.titulo,
        descricao: data.descricao,
        data_sessao: new Date(data.data_sessao),
        criada_por: usuarioId,
      },
    });

    if (data.fila_planejada?.length) {
      const agora = Date.now();
      await this.prisma.fila_oradores.createMany({
        data: data.fila_planejada.map((item, idx) => ({
          sessao_id: sessao.id,
          vereador_id: item.vereador_id,
          tipo_fala: item.tipo_fala as any,
          status: 'PENDENTE',
          solicitada_em: new Date(agora + idx),
        })),
      });
    }

    return {
      ok: true,
      sessao,
    };
  }

  async atualizarSessao(
    sessaoId: string,
    data: UpdateSessaoDto,
  ) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: {
        id: sessaoId,
      },
    });

    if (!sessao) {
      return {
        ok: false,
        mensagem: 'Sessão não encontrada',
      };
    }

    await this.prisma.sessoes.update({
      where: {
        id: sessaoId,
      },

      data: {
        titulo: data.titulo,
        descricao: data.descricao,
        data_sessao: new Date(data.data_sessao),

        status: data.status,
      },
    });

    return {
      ok: true,
      mensagem: 'Sessão atualizada com sucesso',
    };
  }

  async excluirSessao(
    sessaoId: string,
  ) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: {
        id: sessaoId,
      },
    });

    if (!sessao) {
      return {
        ok: false,
        mensagem: 'Sessão não encontrada',
      };
    }

    const votacoes = await this.prisma.votacoes.findMany({
      where: { pautas: { sessao_id: sessaoId } },
      select: { id: true },
    });
    const votacaoIds = votacoes.map((v) => v.id);

    if (votacaoIds.length > 0) {
      await this.prisma.votos.deleteMany({
        where: { votacao_id: { in: votacaoIds } },
      });
    }

    await this.prisma.votacoes.deleteMany({
      where: { pautas: { sessao_id: sessaoId } },
    });

    await this.prisma.fila_oradores.deleteMany({
      where: { sessao_id: sessaoId },
    });

    await this.prisma.presencas.deleteMany({
      where: { sessao_id: sessaoId },
    });

    await this.prisma.pautas.deleteMany({
      where: {
        sessao_id: sessaoId,
      },
    });

    await this.prisma.sessoes.delete({
      where: {
        id: sessaoId,
      },
    });

    return {
      ok: true,
      mensagem: 'Sessão removida com sucesso',
    };
  }

  async encerrarSessao(sessaoId: string, contexto?: AuditoriaContexto) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: {
        id: true,
        etapa_atual: true,
        status: true,
        titulo: true,
      },
    });

    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada.' };
    }

    if (sessao.status === 'ENCERRADA') {
      return { ok: true, mensagem: 'Sessao ja encerrada.' };
    }

    if (sessao.etapa_atual !== 'ENCERRAMENTO') {
      return {
        ok: false,
        mensagem: 'A sessao so pode ser encerrada na etapa ENCERRAMENTO.',
      };
    }

    await this.prisma.fila_oradores.updateMany({
      where: {
        sessao_id: sessaoId,
        status: { in: ['PENDENTE', 'CHAMADO'] },
      },
      data: { status: 'ENCERRADO' },
    });

    await this.prisma.sessoes.update({
      where: { id: sessaoId },
      data: {
        status: 'ENCERRADA',
        hora_fim: new Date(),
        orador_vereador_id: null,
        orador_tipo_fala: null,
        orador_duracao_segundos: null,
        orador_inicio_em: null,
      },
    });

    this.presencasGateway.emitirOradorSessaoAtualizado({
      ok: true,
      sessao_id: sessao.id,
      titulo: sessao.titulo,
      orador: null,
    });
    this.presencasGateway.emitirFilaOradoresAtualizada(
      await this.listarFilaOradores(sessaoId),
    );

    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_ENCERRADA',
      entidade: 'sessao',
      entidadeId: sessaoId,
      contexto,
    });

    return { ok: true, mensagem: 'Sessao encerrada com sucesso.' };
  }

  async buscarEtapaAtual(sessaoId: string) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: {
        id: true,
        etapa_atual: true,
        etapa_titulo: true,
        etapa_descricao: true,
        titulo: true,
      },
    });

    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada' };
    }

    return {
      ok: true,
      sessao_id: sessao.id,
      titulo: sessao.titulo,
      etapa: sessao.etapa_atual || 'ABERTURA',
      etapa_titulo: sessao.etapa_titulo,
      etapa_descricao: sessao.etapa_descricao,
    };
  }

  async atualizarEtapaAtual(
    sessaoId: string,
    etapa: EtapaSessaoDto,
    etapaTitulo?: string,
    etapaDescricao?: string,
    contexto?: AuditoriaContexto,
  ) {
    const etapasValidas: EtapaSessaoDto[] = [
      'ABERTURA',
      'LEITURA_BIBLICA',
      'CHAMADA_VEREADORES',
      'VERIFICACAO_QUORUM',
      'LEITURA_EXPEDIENTE',
      'PEQUENAS_COMUNICACOES',
      'GRANDE_EXPEDIENTE',
      'ORDEM_DO_DIA',
      'RESULTADO',
      'EXPLICACOES_PESSOAIS',
      'ENCERRAMENTO',
    ];

    if (!etapasValidas.includes(etapa)) {
      return { ok: false, mensagem: 'Etapa invalida' };
    }

    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { id: true, titulo: true },
    });

    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada' };
    }

    const atualizada = await this.prisma.sessoes.update({
      where: { id: sessaoId },
      data: {
        etapa_atual: etapa,
        etapa_titulo: etapaTitulo?.trim() || null,
        etapa_descricao: etapaDescricao?.trim() || null,
      },
      select: {
        id: true,
        titulo: true,
        etapa_atual: true,
        etapa_titulo: true,
        etapa_descricao: true,
      },
    });

    const payload = {
      sessao_id: atualizada.id,
      titulo: atualizada.titulo,
      etapa: atualizada.etapa_atual,
      etapa_titulo: atualizada.etapa_titulo,
      etapa_descricao: atualizada.etapa_descricao,
    };

    this.presencasGateway.emitirEtapaSessaoAtualizada(payload);

    if (
      ['PEQUENAS_COMUNICACOES', 'GRANDE_EXPEDIENTE', 'ORDEM_DO_DIA', 'EXPLICACOES_PESSOAIS'].includes(
        etapa,
      )
    ) {
      await this.chamarProximoAutomaticoSeDisponivel(sessaoId, etapa as TipoFalaSessaoDto);
    }

    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_ETAPA_ATUALIZADA',
      entidade: 'sessao',
      entidadeId: sessaoId,
      detalhes: {
        etapa,
        etapa_titulo: atualizada.etapa_titulo,
        etapa_descricao: atualizada.etapa_descricao,
      },
      contexto,
    });

    return { ok: true, ...payload };
  }

  async buscarOradorAtual(sessaoId: string) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: {
        id: true,
        titulo: true,
        orador_tipo_fala: true,
        orador_duracao_segundos: true,
        orador_inicio_em: true,
        orador_vereador: {
          select: {
            id: true,
            partido: true,
            usuarios: {
              select: {
                id: true,
                nome: true,
                foto_url: true,
              },
            },
            cadeiras: {
              select: {
                numero: true,
              },
            },
          },
        },
      },
    });

    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada' };
    }

    return {
      ok: true,
      sessao_id: sessao.id,
      titulo: sessao.titulo,
      tipo_fala: sessao.orador_tipo_fala,
      duracao_segundos: sessao.orador_duracao_segundos,
      inicio_em: sessao.orador_inicio_em,
      orador: sessao.orador_vereador
        ? {
            vereador_id: sessao.orador_vereador.id,
            usuario_id: sessao.orador_vereador.usuarios.id,
            nome: sessao.orador_vereador.usuarios.nome,
            foto_url: sessao.orador_vereador.usuarios.foto_url,
            partido: sessao.orador_vereador.partido,
            cadeira: sessao.orador_vereador.cadeiras.numero,
          }
        : null,
    };
  }

  async atualizarOradorAtual(
    sessaoId: string,
    vereadorId: string,
    tipoFala: TipoFalaSessaoDto,
    duracaoSegundos?: number,
    contexto?: AuditoriaContexto,
  ) {
    const tiposValidos: TipoFalaSessaoDto[] = [
      'PEQUENAS_COMUNICACOES',
      'GRANDE_EXPEDIENTE',
      'ORDEM_DO_DIA',
      'EXPLICACOES_PESSOAIS',
    ];

    if (!tiposValidos.includes(tipoFala)) {
      return { ok: false, mensagem: 'Tipo de fala invalido' };
    }

    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { id: true, titulo: true },
    });

    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada' };
    }

    const vereador = await this.prisma.vereadores.findUnique({
      where: { id: vereadorId },
      select: {
        id: true,
        partido: true,
        usuarios: {
          select: {
            id: true,
            nome: true,
            foto_url: true,
          },
        },
        cadeiras: {
          select: {
            numero: true,
          },
        },
      },
    });

    if (!vereador) {
      return { ok: false, mensagem: 'Vereador nao encontrado' };
    }

    const duracaoPadrao = {
      PEQUENAS_COMUNICACOES: 5 * 60,
      GRANDE_EXPEDIENTE: 15 * 60,
      ORDEM_DO_DIA: 5 * 60,
      EXPLICACOES_PESSOAIS: 3 * 60,
    }[tipoFala];

    const duracaoFinal =
      typeof duracaoSegundos === 'number' && duracaoSegundos > 0
        ? duracaoSegundos
        : duracaoPadrao;

    await this.prisma.sessoes.update({
      where: { id: sessaoId },
      data: {
        orador_vereador_id: vereadorId,
        orador_tipo_fala: tipoFala as any,
        orador_duracao_segundos: duracaoFinal,
        orador_inicio_em: new Date(),
      },
    });

    const payload = {
      ok: true,
      sessao_id: sessao.id,
      titulo: sessao.titulo,
      tipo_fala: tipoFala,
      duracao_segundos: duracaoFinal,
      inicio_em: new Date(),
      orador: {
        vereador_id: vereador.id,
        usuario_id: vereador.usuarios.id,
        nome: vereador.usuarios.nome,
        foto_url: vereador.usuarios.foto_url,
        partido: vereador.partido,
        cadeira: vereador.cadeiras.numero,
      },
    };

    this.presencasGateway.emitirOradorSessaoAtualizado(payload);
    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_ORADOR_INICIADO',
      entidade: 'sessao',
      entidadeId: sessaoId,
      detalhes: {
        vereador_id: vereador.id,
        tipo_fala: tipoFala,
        duracao_segundos: duracaoFinal,
      },
      contexto,
    });
    return payload;
  }

  async limparOradorAtual(sessaoId: string, contexto?: AuditoriaContexto) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { id: true, titulo: true },
    });

    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada' };
    }

    await this.prisma.sessoes.update({
      where: { id: sessaoId },
      data: {
        orador_vereador_id: null,
        orador_tipo_fala: null,
        orador_duracao_segundos: null,
        orador_inicio_em: null,
      },
    });

    const payload = {
      ok: true,
      sessao_id: sessao.id,
      titulo: sessao.titulo,
      orador: null,
    };

    this.presencasGateway.emitirOradorSessaoAtualizado(payload);
    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_ORADOR_ENCERRADO',
      entidade: 'sessao',
      entidadeId: sessaoId,
      contexto,
    });
    return payload;
  }

  private extrairUsuarioIdDoBearer(authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('Token nao informado.');
    }
    const partes = authorization.split(' ');
    if (partes.length !== 2 || partes[0] !== 'Bearer') {
      throw new UnauthorizedException('Token invalido.');
    }
    try {
      const payload = JSON.parse(
        Buffer.from(partes[1].split('.')[1], 'base64').toString('utf-8'),
      );
      return payload.userId || payload.sub;
    } catch {
      throw new UnauthorizedException('Token invalido.');
    }
  }

  private tipoFalaCompativelComEtapa(
    etapa: string | null | undefined,
    tipoFala: TipoFalaSessaoDto,
  ) {
    if (etapa === 'PEQUENAS_COMUNICACOES') return tipoFala === 'PEQUENAS_COMUNICACOES';
    if (etapa === 'GRANDE_EXPEDIENTE') return tipoFala === 'GRANDE_EXPEDIENTE';
    if (etapa === 'ORDEM_DO_DIA') return tipoFala === 'ORDEM_DO_DIA';
    if (etapa === 'EXPLICACOES_PESSOAIS') return tipoFala === 'EXPLICACOES_PESSOAIS';
    return false;
  }

  async listarFilaOradores(sessaoId: string) {
    const fila = await this.prisma.fila_oradores.findMany({
      where: {
        sessao_id: sessaoId,
        status: {
          in: ['PENDENTE', 'CHAMADO'],
        },
      },
      orderBy: { solicitada_em: 'asc' },
      include: {
        vereadores: {
          include: {
            usuarios: true,
            cadeiras: true,
          },
        },
      },
    });

    return {
      ok: true,
      sessao_id: sessaoId,
      itens: fila.map((item) => ({
        id: item.id,
        status: item.status,
        tipo_fala: item.tipo_fala,
        solicitada_em: item.solicitada_em,
        vereador: {
          vereador_id: item.vereador_id,
          nome: item.vereadores.usuarios.nome,
          foto_url: item.vereadores.usuarios.foto_url,
          partido: item.vereadores.partido,
          cadeira: item.vereadores.cadeiras.numero,
        },
      })),
    };
  }

  async solicitarFala(
    sessaoId: string,
    tipoFala: TipoFalaSessaoDto,
    authorization: string,
  ) {
    const usuarioId = this.extrairUsuarioIdDoBearer(authorization);
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      include: { vereadores: true },
    });
    if (!usuario?.vereadores) {
      return { ok: false, mensagem: 'Usuario nao e vereador.' };
    }

    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { id: true, etapa_atual: true },
    });
    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada.' };
    }
    if (!this.tipoFalaCompativelComEtapa(sessao.etapa_atual, tipoFala)) {
      return {
        ok: false,
        mensagem:
          'Pedido de fala indisponivel para a etapa atual da sessao.',
      };
    }

    const existente = await this.prisma.fila_oradores.findFirst({
      where: {
        sessao_id: sessaoId,
        vereador_id: usuario.vereadores.id,
        status: { in: ['PENDENTE', 'CHAMADO'] },
      },
    });
    if (existente) {
      return { ok: false, mensagem: 'Voce ja esta na fila de fala.' };
    }

    await this.prisma.fila_oradores.create({
      data: {
        sessao_id: sessaoId,
        vereador_id: usuario.vereadores.id,
        tipo_fala: tipoFala as any,
      },
    });

    const fila = await this.listarFilaOradores(sessaoId);
    this.presencasGateway.emitirFilaOradoresAtualizada(fila);
    return { ok: true, mensagem: 'Solicitacao de fala registrada.' };
  }

  async planejarFala(
    sessaoId: string,
    vereadorId: string,
    tipoFala: TipoFalaSessaoDto,
    contexto?: AuditoriaContexto,
  ) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { id: true },
    });
    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada.' };
    }

    const vereador = await this.prisma.vereadores.findUnique({
      where: { id: vereadorId },
      select: { id: true },
    });
    if (!vereador) {
      return { ok: false, mensagem: 'Vereador nao encontrado.' };
    }

    const existente = await this.prisma.fila_oradores.findFirst({
      where: {
        sessao_id: sessaoId,
        vereador_id: vereadorId,
        tipo_fala: tipoFala as any,
        status: { in: ['PENDENTE', 'CHAMADO'] },
      },
    });
    if (existente) {
      return { ok: false, mensagem: 'Vereador ja esta na fila desta etapa.' };
    }

    await this.prisma.fila_oradores.create({
      data: {
        sessao_id: sessaoId,
        vereador_id: vereadorId,
        tipo_fala: tipoFala as any,
        status: 'PENDENTE',
      },
    });

    const fila = await this.listarFilaOradores(sessaoId);
    this.presencasGateway.emitirFilaOradoresAtualizada(fila);
    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_FILA_PLANEJADA',
      entidade: 'sessao',
      entidadeId: sessaoId,
      detalhes: { vereador_id: vereadorId, tipo_fala: tipoFala },
      contexto,
    });
    return { ok: true, mensagem: 'Orador planejado na fila com sucesso.' };
  }

  async chamarProximoOrador(sessaoId: string, contexto?: AuditoriaContexto) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { etapa_atual: true },
    });
    if (!sessao) {
      return { ok: false, mensagem: 'Sessao nao encontrada.' };
    }

    const tiposPermitidos: TipoFalaSessaoDto[] =
      sessao.etapa_atual === 'ORDEM_DO_DIA'
        ? ['ORDEM_DO_DIA']
        : sessao.etapa_atual === 'PEQUENAS_COMUNICACOES'
          ? ['PEQUENAS_COMUNICACOES']
          : sessao.etapa_atual === 'GRANDE_EXPEDIENTE'
            ? ['GRANDE_EXPEDIENTE']
            : sessao.etapa_atual === 'EXPLICACOES_PESSOAIS'
              ? ['EXPLICACOES_PESSOAIS']
              : [];

    if (tiposPermitidos.length === 0) {
      return {
        ok: false,
        mensagem:
          'A etapa atual da sessao nao permite chamada de orador.',
      };
    }

    const proximo = await this.prisma.fila_oradores.findFirst({
      where: {
        sessao_id: sessaoId,
        status: 'PENDENTE',
        tipo_fala: { in: tiposPermitidos as any[] },
      },
      orderBy: { solicitada_em: 'asc' },
      include: {
        vereadores: { include: { usuarios: true, cadeiras: true } },
      },
    });

    if (!proximo) {
      return { ok: false, mensagem: 'Fila sem oradores pendentes.' };
    }

    await this.prisma.fila_oradores.update({
      where: { id: proximo.id },
      data: { status: 'CHAMADO', chamada_em: new Date() },
    });

    const fala = await this.atualizarOradorAtual(
      sessaoId,
      proximo.vereador_id,
      proximo.tipo_fala as any,
      undefined,
      contexto,
    );

    const fila = await this.listarFilaOradores(sessaoId);
    this.presencasGateway.emitirFilaOradoresAtualizada(fila);
    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_CHAMAR_PROXIMO_ORADOR',
      entidade: 'sessao',
      entidadeId: sessaoId,
      detalhes: {
        vereador_id: proximo.vereador_id,
        fila_item_id: proximo.id,
      },
      contexto,
    });
    return { ok: true, fala };
  }

  async encerrarFalaAtual(sessaoId: string, contexto?: AuditoriaContexto) {
    const orador = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { orador_vereador_id: true },
    });

    if (orador?.orador_vereador_id) {
      await this.prisma.fila_oradores.updateMany({
        where: {
          sessao_id: sessaoId,
          vereador_id: orador.orador_vereador_id,
          status: 'CHAMADO',
        },
        data: { status: 'ENCERRADO' },
      });
    }

    await this.limparOradorAtual(sessaoId, contexto);
    const fila = await this.listarFilaOradores(sessaoId);
    this.presencasGateway.emitirFilaOradoresAtualizada(fila);
    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_ENCERRAR_FALA_ATUAL',
      entidade: 'sessao',
      entidadeId: sessaoId,
      contexto,
    });
    return { ok: true };
  }

  async moverItemFila(
    sessaoId: string,
    itemId: string,
    direcao: 'CIMA' | 'BAIXO',
    contexto?: AuditoriaContexto,
  ) {
    const atual = await this.prisma.fila_oradores.findFirst({
      where: { id: itemId, sessao_id: sessaoId, status: 'PENDENTE' },
    });
    if (!atual) return { ok: false, mensagem: 'Item de fila nao encontrado.' };

    const itens = await this.prisma.fila_oradores.findMany({
      where: { sessao_id: sessaoId, status: 'PENDENTE', tipo_fala: atual.tipo_fala },
      orderBy: { solicitada_em: 'asc' },
    });
    const idx = itens.findIndex((i) => i.id === itemId);
    if (idx < 0) return { ok: false, mensagem: 'Item de fila nao encontrado.' };

    const alvoIdx = direcao === 'CIMA' ? idx - 1 : idx + 1;
    if (alvoIdx < 0 || alvoIdx >= itens.length) return { ok: true, mensagem: 'Sem alteracoes.' };

    const alvo = itens[alvoIdx];
    await this.prisma.$transaction([
      this.prisma.fila_oradores.update({
        where: { id: atual.id },
        data: { solicitada_em: alvo.solicitada_em || new Date() },
      }),
      this.prisma.fila_oradores.update({
        where: { id: alvo.id },
        data: { solicitada_em: atual.solicitada_em || new Date() },
      }),
    ]);

    const fila = await this.listarFilaOradores(sessaoId);
    this.presencasGateway.emitirFilaOradoresAtualizada(fila);
    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_FILA_REORDENADA',
      entidade: 'sessao',
      entidadeId: sessaoId,
      detalhes: { item_id: itemId, direcao },
      contexto,
    });
    return { ok: true, mensagem: 'Fila reordenada com sucesso.' };
  }

  async removerItemFila(
    sessaoId: string,
    itemId: string,
    contexto?: AuditoriaContexto,
  ) {
    const item = await this.prisma.fila_oradores.findFirst({
      where: { id: itemId, sessao_id: sessaoId, status: { in: ['PENDENTE', 'CHAMADO'] } },
    });
    if (!item) return { ok: false, mensagem: 'Item de fila nao encontrado.' };

    await this.prisma.fila_oradores.update({
      where: { id: itemId },
      data: { status: 'CANCELADO' },
    });

    const fila = await this.listarFilaOradores(sessaoId);
    this.presencasGateway.emitirFilaOradoresAtualizada(fila);
    await this.auditoriaService.registrarEvento({
      acao: 'SESSAO_FILA_ITEM_REMOVIDO',
      entidade: 'sessao',
      entidadeId: sessaoId,
      detalhes: { item_id: itemId, vereador_id: item.vereador_id },
      contexto,
    });
    return { ok: true, mensagem: 'Item removido da fila.' };
  }

  private async chamarProximoAutomaticoSeDisponivel(
    sessaoId: string,
    tipoFala: TipoFalaSessaoDto,
  ) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: { id: sessaoId },
      select: { orador_vereador_id: true },
    });
    if (sessao?.orador_vereador_id) return;

    const proximo = await this.prisma.fila_oradores.findFirst({
      where: {
        sessao_id: sessaoId,
        status: 'PENDENTE',
        tipo_fala: tipoFala as any,
      },
      orderBy: { solicitada_em: 'asc' },
    });
    if (!proximo) return;

    await this.prisma.fila_oradores.update({
      where: { id: proximo.id },
      data: { status: 'CHAMADO', chamada_em: new Date() },
    });

    await this.atualizarOradorAtual(
      sessaoId,
      proximo.vereador_id,
      proximo.tipo_fala as any,
      undefined,
    );

    const fila = await this.listarFilaOradores(sessaoId);
    this.presencasGateway.emitirFilaOradoresAtualizada(fila);
  }

  private async monitorarExpiracaoFalas() {
    if (this.monitorFalasRodando) return;
    this.monitorFalasRodando = true;
    try {
      const sessoesComFala = await this.prisma.sessoes.findMany({
        where: {
          orador_vereador_id: { not: null },
          orador_inicio_em: { not: null },
          orador_duracao_segundos: { not: null },
        },
        select: {
          id: true,
          etapa_atual: true,
          orador_inicio_em: true,
          orador_duracao_segundos: true,
        },
      });

      const agora = Date.now();
      for (const sessao of sessoesComFala) {
        if (!sessao.orador_inicio_em || !sessao.orador_duracao_segundos) continue;
        const fim =
          new Date(sessao.orador_inicio_em).getTime() +
          sessao.orador_duracao_segundos * 1000;
        if (agora < fim) continue;

        await this.encerrarFalaAtual(sessao.id);
        if (
          sessao.etapa_atual === 'PEQUENAS_COMUNICACOES' ||
          sessao.etapa_atual === 'GRANDE_EXPEDIENTE' ||
          sessao.etapa_atual === 'ORDEM_DO_DIA' ||
          sessao.etapa_atual === 'EXPLICACOES_PESSOAIS'
        ) {
          await this.chamarProximoOrador(sessao.id);
        }
      }
    } finally {
      this.monitorFalasRodando = false;
    }
  }
}
