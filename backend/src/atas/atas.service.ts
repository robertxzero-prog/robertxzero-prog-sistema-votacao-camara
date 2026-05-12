import { Injectable, NotFoundException } from '@nestjs/common';
import { tipo_voto } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { createHash, createHmac } from 'crypto';
import { existsSync } from 'fs';

import { PrismaService } from '../prisma/prisma.service';

type AtaVotacao = Awaited<ReturnType<AtasService['gerarAtaVotacao']>>;

@Injectable()
export class AtasService {
  constructor(private readonly prisma: PrismaService) {}

  private calcularIntegridade(payload: Record<string, any>) {
    const canonical = JSON.stringify(payload);
    const hash = createHash('sha256').update(canonical).digest('hex');
    const assinatura = createHmac(
      'sha256',
      process.env.ATA_SIGNATURE_SECRET || 'dev-secret-change-me',
    )
      .update(hash)
      .digest('hex');

    return {
      algoritmo_hash: 'sha256',
      hash,
      assinatura_hmac: assinatura,
      assinada_em: new Date().toISOString(),
    };
  }

  private montarPayloadIntegridade(ata: Awaited<ReturnType<AtasService['gerarAtaVotacao']>>) {
    return {
      votacao_id: ata.votacao_id,
      sessao_id: ata.sessao.id,
      pauta_id: ata.pauta.id,
      encerrada_em: ata.encerrada_em,
      resultado: ata.resultado,
      quorum: ata.quorum,
      totais: ata.totais,
      votos: ata.votos.map((voto) => ({
        vereador_id: voto.vereador_id,
        voto: voto.voto,
        votado_em: voto.votado_em,
      })),
    };
  }

