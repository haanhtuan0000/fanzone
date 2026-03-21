import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis/redis.service';
import { ApiFootballService } from './api-football/api-football.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, ApiFootballService],
  exports: [PrismaService, RedisService, ApiFootballService],
})
export class CommonModule {}
