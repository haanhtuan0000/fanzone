import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { FeedEventType } from '@prisma/client';

@Injectable()
export class FeedService {
  constructor(
    private prisma: PrismaService,
    private ws: WebsocketGateway,
  ) {}

  async getFeed(fixtureId: number, limit: number = 50) {
    return this.prisma.feedEvent.findMany({
      where: { fixtureId },
      include: {
        user: {
          select: { id: true, displayName: true, avatarEmoji: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async createFeedEvent(data: {
    fixtureId: number;
    userId?: string;
    type: FeedEventType;
    message: string;
    coinsDelta?: number;
  }) {
    const event = await this.prisma.feedEvent.create({
      data,
      include: {
        user: { select: { id: true, displayName: true, avatarEmoji: true } },
      },
    });

    // Broadcast to all clients watching this match
    this.ws.emitToMatch(data.fixtureId, 'feed_event', {
      id: event.id,
      fixtureId: event.fixtureId,
      userId: event.userId,
      type: event.type,
      message: event.message,
      coinsDelta: event.coinsDelta,
      userDisplayName: (event as any).user?.displayName,
      userAvatarEmoji: (event as any).user?.avatarEmoji,
      createdAt: event.createdAt.toISOString(),
    });

    return event;
  }
}
