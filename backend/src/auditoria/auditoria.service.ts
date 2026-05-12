import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrarEventoInput } from './auditoria.types';
import { createHash } from 'crypto';

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrarEvento(input: RegistrarEventoInput) {
    const ultimo = await this.prisma.auditoria_eventos.findFirst({
      orderBy: { criado_em: 'desc' },
      select: { id: true, hash_evento: true },
    });

    const payload = {
      acao: input.acao,
      entidade: input.entidade,
      entidade_id: input.entidadeId || null,
      detalhes: input.detalhes || null,
      usuario_id: input.contexto?.usuarioId || null,
      usuario_nome: input.contexto?.usuarioNome || null,
      usuario_role: input.contexto?.usuarioRole || null,
      ip: input.contexto?.ip || null,
      user_agent: input.contexto?.userAgent || null,
      hash_anterior: ultimo?.hash_evento || null,
    };

    const hashEvento = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    return this.prisma.auditoria_eventos.create({
      data: {
        acao: input.acao,
        entidade: input.entidade,
        entidade_id: input.entidadeId || null,
        detalhes: input.detalhes || undefined,
        usuario_id: input.contexto?.usuarioId || null,
        usuario_nome: input.contexto?.usuarioNome || null,
        usuario_role: input.contexto?.usuarioRole || undefined,
        ip: input.contexto?.ip || null,
        user_agent: input.contexto?.userAgent || null,
        hash_anterior: ultimo?.hash_evento || null,
        hash_evento: hashEvento,
      },
    });
  }
}
