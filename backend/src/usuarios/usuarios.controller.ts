import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { diskStorage } from 'multer';

import { extname } from 'path';

import { AuthGuard } from '@nestjs/passport';

import { UsuariosService } from './usuarios.service';
import { CreateVereadorDto } from './dto/create-vereador.dto';
import { UpdateVereadorDto } from './dto/update-vereador.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll(
    @Req() req: any,
  ) {
    console.log(req.user);

    return this.usuariosService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('vereador')
  criarVereador(
    @Body() body: CreateVereadorDto,
  ) {
    return this.usuariosService.criarVereador(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('vereador/:id')
  atualizarVereador(
    @Param('id') id: string,
    @Body() body: UpdateVereadorDto,
  ) {
    return this.usuariosService.atualizarVereador(id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/status')
  alterarStatus(
    @Param('id') id: string,
    @Body() body: { ativo: boolean },
  ) {
    return this.usuariosService.alterarStatusUsuario(
      id,
      body.ativo,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  excluirUsuario(
    @Param('id') id: string,
  ) {
    return this.usuariosService.excluirUsuario(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/foto')
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: diskStorage({
        destination: './uploads',

        filename: (req, file, callback) => {
          const nomeArquivo =
            Date.now() +
            '-' +
            Math.round(Math.random() * 1e9);

          callback(
            null,
            nomeArquivo + extname(file.originalname),
          );
        },
      }),
    }),
  )
  async uploadFoto(
    @Param('id') id: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usuariosService.salvarFotoUsuario(
      id,
      file.filename,
      req.user,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id/foto')
  removerFoto(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.usuariosService.removerFotoUsuario(id, req.user);
  }
}
