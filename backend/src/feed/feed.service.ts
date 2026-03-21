import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FeedEventType } from '@prisma/client';

@Injectable()
export class FeedService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.feedEvent.create({ data });
  }
}
