import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { SessoesService } from './sessoes.service';
import { extrairContextoAuditoria } from '../common/request-context';

import { CreateSessaoDto } from './dto/create-sessao.dto';
import { UpdateSessaoDto } from './dto/update-sessao.dto';
import { UpdateEtapaSessaoDto } from './dto/update-etapa-sessao.dto';
import { UpdateOradorSessaoDto } from './dto/update-orador-sessao.dto';
import { SolicitarFalaDto } from './dto/solicitar-fala.dto';
import { PlanejarFalaDto } from './dto/planejar-fala.dto';

@Controller('sessoes')
export class SessoesController {
  constructor(
    private readonly sessoesService: SessoesService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.sessoesService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  criarSessao(
    @Req() req: any,
    @Body() body: CreateSessaoDto,
  ) {
    return this.sessoesService.criarSessao(
      req.user.userId,
      body,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  atualizarSessao(
    @Param('id') id: string,
    @Body() body: UpdateSessaoDto,
  ) {
    return this.sessoesService.atualizarSessao(
      id,
      body,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  excluirSessao(
    @Param('id') id: string,
  ) {
    return this.sessoesService.excluirSessao(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/encerrar')
  encerrarSessao(@Param('id') id: string, @Req() req: any) {
    return this.sessoesService.encerrarSessao(
      id,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/etapa')
  buscarEtapaAtual(@Param('id') id: string) {
    return this.sessoesService.buscarEtapaAtual(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/etapa')
  atualizarEtapaAtual(
    @Param('id') id: string,
    @Body() body: UpdateEtapaSessaoDto,
    @Req() req: any,
  ) {
    return this.sessoesService.atualizarEtapaAtual(
      id,
      body.etapa,
      body.titulo,
      body.descricao,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/orador')
  buscarOradorAtual(@Param('id') id: string) {
    return this.sessoesService.buscarOradorAtual(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/orador')
  atualizarOradorAtual(
    @Param('id') id: string,
    @Body() body: UpdateOradorSessaoDto,
    @Req() req: any,
  ) {
    return this.sessoesService.atualizarOradorAtual(
      id,
      body.vereador_id,
      body.tipo_fala,
      body.duracao_segundos,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id/orador')
  limparOradorAtual(@Param('id') id: string, @Req() req: any) {
    return this.sessoesService.limparOradorAtual(
      id,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/fila-oradores')
  listarFila(@Param('id') id: string) {
    return this.sessoesService.listarFilaOradores(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/fila-oradores/solicitar')
  solicitarFala(
    @Param('id') id: string,
    @Body() body: SolicitarFalaDto,
    @Headers('authorization') authorization: string,
  ) {
    return this.sessoesService.solicitarFala(
      id,
      body.tipo_fala as any,
      authorization,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/fila-oradores/planejar')
  planejarFala(
    @Param('id') id: string,
    @Body() body: PlanejarFalaDto,
    @Req() req: any,
  ) {
    return this.sessoesService.planejarFala(
      id,
      body.vereador_id,
      body.tipo_fala,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/fila-oradores/chamar-proximo')
  chamarProximo(@Param('id') id: string, @Req() req: any) {
    return this.sessoesService.chamarProximoOrador(
      id,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/fila-oradores/encerrar-fala')
  encerrarFala(@Param('id') id: string, @Req() req: any) {
    return this.sessoesService.encerrarFalaAtual(
      id,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/fila-oradores/:itemId/mover')
  moverItemFila(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { direcao: 'CIMA' | 'BAIXO' },
    @Req() req: any,
  ) {
    return this.sessoesService.moverItemFila(
      id,
      itemId,
      body?.direcao,
      extrairContextoAuditoria(req),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id/fila-oradores/:itemId')
  removerItemFila(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Req() req: any,
  ) {
    return this.sessoesService.removerItemFila(
      id,
      itemId,
      extrairContextoAuditoria(req),
    );
  }
}
