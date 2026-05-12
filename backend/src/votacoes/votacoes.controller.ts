import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VotacoesService } from './votacoes.service';
import { extrairContextoAuditoria } from '../common/request-context';

@Controller('votacoes')
export class VotacoesController {
  constructor(private readonly votacoesService: VotacoesService) {}

  @Get()
  listar() {
    return this.votacoesService.listar();
  }

  @Get('ativa')
  buscarAtiva() {
    return this.votacoesService.buscarAtiva();
  }

  @Post('abrir/:pautaId')
  @UseGuards(AuthGuard('jwt'))
  abrir(@Param('pautaId') pautaId: string, @Req() req: any) {
    const usuarioId = req.user?.userId || req.user?.sub;
    const contexto = extrairContextoAuditoria(req);

    return this.votacoesService.abrir(pautaId, usuarioId, contexto);
  }

  @Post(':id/votar')
  @UseGuards(AuthGuard('jwt'))
  votar(
    @Param('id') id: string,
    @Body() body: { voto: 'SIM' | 'NAO' | 'ABSTENCAO' },
    @Headers('authorization') authorization: string,
    @Req() req: any,
  ) {
    return this.votacoesService.votar(
      id,
      body.voto,
      authorization,
      extrairContextoAuditoria(req),
    );
  }

  @Patch(':id/encerrar')
  @UseGuards(AuthGuard('jwt'))
  encerrar(@Param('id') id: string, @Req() req: any) {
    return this.votacoesService.encerrar(id, extrairContextoAuditoria(req));
  }
}
