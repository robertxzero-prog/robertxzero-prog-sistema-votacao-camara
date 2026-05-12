import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { RelatoriosService } from './relatorios.service';

@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('sessoes')
  relatorioSessoes() {
    return this.relatoriosService.relatorioSessoes();
  }

  @Get('sessoes/:sessaoId')
  relatorioSessao(@Param('sessaoId') sessaoId: string) {
    return this.relatoriosService.relatorioSessao(sessaoId);
  }

  @Get('vereadores')
  relatorioVereadores() {
    return this.relatoriosService.relatorioVereadores();
  }

  @Get('sessoes/pdf')
  async baixarRelatorioSessoesPdf(@Res() res: Response) {
    const pdf = await this.relatoriosService.gerarRelatorioSessoesPdf();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="relatorio-sessoes.pdf"',
      'Content-Length': pdf.length,
    });

    res.end(pdf);
  }

  @Get('vereadores/pdf')
  async baixarRelatorioVereadoresPdf(@Res() res: Response) {
    const pdf = await this.relatoriosService.gerarRelatorioVereadoresPdf();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="relatorio-vereadores.pdf"',
      'Content-Length': pdf.length,
    });

    res.end(pdf);
  }
}