  async gerarAtaVotacao(votacaoId: string) {
    const votacao = await this.prisma.votacoes.findUnique({
      where: {
        id: votacaoId,
      },
      include: {
        pautas: {
          include: {
            sessoes: true,
          },
        },
        votos: {
          include: {
            vereadores: {
              include: {
                usuarios: true,
                cadeiras: true,
              },
            },
          },
          orderBy: {
            votado_em: 'asc',
          },
        },
      },
    });

    if (!votacao) {
      throw new NotFoundException('Votação não encontrada.');
    }

    const sessaoId = votacao.pautas.sessao_id;

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

    const todosVereadores = await this.prisma.vereadores.findMany({
      include: {
        usuarios: true,
        cadeiras: true,
      },
      orderBy: {
        cadeiras: {
          numero: 'asc',
        },
      },
    });

    const presentesIds = presencas.map((presenca) => presenca.vereador_id);

    const ausentes = todosVereadores.filter(
      (vereador) => !presentesIds.includes(vereador.id),
    );

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
    const presentes = presencas.length;
    const totalVereadores = 9;
    const quorumMinimo = 5;
    const tipoMaioria = votacao.pautas.tipo_maioria || 'SIMPLES';

    let votosNecessarios = Math.floor(presentes / 2) + 1;
    let resultado = 'REJEITADA';

    if (presentes < quorumMinimo) {
      votosNecessarios = quorumMinimo;
      resultado = 'SEM_QUORUM';
    } else if (tipoMaioria === 'ABSOLUTA') {
      votosNecessarios = 5;
      resultado = votosSim >= votosNecessarios ? 'APROVADA' : 'REJEITADA';
    } else if (tipoMaioria === 'DOIS_TERCOS') {
      votosNecessarios = 6;
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

    return {
      votacao_id: votacao.id,
      status: votacao.status,
      aberta_em: votacao.aberta_em,
      encerrada_em: votacao.encerrada_em,

      sessao: {
        id: votacao.pautas.sessoes.id,
        titulo: votacao.pautas.sessoes.titulo,
        descricao: votacao.pautas.sessoes.descricao,
        data_sessao: votacao.pautas.sessoes.data_sessao,
      },

      pauta: {
        id: votacao.pautas.id,
        numero_ordem: votacao.pautas.numero_ordem,
        titulo: votacao.pautas.titulo,
        descricao: votacao.pautas.descricao,
        tipo_maioria: tipoMaioria,
      },

      quorum: {
        total_vereadores: totalVereadores,
        quorum_minimo: quorumMinimo,
        presentes,
        ausentes: totalVereadores - presentes,
        quorum_atingido: presentes >= quorumMinimo,
        votos_necessarios: votosNecessarios,
      },

      totais: {
        sim: votosSim,
        nao: votosNao,
        abstencao: abstencoes,
        total: totalVotos,
      },

      resultado,

      presentes: presencas.map((presenca) => ({
        vereador_id: presenca.vereador_id,
        nome: presenca.vereadores.usuarios.nome,
        partido: presenca.vereadores.partido,
        cadeira: presenca.vereadores.cadeiras.numero,
        presente_em: presenca.presente_em,
      })),

      ausentes: ausentes.map((vereador) => ({
        vereador_id: vereador.id,
        nome: vereador.usuarios.nome,
        partido: vereador.partido,
        cadeira: vereador.cadeiras.numero,
      })),

      votos: votacao.votos.map((voto) => ({
        vereador_id: voto.vereador_id,
        nome: voto.vereadores.usuarios.nome,
        partido: voto.vereadores.partido,
        cadeira: voto.vereadores.cadeiras.numero,
        voto: voto.voto,
        votado_em: voto.votado_em,
      })),

      texto_resumo: `Na sessão "${votacao.pautas.sessoes.titulo}", foi apreciada a pauta nº ${votacao.pautas.numero_ordem}, intitulada "${votacao.pautas.titulo}". A votação foi encerrada com resultado ${resultado}, registrando ${votosSim} voto(s) SIM, ${votosNao} voto(s) NÃO e ${abstencoes} abstenção(ões), com ${presentes} vereador(es) presente(s).`,
    };
  }

  async gerarAtaVotacaoAssinada(votacaoId: string) {
    const ata = await this.gerarAtaVotacao(votacaoId);
    const payload = this.montarPayloadIntegridade(ata);
    const integridade = this.calcularIntegridade(payload);

    return {
      ...ata,
      integridade,
    };
  }

  async registrarAssinaturaOficial(votacaoId: string, assinadaPor?: string | null) {
    const ata = await this.gerarAtaVotacao(votacaoId);
    const payload = this.montarPayloadIntegridade(ata);
    const integridade = this.calcularIntegridade(payload);

    await this.prisma.atas_assinaturas.upsert({
      where: { votacao_id: votacaoId },
      create: {
        votacao_id: votacaoId,
        hash_sha256: integridade.hash,
        assinatura_hmac: integridade.assinatura_hmac,
        payload_json: payload,
        assinada_por: assinadaPor || null,
        assinada_em: new Date(),
      },
      update: {
        hash_sha256: integridade.hash,
        assinatura_hmac: integridade.assinatura_hmac,
        payload_json: payload,
        assinada_por: assinadaPor || null,
        assinada_em: new Date(),
      },
    });

    return { ok: true, integridade };
  }

  async verificarIntegridadeOficial(votacaoId: string) {
    const registro = await this.prisma.atas_assinaturas.findUnique({
      where: { votacao_id: votacaoId },
    });
    if (!registro) {
      throw new NotFoundException('Assinatura oficial da ata não encontrada.');
    }

    const ataAtual = await this.gerarAtaVotacao(votacaoId);
    const payloadAtual = this.montarPayloadIntegridade(ataAtual);
    const integridadeAtual = this.calcularIntegridade(payloadAtual);

    const hashConfere = registro.hash_sha256 === integridadeAtual.hash;
    const assinaturaConfere =
      registro.assinatura_hmac === integridadeAtual.assinatura_hmac;

    return {
      ok: true,
      valido: hashConfere && assinaturaConfere,
      hash_confere: hashConfere,
      assinatura_confere: assinaturaConfere,
      assinatura_oficial: {
        hash: registro.hash_sha256,
        assinatura_hmac: registro.assinatura_hmac,
        assinada_em: registro.assinada_em,
      },
      assinatura_atual: integridadeAtual,
    };
  }

  async gerarAtaVotacaoPdf(votacaoId: string): Promise<Buffer> {
    const ata = await this.gerarAtaVotacaoAssinada(votacaoId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.escreverAtaPdf(doc, ata);

      doc.end();
    });
  }

