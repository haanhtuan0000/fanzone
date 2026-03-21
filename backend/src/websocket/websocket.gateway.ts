import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(private redis: RedisService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_match')
  async handleJoinMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { fixtureId: number; userId?: string },
  ) {
    const room = `match:${data.fixtureId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);

    if (data.userId) {
      await this.redis.sadd(`online:${data.fixtureId}`, data.userId);
      await this.redis.expire(`online:${data.fixtureId}`, 60);
    }

    const onlineCount = await this.redis.scard(`online:${data.fixtureId}`);
    this.server.to(room).emit('online_count', { fixtureId: data.fixtureId, count: onlineCount });

    return { status: 'joined', room };
  }

  @SubscribeMessage('leave_match')
  handleLeaveMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { fixtureId: number },
  ) {
    const room = `match:${data.fixtureId}`;
    client.leave(room);
    return { status: 'left', room };
  }

  // Broadcast methods called by other services
  emitToMatch(fixtureId: number, event: string, data: any) {
    this.server.to(`match:${fixtureId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }
}
