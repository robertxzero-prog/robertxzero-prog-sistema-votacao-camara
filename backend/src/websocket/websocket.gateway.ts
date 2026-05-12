import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketGateway {
  @WebSocketServer()
  server!: Server;

  private votos = {
    SIM: 0,
    NAO: 0,
    ABSTENCAO: 0,
  };

  private votosPorVereador = new Map<string, string>();

  constructor(
  private jwtService: JwtService,
  private prisma: PrismaService,
) {}

  handleConnection(client: Socket) {
    console.log('Cliente conectado:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('Cliente desconectado:', client.id);
  }

  @SubscribeMessage('abrir_votacao')
  abrirVotacao(@MessageBody() data: any) {
    console.log('Votação aberta:', data);

    this.votos = {
      SIM: 0,
      NAO: 0,
      ABSTENCAO: 0,
    };

    this.votosPorVereador.clear();

    this.server.emit('votacao_aberta', {
      pautaId: data.pautaId,
      titulo: data.titulo,
      mensagem: 'Votação aberta',
    });

    return {
      ok: true,
      evento: 'votacao_aberta',
    };
  }

  @SubscribeMessage('votar')
async votar(
  @MessageBody() data: any,
  @ConnectedSocket() client: Socket,
) {
  try {
    const token = data.token;
    const votacaoId = data.votacaoId;
    const voto = data.voto;

    if (!token) {
      return {
        ok: false,
        mensagem: 'Token obrigatório',
      };
    }

    if (!votacaoId) {
      return {
        ok: false,
        mensagem: 'votacaoId obrigatório',
      };
    }

    if (!voto) {
      return {
        ok: false,
        mensagem: 'Voto obrigatório',
      };
    }

    const usuario = this.jwtService.verify(token, {
      secret: 'camara-secret-key',
    });

    if (usuario.role !== 'VEREADOR') {
      return {
        ok: false,
        mensagem: 'Apenas vereadores podem votar',
      };
    }

    const vereador = await this.prisma.vereadores.findUnique({
      where: {
        usuario_id: usuario.sub,
      },
    });

    if (!vereador) {
      return {
        ok: false,
        mensagem: 'Vereador não encontrado',
      };
    }

    const votoExistente = await this.prisma.votos.findFirst({
      where: {
        votacao_id: votacaoId,
        vereador_id: vereador.id,
      },
    });

    if (votoExistente) {
      return {
        ok: false,
        mensagem: 'Vereador já votou nesta votação',
      };
    }

    await this.prisma.votos.create({
      data: {
        votacao_id: votacaoId,
        vereador_id: vereador.id,
        voto,
      },
    });

    const resultado = await this.prisma.votos.groupBy({
      by: ['voto'],
      where: {
        votacao_id: votacaoId,
      },
      _count: {
        voto: true,
      },
    });

    const votos = {
      SIM: 0,
      NAO: 0,
      ABSTENCAO: 0,
      AUSENTE: 0,
    };

    for (const item of resultado) {
      votos[item.voto] = item._count.voto;
    }

    console.log('Voto salvo no banco:', {
      socketId: client.id,
      nome: usuario.nome,
      voto,
    });

    this.server.emit('resultado_parcial', {
      votacaoId,
      votos,
      ultimoVoto: {
        vereadorId: vereador.id,
        nome: usuario.nome,
        voto,
      },
    });

    return {
      ok: true,
      votos,
    };
  } catch (error) {
    console.log(error);

    return {
      ok: false,
      mensagem: 'Erro ao registrar voto',
    };
  }
}

  @SubscribeMessage('encerrar_votacao')
  encerrarVotacao() {
    console.log('Votação encerrada');

    this.server.emit('votacao_encerrada', {
      mensagem: 'Votação encerrada',
      resultado: this.votos,
    });

    return {
      ok: true,
      resultado: this.votos,
    };
  }
}