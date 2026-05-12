import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class PresencasGateway {
  @WebSocketServer()
  server!: Server;

  emitirPresencaAtualizada(data: any) {
    this.server.emit('presenca_atualizada', data);
  }

  emitirEtapaSessaoAtualizada(data: any) {
    this.server.emit('sessao_etapa_atualizada', data);
  }

  emitirOradorSessaoAtualizado(data: any) {
    this.server.emit('sessao_orador_atualizado', data);
  }

  emitirFilaOradoresAtualizada(data: any) {
    this.server.emit('sessao_fila_oradores_atualizada', data);
  }
}
