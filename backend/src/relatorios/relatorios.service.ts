import { Injectable, NotFoundException } from '@nestjs/common';
import { tipo_voto } from '@prisma/client';
import PDFDocument from 'pdfkit';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  async relatorioSessoes() {
    const sessoes = await this.prisma.sessoes.findMany({
      orderBy: {
        data_sessao: 'desc',
      },
      include: {
        pautas: {
          include: {
            votacoes: {
              include: {
                votos: true,
              },
            },
          },
          orderBy: {
            numero_ordem: 'asc',
          },
        },
        presencas: true,
      },
    });

    return sessoes.map((sessao) => this.montarResumoSessao(sessao));
  }

  async relatorioSessao(sessaoId: string) {
    const sessao = await this.prisma.sessoes.findUnique({
      where: {
        id: sessaoId,
      },
      include: {
        pautas: {
          include: {
            votacoes: {
              include: {
                votos: {
                  include: {
                    vereadores: {
                      include: {
                        usuarios: true,
                        cadeiras: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            numero_ordem: 'asc',
          },
        },
        presencas: {
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
        },
      },
    });

    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada.');
    }

    return {
      ...this.montarResumoSessao(sessao),
      presencas: sessao.presencas.map((presenca) => ({
        vereador_id: presenca.vereador_id,
        nome: presenca.vereadores.usuarios.nome,
        partido: presenca.vereadores.partido,
        cadeira: presenca.vereadores.cadeiras.numero,
        presente_em: presenca.presente_em,
      })),
      pautas: sessao.pautas.map((pauta) => ({
        id: pauta.id,
        numero_ordem: pauta.numero_ordem,
        titulo: pauta.titulo,
        tipo_maioria: pauta.tipo_maioria,
        votacoes: pauta.votacoes.map((votacao) => ({
          id: votacao.id,
          status: votacao.status,
          aberta_em: votacao.aberta_em,
          encerrada_em: votacao.encerrada_em,
          totais: this.contarVotos(votacao.votos),
          votos: votacao.votos.map((voto) => ({
            vereador_id: voto.vereador_id,
            nome: voto.vereadores.usuarios.nome,
            partido: voto.vereadores.partido,
            cadeira: voto.vereadores.cadeiras.numero,
            voto: voto.voto,
            votado_em: voto.votado_em,
          })),
        })),
      })),
    };
  }

  async relatorioVereadores() {
    const vereadores = await this.prisma.vereadores.findMany({
      include: {
        usuarios: true,
        cadeiras: true,
        votos: {
          include: {
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
        },
        presencas: {
          include: {
            sessoes: true,
          },
        },
      },
      orderBy: {
        cadeiras: {
          numero: 'asc',
        },
      },
    });

    return vereadores.map((vereador) => {
      const totais = this.contarVotos(vereador.votos);

      return {
        vereador_id: vereador.id,
        nome: vereador.usuarios.nome,
        email: vereador.usuarios.email,
        partido: vereador.partido,
        cadeira: vereador.cadeiras.numero,
        presencas: vereador.presencas.length,
        votos: totais,
        total_votacoes_participadas: vereador.votos.length,
      };
    });
  }

  async gerarRelatorioSessoesPdf(): Promise<Buffer> {
    const sessoes = await this.relatorioSessoes();

    return await new Promise((resolve) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 42,
      });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fontSize(18).text('Relatorio de Sessoes', { align: 'center' });
      doc.moveDown(0.4);
      doc
        .fontSize(10)
        .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, {
          align: 'right',
        });
      doc.moveDown();

      if (sessoes.length === 0) {
        doc.fontSize(12).text('Nenhuma sessao encontrada.');
      } else {
        sessoes.forEach((sessao: any, index) => {
          if (index > 0) {
            doc.moveDown();
            doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).strokeColor('#dddddd').stroke();
            doc.moveDown(0.8);
          }

          doc
            .fontSize(13)
            .fillColor('#111111')
            .text(`${sessao.titulo} (${this.formatarData(sessao.data_sessao)})`);
          doc.fontSize(10).fillColor('#333333').text(`Status: ${sessao.status}`);
          doc.text(`Pautas: ${sessao.total_pautas}`);
          doc.text(
            `Votacoes: ${sessao.votacoes_encerradas}/${sessao.total_votacoes}`,
          );
          doc.text(`Presencas: ${sessao.presencas}`);
          doc.text(
            `Votos totais: ${sessao.totais_votos.total} (SIM ${sessao.totais_votos.sim}, NAO ${sessao.totais_votos.nao}, ABS ${sessao.totais_votos.abstencao})`,
          );
        });
      }

      doc.end();
    });
  }

  async gerarRelatorioVereadoresPdf(): Promise<Buffer> {
    const vereadores = await this.relatorioVereadores();

    return await new Promise((resolve) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 42,
      });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fontSize(18).text('Relatorio de Vereadores', { align: 'center' });
      doc.moveDown(0.4);
      doc
        .fontSize(10)
        .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, {
          align: 'right',
        });
      doc.moveDown();

      if (vereadores.length === 0) {
        doc.fontSize(12).text('Nenhum vereador encontrado.');
      } else {
        vereadores.forEach((vereador: any, index) => {
          if (index > 0) {
            doc.moveDown();
            doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).strokeColor('#dddddd').stroke();
            doc.moveDown(0.8);
          }

          doc
            .fontSize(13)
            .fillColor('#111111')
            .text(`${vereador.nome} - Cadeira ${vereador.cadeira}`);
          doc
            .fontSize(10)
            .fillColor('#333333')
            .text(`Partido: ${vereador.partido || 'Sem partido'}`);
          doc.text(`Email: ${vereador.email}`);
          doc.text(`Presencas: ${vereador.presencas}`);
          doc.text(`Votacoes participadas: ${vereador.total_votacoes_participadas}`);
          doc.text(
            `Votos: SIM ${vereador.votos.sim}, NAO ${vereador.votos.nao}, ABS ${vereador.votos.abstencao}, TOTAL ${vereador.votos.total}`,
          );
        });
      }

      doc.end();
    });
  }

  private montarResumoSessao(sessao: any) {
    const votacoes = sessao.pautas.flatMap((pauta) => pauta.votacoes);
    const votos = votacoes.flatMap((votacao) => votacao.votos);
    const votacoesEncerradas = votacoes.filter(
      (votacao) => votacao.status === 'ENCERRADA',
    );

    return {
      id: sessao.id,
      titulo: sessao.titulo,
      descricao: sessao.descricao,
      data_sessao: sessao.data_sessao,
      status: sessao.status,
      total_pautas: sessao.pautas.length,
      total_votacoes: votacoes.length,
      votacoes_encerradas: votacoesEncerradas.length,
      presencas: sessao.presencas.length,
      totais_votos: this.contarVotos(votos),
    };
  }

  private contarVotos(votos: Array<{ voto: tipo_voto }>) {
    return {
      sim: votos.filter((voto) => voto.voto === tipo_voto.SIM).length,
      nao: votos.filter((voto) => voto.voto === tipo_voto.NAO).length,
      abstencao: votos.filter((voto) => voto.voto === tipo_voto.ABSTENCAO)
        .length,
      ausente: votos.filter((voto) => voto.voto === tipo_voto.AUSENTE).length,
      total: votos.length,
    };
  }

  private formatarData(data: string | Date) {
    return new Date(data).toLocaleDateString('pt-BR');
  }
}
