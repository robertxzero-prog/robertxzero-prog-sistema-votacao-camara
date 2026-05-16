import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { CreateVereadorDto } from './dto/create-vereador.dto';
import { UpdateVereadorDto } from './dto/update-vereador.dto';

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  private async obterOuCriarCadeira(numero: number) {
    const n = Number(numero);
    if (!Number.isInteger(n) || n <= 0) {
      return null;
    }

    const existente = await this.prisma.cadeiras.findUnique({
      where: { numero: n },
    });
    if (existente) return existente;

    return this.prisma.cadeiras.create({
      data: {
        numero: n,
        linha: 1,
        coluna: n,
        descricao: `Cadeira ${n}`,
      },
    });
  }

  private async garantirCargoMesaUnico(cargoMesa: string | null, usuarioIdAtual: string) {
    if (!cargoMesa) return;
    await this.prisma.vereadores.updateMany({
      where: {
        cargo_mesa: cargoMesa as any,
        NOT: {
          usuario_id: usuarioIdAtual,
        },
      },
      data: {
        cargo_mesa: null,
      },
    });
  }

  async findAll() {
    const usuarios = await this.prisma.usuarios.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        foto_url: true,
        ativo: true,
        vereadores: {
          select: {
            id: true,
            partido: true,
            cargo_mesa: true,
            cadeira_id: true,
            usuario_id: true,
            cadeiras: {
              select: {
                id: true,
                numero: true,
                linha: true,
                coluna: true,
                descricao: true,
              },
            },
          },
        },
      },
      orderBy: {
        nome: 'asc',
      },
    });

    return usuarios.map((usuario) => ({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      foto_url: usuario.foto_url,
      ativo: usuario.ativo,

      partido: usuario.vereadores?.partido ?? '',
      cadeiraNumero: usuario.vereadores?.cadeiras?.numero ?? null,
      cargo_mesa: usuario.vereadores?.cargo_mesa ?? null,

      vereadores: usuario.vereadores
        ? {
            id: usuario.vereadores.id,
            partido: usuario.vereadores.partido,
            cargo_mesa: usuario.vereadores.cargo_mesa,
            cadeira_id: usuario.vereadores.cadeira_id,
            usuario_id: usuario.vereadores.usuario_id,
            cadeiras: usuario.vereadores.cadeiras,
          }
        : null,
    }));
  }

  async criarVereador(data: CreateVereadorDto) {
    const senhaHash = await bcrypt.hash(data.senha, 10);

    const cadeira = await this.obterOuCriarCadeira(data.cadeiraNumero);

    if (!cadeira) {
      return {
        ok: false,
        mensagem: 'Cadeira nÃ£o encontrada',
      };
    }

    const usuarioExistente = await this.prisma.usuarios.findUnique({
      where: {
        email: data.email,
      },
    });

    if (usuarioExistente) {
      return {
        ok: false,
        mensagem: 'Email jÃ¡ cadastrado',
      };
    }

    const cadeiraOcupada = await this.prisma.vereadores.findUnique({
      where: {
        cadeira_id: cadeira.id,
      },
    });

    if (cadeiraOcupada) {
      return {
        ok: false,
        mensagem: 'Cadeira jÃ¡ ocupada',
      };
    }

    const roleFinal =
      data.role === 'PRESIDENTE' || data.cargo_mesa === 'PRESIDENTE'
        ? 'PRESIDENTE'
        : 'VEREADOR';

    const usuario = await this.prisma.usuarios.create({
      data: {
        nome: data.nome,
        email: data.email,
        senha_hash: senhaHash,
        role: roleFinal,
      },
    });

    await this.garantirCargoMesaUnico(data.cargo_mesa || null, usuario.id);

    const vereador = await this.prisma.vereadores.create({
      data: {
        usuario_id: usuario.id,
        cadeira_id: cadeira.id,
        partido: data.partido,
        cargo_mesa: data.cargo_mesa || null,
      },
    });

    return {
      ok: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
      },
      vereador,
    };
  }

  async atualizarVereador(usuarioId: string, data: UpdateVereadorDto) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: usuarioId,
      },
    });

    if (!usuario) {
      return {
        ok: false,
        mensagem: 'UsuÃ¡rio nÃ£o encontrado',
      };
    }

    const vereador = await this.prisma.vereadores.findUnique({
      where: {
        usuario_id: usuarioId,
      },
    });

    if (!vereador) {
      return {
        ok: false,
        mensagem: 'Vereador nÃ£o encontrado',
      };
    }

    const cadeira = await this.obterOuCriarCadeira(data.cadeiraNumero);

    if (!cadeira) {
      return {
        ok: false,
        mensagem: 'Cadeira nÃ£o encontrada',
      };
    }

    const cadeiraOcupada = await this.prisma.vereadores.findUnique({
      where: {
        cadeira_id: cadeira.id,
      },
    });

    if (cadeiraOcupada && cadeiraOcupada.usuario_id !== usuarioId) {
      return {
        ok: false,
        mensagem: 'Cadeira jÃ¡ ocupada',
      };
    }

    const roleFinal =
      data.role === 'PRESIDENTE' || data.cargo_mesa === 'PRESIDENTE'
        ? 'PRESIDENTE'
        : 'VEREADOR';

    const usuarioUpdate: any = {
      nome: data.nome,
      email: data.email,
      ativo: data.ativo,
      role: roleFinal,
    };

    if (data.senha && data.senha.trim().length >= 4) {
      usuarioUpdate.senha_hash = await bcrypt.hash(data.senha.trim(), 10);
    }

    await this.prisma.usuarios.update({
      where: {
        id: usuarioId,
      },
      data: usuarioUpdate,
    });

    await this.garantirCargoMesaUnico(data.cargo_mesa || null, usuarioId);

    await this.prisma.vereadores.update({
      where: {
        usuario_id: usuarioId,
      },
      data: {
        partido: data.partido,
        cadeira_id: cadeira.id,
        cargo_mesa: data.cargo_mesa || null,
      },
    });

    return {
      ok: true,
      mensagem: 'Vereador atualizado com sucesso',
    };
  }

  async alterarStatusUsuario(usuarioId: string, ativo: boolean) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: usuarioId,
      },
    });

    if (!usuario) {
      return {
        ok: false,
        mensagem: 'UsuÃ¡rio nÃ£o encontrado',
      };
    }

    await this.prisma.usuarios.update({
      where: {
        id: usuarioId,
      },
      data: {
        ativo,
      },
    });

    return {
      ok: true,
      mensagem: ativo
        ? 'Vereador ativado com sucesso'
        : 'Vereador desativado com sucesso',
    };
  }

  async excluirUsuario(usuarioId: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: usuarioId,
      },
    });

    if (!usuario) {
      return {
        ok: false,
        mensagem: 'UsuÃ¡rio nÃ£o encontrado',
      };
    }

    try {
      await this.prisma.vereadores.deleteMany({
        where: {
          usuario_id: usuarioId,
        },
      });

      await this.prisma.usuarios.delete({
        where: {
          id: usuarioId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        return {
          ok: false,
          mensagem:
            'Nao foi possivel excluir. Este usuario possui registros vinculados (votos, presencas ou pautas).',
        };
      }

      throw error;
    }

    return {
      ok: true,
      mensagem: 'Vereador removido com sucesso',
    };
  }


  async salvarFotoUsuario(
    usuarioId: string,
    filename: string,
    user: { userId?: string; sub?: string; role?: string },
  ) {
    const solicitanteId = user?.userId || user?.sub;
    const role = (user?.role || '').toUpperCase();

    if (role !== 'ADMIN' && solicitanteId !== usuarioId) {
      return {
        ok: false,
        mensagem: 'Sem permissÃƒÂ£o para alterar esta foto.',
      };
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: usuarioId,
      },
    });

    if (!usuario) {
      return {
        ok: false,
        mensagem: 'UsuÃ¡rio nÃ£o encontrado',
      };
    }

    const fotoUrl = this.montarFotoUrlPublica(filename);

    await this.prisma.usuarios.update({
      where: {
        id: usuarioId,
      },
      data: {
        foto_url: fotoUrl,
      },
    });

    return {
      ok: true,
      foto_url: fotoUrl,
    };
  }

  async removerFotoUsuario(
    usuarioId: string,
    user: { userId?: string; sub?: string; role?: string },
  ) {
    const solicitanteId = user?.userId || user?.sub;
    const role = (user?.role || '').toUpperCase();

    if (role !== 'ADMIN' && solicitanteId !== usuarioId) {
      return {
        ok: false,
        mensagem: 'Sem permissÃƒÂ£o para remover esta foto.',
      };
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: usuarioId,
      },
    });

    if (!usuario) {
      return {
        ok: false,
        mensagem: 'UsuÃ¡rio nÃ£o encontrado',
      };
    }

    await this.prisma.usuarios.update({
      where: {
        id: usuarioId,
      },
      data: {
        foto_url: null,
      },
    });

    return {
      ok: true,
      mensagem: 'Foto removida com sucesso',
    };
  }

  private montarFotoUrlPublica(filename: string) {
    const apiBaseUrl = process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000';
    return `${apiBaseUrl.replace(/\/$/, '')}/uploads/${filename}`;
  }
}


