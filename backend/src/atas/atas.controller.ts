import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { AtasService } from './atas.service';

@Controller('atas')
export class AtasController {
  constructor(private readonly atasService: AtasService) {}

  @Get('votacao/:votacaoId')
  gerarAtaVotacao(@Param('votacaoId') votacaoId: string) {
    return this.atasService.gerarAtaVotacaoAssinada(votacaoId);
  }

  @Get('votacao/:votacaoId/verificar')
  verificarIntegridade(@Param('votacaoId') votacaoId: string) {
    return this.atasService.verificarIntegridadeOficial(votacaoId);
  }

  @Get('votacao/:votacaoId/pdf')
  async baixarAtaVotacaoPdf(
    @Param('votacaoId') votacaoId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.atasService.gerarAtaVotacaoPdf(votacaoId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ata-votacao-${votacaoId}.pdf"`,
      'Content-Length': pdf.length,
    });

    res.end(pdf);
  }
}
