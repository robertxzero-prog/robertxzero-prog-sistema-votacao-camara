import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auditoria')
@UseGuards(AuthGuard('jwt'))
export class AuditoriaController {
  constructor(private readonly prisma: PrismaService) {}

  private exigirAdmin(req: any) {
    if (req?.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito ao administrador.');
    }
  }

  @Get()
  async listar(
    @Req() req: any,
    @Query('acao') acao?: string,
    @Query('entidade') entidade?: string,
    @Query('limite') limiteRaw?: string,
  ) {
    this.exigirAdmin(req);
    const limite = Math.min(Math.max(Number(limiteRaw || 100), 1), 500);
    const itens = await this.prisma.auditoria_eventos.findMany({
      where: {
        acao: acao || undefined,
        entidade: entidade || undefined,
      },
      orderBy: { criado_em: 'desc' },
      take: limite,
    });

    return { ok: true, itens };
  }
}
