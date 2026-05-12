import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { PresencasService } from './presencas.service';
import { extrairContextoAuditoria } from '../common/request-context';

@Controller('presencas')
export class PresencasController {
  constructor(
    private readonly presencasService: PresencasService,
  ) {}

  @Post(':sessaoId/confirmar')
  @UseGuards(AuthGuard('jwt'))
  confirmarPresenca(
    @Param('sessaoId') sessaoId: string,
    @Headers('authorization') authorization: string,
    @Req() req: any,
  ) {
    return this.presencasService.confirmarPresenca(
      sessaoId,
      authorization,
      extrairContextoAuditoria(req),
    );
  }

  @Get(':sessaoId')
  listarPresencas(
    @Param('sessaoId') sessaoId: string,
  ) {
    return this.presencasService.listarPresencas(
      sessaoId,
    );
  }

  @Get(':sessaoId/quorum')
  calcularQuorum(
    @Param('sessaoId') sessaoId: string,
  ) {
    return this.presencasService.calcularQuorum(
      sessaoId,
    );
  }
}