  private escreverAtaPdf(doc: PDFKit.PDFDocument, ata: AtaVotacao) {
    const larguraUtil =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const nomeCamara = process.env.CAMARA_NOME_OFICIAL || 'CÂMARA MUNICIPAL';
    const brasaoPath = process.env.CAMARA_BRASAO_PATH;

    if (brasaoPath && existsSync(brasaoPath)) {
      try {
        doc.image(brasaoPath, doc.page.margins.left, doc.y, {
          fit: [56, 56],
        });
        doc.y += 6;
      } catch {}
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(nomeCamara.toUpperCase(), { align: 'center' })
      .moveDown(0.25)
      .fontSize(12)
      .text('ATA OFICIAL DE VOTAÇÃO', { align: 'center' })
      .moveDown(1.5);

    this.escreverLinha(doc, 'Sessão', ata.sessao.titulo);
    this.escreverLinha(
      doc,
      'Data da sessão',
      this.formatarData(ata.sessao.data_sessao),
    );
    this.escreverLinha(
      doc,
      'Pauta',
      `${ata.pauta.numero_ordem} - ${ata.pauta.titulo}`,
    );
    this.escreverLinha(
      doc,
      'Tipo de maioria',
      this.formatarTipoMaioria(ata.pauta.tipo_maioria),
    );
    this.escreverLinha(
      doc,
      'Abertura da votação',
      this.formatarDataHora(ata.aberta_em),
    );
    this.escreverLinha(
      doc,
      'Encerramento da votação',
      this.formatarDataHora(ata.encerrada_em),
    );
    this.escreverLinha(doc, 'Resultado', this.formatarResultado(ata.resultado));

    doc.moveDown(0.75);
    this.escreverSecao(doc, 'Resumo');
    doc.font('Helvetica').fontSize(10).text(ata.texto_resumo, {
      align: 'justify',
      width: larguraUtil,
    });

    doc.moveDown(1);
    this.escreverSecao(doc, 'Quórum');
    this.escreverLinha(
      doc,
      'Total de vereadores',
      String(ata.quorum.total_vereadores),
    );
    this.escreverLinha(doc, 'Presentes', String(ata.quorum.presentes));
    this.escreverLinha(doc, 'Ausentes', String(ata.quorum.ausentes));
    this.escreverLinha(doc, 'Quórum mínimo', String(ata.quorum.quorum_minimo));
    this.escreverLinha(
      doc,
      'Quórum atingido',
      ata.quorum.quorum_atingido ? 'Sim' : 'Não',
    );
    this.escreverLinha(
      doc,
      'Votos necessários',
      String(ata.quorum.votos_necessarios),
    );

    doc.moveDown(1);
    this.escreverSecao(doc, 'Totais da votação');
    this.escreverLinha(doc, 'Votos SIM', String(ata.totais.sim));
    this.escreverLinha(doc, 'Votos NÃO', String(ata.totais.nao));
    this.escreverLinha(doc, 'Abstenções', String(ata.totais.abstencao));
    this.escreverLinha(
      doc,
      'Total de votos registrados',
      String(ata.totais.total),
    );

    doc.moveDown(1);
    this.escreverListaVereadores(doc, 'Vereadores presentes', ata.presentes);

    doc.moveDown(1);
    this.escreverListaVereadores(doc, 'Vereadores ausentes', ata.ausentes);

    doc.moveDown(1);
    this.escreverVotos(doc, ata.votos);

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i += 1) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(
          `Documento gerado em ${this.formatarDataHora(new Date())} - Página ${i + 1} de ${paginas.count}`,
          doc.page.margins.left,
          doc.page.height - 32,
          { align: 'center', width: larguraUtil },
        )
        .fillColor('#000000');
    }
  }

  private escreverSecao(doc: PDFKit.PDFDocument, titulo: string) {
    this.garantirEspaco(doc, 56);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(titulo.toUpperCase())
      .moveDown(0.35)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke()
      .moveDown(0.5);
  }

  private escreverLinha(
    doc: PDFKit.PDFDocument,
    rotulo: string,
    valor: string,
  ) {
    this.garantirEspaco(doc, 22);
    doc.font('Helvetica-Bold').fontSize(10).text(`${rotulo}: `, {
      continued: true,
    });
    doc.font('Helvetica').text(valor || '-');
  }

  private escreverListaVereadores(
    doc: PDFKit.PDFDocument,
    titulo: string,
    vereadores: Array<{
      nome: string;
      partido: string | null;
      cadeira: number;
    }>,
  ) {
    this.escreverSecao(doc, titulo);

    if (vereadores.length === 0) {
      doc.font('Helvetica').fontSize(10).text('Nenhum registro.');
      return;
    }

    vereadores.forEach((vereador) => {
      this.garantirEspaco(doc, 18);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(
          `Cadeira ${vereador.cadeira} - ${vereador.nome} (${vereador.partido || 'Sem partido'})`,
        );
    });
  }

  private escreverVotos(
    doc: PDFKit.PDFDocument,
    votos: Array<{
      nome: string;
      partido: string | null;
      cadeira: number;
      voto: tipo_voto;
      votado_em: Date | null;
    }>,
  ) {
    this.escreverSecao(doc, 'Registro nominal de votos');

    if (votos.length === 0) {
      doc.font('Helvetica').fontSize(10).text('Nenhum voto registrado.');
      return;
    }

    votos.forEach((voto) => {
      this.garantirEspaco(doc, 34);
      doc.font('Helvetica-Bold').fontSize(10).text(voto.nome, {
        continued: true,
      });
      doc
        .font('Helvetica')
        .text(` - Cadeira ${voto.cadeira} - ${voto.partido || 'Sem partido'}`);
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(
          `Voto: ${this.formatarVoto(voto.voto)} | Horário: ${this.formatarDataHora(voto.votado_em)}`,
        )
        .moveDown(0.25);
    });
  }

  private garantirEspaco(doc: PDFKit.PDFDocument, altura: number) {
    const limite = doc.page.height - doc.page.margins.bottom - 40;

    if (doc.y + altura > limite) {
      doc.addPage();
    }
  }

  private formatarData(data: Date | string | null) {
    if (!data) {
      return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(data));
  }

  private formatarDataHora(data: Date | string | null) {
    if (!data) {
      return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(data));
  }

  private formatarResultado(resultado: string) {
    const resultados: Record<string, string> = {
      APROVADA: 'Aprovada',
      REJEITADA: 'Rejeitada',
      EMPATE: 'Empate',
      SEM_QUORUM: 'Sem quórum',
    };

    return resultados[resultado] || resultado;
  }

  private formatarTipoMaioria(tipoMaioria: string) {
    const tipos: Record<string, string> = {
      SIMPLES: 'Maioria simples',
      ABSOLUTA: 'Maioria absoluta',
      DOIS_TERCOS: 'Dois terços',
    };

    return tipos[tipoMaioria] || tipoMaioria;
  }

  private formatarVoto(voto: tipo_voto) {
    const votos: Record<tipo_voto, string> = {
      SIM: 'SIM',
      NAO: 'NÃO',
      ABSTENCAO: 'ABSTENÇÃO',
      AUSENTE: 'AUSENTE',
    };

    return votos[voto] || voto;
  }
}
