import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { PautasService } from './pautas.service';

import { CreatePautaDto } from './dto/create-pauta.dto';
import { UpdatePautaDto } from './dto/update-pauta.dto';

@Controller('pautas')
export class PautasController {
  constructor(
    private readonly pautasService: PautasService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.pautasService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  criarPauta(
    @Req() req: any,
    @Body() body: CreatePautaDto,
  ) {
    return this.pautasService.criarPauta(
      req.user.userId,
      body,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  atualizarPauta(
    @Param('id') id: string,
    @Body() body: UpdatePautaDto,
  ) {
    return this.pautasService.atualizarPauta(
      id,
      body,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  excluirPauta(
    @Param('id') id: string,
  ) {
    return this.pautasService.excluirPauta(id);
  }
}