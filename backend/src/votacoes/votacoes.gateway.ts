import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class VotacoesGateway {
  @WebSocketServer()
  server!: Server;

  emitirVotacaoAtualizada(data: any) {
    this.server.emit('votacao_atualizada', data);
  }

  emitirVotoRegistrado(data: any) {
    this.server.emit('voto_registrado', data);
  }

  emitirVotacaoEncerrada(data: any) {
    this.server.emit('votacao_encerrada', data);
  }
}